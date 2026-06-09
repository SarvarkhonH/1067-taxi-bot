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
export function validateInitData(initData: string, botToken: string, maxAgeSec = 86400): InitDataResult {
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
