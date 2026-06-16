// QA P0-sec: (1) initData accepted ONLY from the X-Telegram-Init-Data header, NEVER the
// query string (a signed initData in the URL leaks to logs/Referer + is replayable).
// (2) X-Debug-Telegram-Id is trusted ONLY when ALLOW_DEBUG_AUTH=true — never merely because
// BOT_TOKEN is absent (a prod misconfig must not open impersonation).
// Run A (real token):   ALLOW_DEBUG_AUTH=false dotenv -e ../../.env -- tsx src/scripts/testInitDataAuth.ts
// Run B (no bot token): BOT_TOKEN= ALLOW_DEBUG_AUTH=false dotenv -e ../../.env -- tsx src/scripts/testInitDataAuth.ts
import "../env";
import crypto from "node:crypto";
import { env } from "../env";
import { createApiServer } from "../api/server";
import type { Server, AddressInfo } from "node:net";

let failed = 0;
const ok = (c: boolean, l: string): void => { console.log(`${c ? "✅" : "❌"} ${l}`); if (!c) failed++; };

function signInitData(id: string): string {
  const user = JSON.stringify({ id: Number(id), first_name: "T", username: "t" });
  const params = new URLSearchParams({ user, auth_date: String(Math.floor(Date.now() / 1000)), query_id: "AAEauth" });
  const dcs = [...params.entries()].filter(([k]) => k !== "hash").map(([k, v]) => `${k}=${v}`).sort().join("\n");
  const secret = crypto.createHmac("sha256", "WebAppData").update(env.BOT_TOKEN).digest();
  params.set("hash", crypto.createHmac("sha256", secret).update(dcs).digest("hex"));
  return params.toString();
}

async function main(): Promise<void> {
  const app = createApiServer();
  const srv: Server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
  console.log(`(env: hasBot=${env.hasBot}, allowDebugAuth=${env.allowDebugAuth})`);

  // (2) debug-auth gate: when ALLOW_DEBUG_AUTH is off, the debug header must be REJECTED —
  //     ESPECIALLY when hasBot=false (the bug: prod with empty BOT_TOKEN opened impersonation).
  if (!env.allowDebugAuth) {
    const r = await fetch(`${base}/api/me`, { headers: { "X-Debug-Telegram-Id": "6506297119" } });
    ok(r.status === 401, `X-Debug-Telegram-Id REJECTED when ALLOW_DEBUG_AUTH=false, hasBot=${env.hasBot} → ${r.status} (the prod-bypass)`);
  }

  // (1) initData header vs query — only runs when a bot token is present to forge a valid one
  if (env.hasBot) {
    const initData = signInitData("6506297119");
    const viaHeader = await fetch(`${base}/api/me`, { headers: { "X-Telegram-Init-Data": initData } });
    ok(viaHeader.status !== 401, `valid initData via HEADER → accepted (${viaHeader.status}, not 401)`);
    const viaQuery = await fetch(`${base}/api/me?initData=${encodeURIComponent(initData)}`);
    ok(viaQuery.status === 401, `same initData via QUERY string → REJECTED (${viaQuery.status}) — no URL/log/Referer leak`);
  } else {
    console.log("(no BOT_TOKEN → skipping initData header/query checks; debug-auth gate above is the key assert)");
  }

  await new Promise<void>((r) => srv.close(() => r()));
  console.log(failed ? `\n❌ ${failed} FAIL` : "\n✅ INITDATA-AUTH: header-only initData, debug header gated on explicit ALLOW_DEBUG_AUTH");
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error("FATAL", e instanceof Error ? e.message : e); process.exit(1); });
