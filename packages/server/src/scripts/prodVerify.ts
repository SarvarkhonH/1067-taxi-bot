// End-to-end PROD check: signs initData for the owner and hits the LIVE
// engagement endpoints. Usage: tsx prodVerify.ts
import "../env";
import crypto from "node:crypto";
import { env } from "../env";

const ownerId = process.argv[2] ?? "6506297119";
const base = "https://api.birjoy.online";

function sign(): string {
  const user = JSON.stringify({ id: Number(ownerId), first_name: "Sarvarxon", username: "Sarvarxonh" });
  const params = new URLSearchParams({ user, auth_date: String(Math.floor(Date.now() / 1000)), query_id: "AAEverify" });
  const dcs = [...params.entries()]
    .filter(([k]) => k !== "hash" && k !== "signature")
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join("\n");
  const secret = crypto.createHmac("sha256", "WebAppData").update(env.BOT_TOKEN).digest();
  params.set("hash", crypto.createHmac("sha256", secret).update(dcs).digest("hex"));
  return params.toString();
}

const h = { "X-Telegram-Init-Data": sign() };

async function hit(path: string): Promise<void> {
  const res = await fetch(`${base}${path}`, { headers: h });
  const body = await res.json().catch(() => ({}));
  console.log(`\n${res.status === 200 ? "✅" : "❌"} GET ${path} → ${res.status}`);
  console.log("   " + JSON.stringify(body).slice(0, 320));
}

await hit("/api/missions");
await hit("/api/referral");
await hit("/api/box");
await hit("/api/weekly");
await hit("/api/wallet");
await hit("/api/me");
process.exit(0);
