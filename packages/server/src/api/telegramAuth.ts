import crypto from "node:crypto";

export interface TelegramWebAppUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export interface InitDataResult {
  ok: boolean;
  user?: TelegramWebAppUser;
  reason?: string;
}

/**
 * Validate Telegram Mini App initData per the documented algorithm:
 *   secret = HMAC_SHA256(key="WebAppData", data=botToken)
 *   hash   = HMAC_SHA256(key=secret, data=dataCheckString)
 */
// ⏰ maxAgeSec (ega, 2026-07-29: «keshni har kun tozalayman, o'zi ishlab yana ishlamay
// qoladi»): Telegram Mini App'ga initData BIR MARTA, ochilganda beriladi (`auth_date`).
// Telefon WebView'ni fonda tirik saqlab qolsa, bu imzo YANGILANMAYDI — eski 86400s (24 soat)
// chegarasi aynan shu sababdan har kuni "expired" berib, mijozni jimgina mehmon holatiga
// tushirib qo'ygan (hech qanday tushunarli xato ko'rsatmasdan). 7 kunga ko'tarildi: odatiy
// foydalanish naqshiga (ilova kunlab qayta ochilmasdan fonda turishi) mos, imzo baribir
// HMAC bilan tekshiriladi — faqat REPLAY OYNASI kengayadi, autentifikatsiyaning o'zi emas.
export function validateInitData(initData: string, botToken: string, maxAgeSec = 604_800): InitDataResult {
  if (!initData) return { ok: false, reason: "empty initData" };
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return { ok: false, reason: "no hash" };

  const secret = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const checkString = (excludeSignature: boolean): string => {
    const pairs: string[] = [];
    params.forEach((value, key) => {
      if (key === "hash") return;
      if (excludeSignature && key === "signature") return;
      pairs.push(`${key}=${value}`);
    });
    return pairs.sort().join("\n");
  };
  const hmac = (s: string) => crypto.createHmac("sha256", secret).update(s).digest("hex");
  // Accept either interpretation: signature included (spec) or excluded.
  if (hmac(checkString(false)) !== hash && hmac(checkString(true)) !== hash) {
    return { ok: false, reason: `bad signature (keys: ${[...params.keys()].sort().join(",")})` };
  }

  const authDate = Number(params.get("auth_date") ?? 0);
  if (maxAgeSec > 0 && authDate > 0) {
    const ageSec = Math.floor(Date.now() / 1000) - authDate;
    if (ageSec > maxAgeSec) return { ok: false, reason: "expired" };
  }

  try {
    const userRaw = params.get("user");
    const user = userRaw ? (JSON.parse(userRaw) as TelegramWebAppUser) : undefined;
    return { ok: true, user };
  } catch {
    return { ok: true };
  }
}

// ── 📱 requestContact (Bot API 6.9+) ──────────────────────────────────────────
export interface WebAppContact {
  user_id: number;
  phone_number: string;
  first_name?: string;
  last_name?: string;
}

export interface ContactResult {
  ok: boolean;
  contact?: WebAppContact;
  reason?: string;
}

/**
 * Mini App'dagi `WebApp.requestContact()` javobini tekshiradi.
 *
 * Klient `{ status:"sent", response:"<query-string>", hash:"<hex>" }` qaytaradi; `response` ichida
 * `contact=<json>&auth_date=<unix>` (ba'zi klientlar `hash` ni ham SHU string ichiga qo'yadi).
 * Imzo initData bilan AYNI algoritm: secret = HMAC_SHA256("WebAppData", botToken),
 * hash = HMAC_SHA256(secret, dataCheckString) — kalitlar alifbo bo'yicha, `k=v` lar \n bilan.
 *
 * BU IMZO — YAGONA IDENTIFIKATSIYA ISBOTI. Usiz mijoz istalgan raqamni yuborib begona hisobga
 * ulanib olardi (bot tomonidagi `contact.user_id !== ctx.from.id` tekshiruvining ekvivalenti).
 * Shubha bo'lsa — RAD (fail closed). maxAge qisqa: bu jonli, interaktiv harakat, 1 soat yetarli.
 */
export function validateContactResponse(
  response: string,
  outerHash: string | null,
  botToken: string,
  maxAgeSec = 3600,
): ContactResult {
  if (!response) return { ok: false, reason: "empty response" };
  if (!botToken) return { ok: false, reason: "no bot token" };
  const params = new URLSearchParams(response);
  const hash = outerHash || params.get("hash");
  if (!hash) return { ok: false, reason: "no hash" };

  const secret = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const pairs: string[] = [];
  params.forEach((value, key) => {
    if (key === "hash") return;
    pairs.push(`${key}=${value}`);
  });
  const expected = crypto.createHmac("sha256", secret).update(pairs.sort().join("\n")).digest("hex");
  if (expected !== hash) return { ok: false, reason: `bad signature (keys: ${[...params.keys()].sort().join(",")})` };

  const authDate = Number(params.get("auth_date") ?? 0);
  if (maxAgeSec > 0 && authDate > 0 && Math.floor(Date.now() / 1000) - authDate > maxAgeSec) {
    return { ok: false, reason: "expired" };
  }

  try {
    const raw = params.get("contact");
    if (!raw) return { ok: false, reason: "no contact" };
    const contact = JSON.parse(raw) as WebAppContact;
    if (!contact?.phone_number || !contact?.user_id) return { ok: false, reason: "incomplete contact" };
    return { ok: true, contact };
  } catch {
    return { ok: false, reason: "bad contact json" };
  }
}
