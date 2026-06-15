// DIAG: does the owner-preview get booking3:true on LIVE FRA? And a non-owner false?
// Read-only (GET). Run: tsx src/scripts/diagOwnerFlow.ts
import "../env";
import crypto from "node:crypto";
import { env } from "../env";

const base = "https://kas1067-taxi-fra.onrender.com";

function sign(id: string): string {
  const user = JSON.stringify({ id: Number(id), first_name: "Test", username: "t" });
  const params = new URLSearchParams({ user, auth_date: String(Math.floor(Date.now() / 1000)), query_id: "AAEdiag" });
  const dcs = [...params.entries()].filter(([k]) => k !== "hash").map(([k, v]) => `${k}=${v}`).sort().join("\n");
  const secret = crypto.createHmac("sha256", "WebAppData").update(env.BOT_TOKEN).digest();
  params.set("hash", crypto.createHmac("sha256", secret).update(dcs).digest("hex"));
  return params.toString();
}

async function check(label: string, id: string): Promise<void> {
  const res = await fetch(`${base}/api/booking/info`, { headers: { "X-Telegram-Init-Data": sign(id) } });
  const b = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  console.log(`\n[${label}] id=${id} → ${res.status}`);
  console.log(`  booking3 = ${JSON.stringify(b.booking3)}  (true => NEW flow, false/undefined => OLD flow)`);
  console.log(`  has error? ${"error" in b ? JSON.stringify(b.error) : "no"} · center=${JSON.stringify(b.center)} · tariff=${JSON.stringify(b.tariff)}`);
}

async function main(): Promise<void> {
  await check("OWNER", "6506297119");
  await check("NON-OWNER", "111222333");
  process.exit(0);
}
main().catch((e) => { console.error("FATAL", e instanceof Error ? e.message : e); process.exit(1); });
