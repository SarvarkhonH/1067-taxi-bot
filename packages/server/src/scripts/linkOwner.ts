// Links the owner's telegram id to a client (via the live admin endpoint) so they
// can SEE the gamified features. Usage: tsx linkOwner.ts [clientPhone]
import "../env";
import crypto from "node:crypto";
import { env } from "../env";

const ownerId = "6506297119";
const clientPhone = process.argv[2] ?? "+998973165311";
const base = "https://api.birjoy.online";

function sign(): string {
  const user = JSON.stringify({ id: Number(ownerId), first_name: "Sarvarxon", username: "Sarvarxonh" });
  const params = new URLSearchParams({ user, auth_date: String(Math.floor(Date.now() / 1000)), query_id: "AAEadmin" });
  const dcs = [...params.entries()].filter(([k]) => k !== "hash" && k !== "signature").map(([k, v]) => `${k}=${v}`).sort().join("\n");
  const secret = crypto.createHmac("sha256", "WebAppData").update(env.BOT_TOKEN).digest();
  params.set("hash", crypto.createHmac("sha256", secret).update(dcs).digest("hex"));
  return params.toString();
}

const initData = sign();
const link = await fetch(`${base}/api/admin/link`, {
  method: "POST",
  headers: { "X-Telegram-Init-Data": initData, "Content-Type": "application/json" },
  body: JSON.stringify({ telegramId: ownerId, phone: clientPhone }),
});
console.log("link result:", link.status, await link.text());

const me = await fetch(`${base}/api/me`, { headers: { "X-Telegram-Init-Data": initData } });
console.log("me after link:", me.status, JSON.stringify(await me.json()).slice(0, 450));
process.exit(0);
