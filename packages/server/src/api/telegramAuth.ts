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

  // data-check-string excludes `hash` and `signature` (signature is the separate
  // Ed25519 third-party field, NOT part of the bot-token HMAC).
  const pairs: string[] = [];
  params.forEach((value, key) => {
    if (key !== "hash" && key !== "signature") pairs.push(`${key}=${value}`);
  });
  pairs.sort();
  const dataCheckString = pairs.join("\n");

  const secret = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const computed = crypto.createHmac("sha256", secret).update(dataCheckString).digest("hex");
  if (computed !== hash) return { ok: false, reason: "bad signature" };

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
