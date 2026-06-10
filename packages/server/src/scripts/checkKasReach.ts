// One-off: does the Render bot still reach kas1067 after the UZB-only geo-deny?
// Signs owner initData, reads last sync time, forces a live sync, re-reads.
import "../env";
import crypto from "node:crypto";
import { env } from "../env";

const base = "https://kas1067-taxi-bot.onrender.com";
const ownerId = "6506297119";

function sign(): string {
  const user = JSON.stringify({ id: Number(ownerId), first_name: "Sarvarxon", username: "Sarvarxonh" });
  const params = new URLSearchParams({ user, auth_date: String(Math.floor(Date.now() / 1000)), query_id: "AAEcheck" });
  const dcs = [...params.entries()].filter(([k]) => k !== "hash" && k !== "signature").map(([k, v]) => `${k}=${v}`).sort().join("\n");
  const secret = crypto.createHmac("sha256", "WebAppData").update(env.BOT_TOKEN).digest();
  params.set("hash", crypto.createHmac("sha256", secret).update(dcs).digest("hex"));
  return params.toString();
}

const h = { "X-Telegram-Init-Data": sign(), "Content-Type": "application/json" };

async function getJson(path: string, method = "GET"): Promise<{ status: number; body: any }> {
  const res = await fetch(`${base}${path}`, { method, headers: h });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

const fmtAgo = (iso: any): string => {
  if (!iso) return "hech qachon";
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.round(ms / 60000);
  return `${iso}  (${min} daqiqa oldin)`;
};

console.log("1) Sinxrondan OLDIN — admin stats:");
const before = await getJson("/api/admin/stats");
console.log("   status:", before.status);
console.log("   lastSync:", fmtAgo(before.body?.lastSync ?? before.body?.lastSyncAt));
console.log("   members:", before.body?.totalMembers ?? "-", "| body:", JSON.stringify(before.body).slice(0, 200));

console.log("\n2) Render'da JONLI sinxronni majburlash (kas1067'ga ulanadi)...");
const t0 = Date.now();
const sync = await getJson("/api/admin/sync", "POST");
console.log(`   status: ${sync.status}  (${Date.now() - t0} ms)`);
console.log("   natija:", JSON.stringify(sync.body).slice(0, 300));

console.log("\n3) Sinxrondan KEYIN — admin stats:");
const after = await getJson("/api/admin/stats");
console.log("   lastSync:", fmtAgo(after.body?.lastSync ?? after.body?.lastSyncAt));

console.log("\n=== XULOSA ===");
if (sync.status === 200 && !sync.body?.error) {
  console.log("✅ Render kas1067'ga YETYAPTI — geo-deny bot'ni bloklamagan. Sinxron ishladi.");
} else {
  console.log("🔴 Render kas1067'ga ULANA OLMAYAPTI — geo-deny Render IP'sini bloklagan.");
  console.log("   Xato:", JSON.stringify(sync.body));
}
process.exit(0);
