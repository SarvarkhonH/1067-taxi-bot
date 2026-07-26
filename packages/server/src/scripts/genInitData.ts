// Generates a VALID Telegram initData (signed with the bot token) and calls the
// live Render API — proves the Mini App auth path works end-to-end.
import "../env";
import crypto from "node:crypto";
import { env } from "../env";

const target = process.argv[2] ?? "https://api.birjoy.online";
const userId = Number(process.argv[3] ?? 7777777);
const path = process.argv[4] ?? "/api/me";
const user = JSON.stringify({ id: userId, first_name: "Test", username: "tester" });
const authDate = Math.floor(Date.now() / 1000);

// include a `signature` field like real Telegram — it must be EXCLUDED from the hash
const params = new URLSearchParams({ user, auth_date: String(authDate), query_id: "AAEtest", signature: "ed25519_test_sig_abc123" });
const dcs = [...params.entries()]
  .filter(([k]) => k !== "hash" && k !== "signature")
  .map(([k, v]) => `${k}=${v}`)
  .sort()
  .join("\n");
const secret = crypto.createHmac("sha256", "WebAppData").update(env.BOT_TOKEN).digest();
params.set("hash", crypto.createHmac("sha256", secret).update(dcs).digest("hex"));
const initData = params.toString();

if (path === "PRINT") {
  console.log("INITDATA=" + initData);
  process.exit(0);
}

console.log(`GET ${target}${path} as user ${userId} with signed initData…`);
const res = await fetch(`${target}${path}`, { headers: { "X-Telegram-Init-Data": initData } });
console.log("status:", res.status);
console.log("body:", (await res.text()).slice(0, 300));
process.exit(0);
