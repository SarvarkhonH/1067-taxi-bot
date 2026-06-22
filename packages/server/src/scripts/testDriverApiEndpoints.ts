// E2E wiring for the Mini App driver endpoints: boots the real Express app + hits /api/driver/account,
// /api/driver/qr, /api/driver/debt/pay with a demo driver via X-Debug-Telegram-Id (ALLOW_DEBUG_AUTH).
// Proves route → service → JSON, the qarz gate, and that a non-driver gets the right shape. Mock kas.
// Snapshot-restores feature:qarz. Run: ALLOW_DEBUG_AUTH=true KAS_MODE=mock dotenv -e ../../.env -- tsx src/scripts/testDriverApiEndpoints.ts
import "../env";
import { prisma } from "../db";
import { createApiServer } from "../api/server";
import { setFeature, __resetFeatureCache } from "../services/featureFlags";
import type { Server, AddressInfo } from "node:net";

const TAG = "drvapi-test";
let failed = 0;
const ok = (c: boolean, l: string): void => { console.log(`${c ? "✅" : "❌"} ${l}`); if (!c) failed++; };

async function cleanup(): Promise<void> {
  const ids = (await prisma.member.findMany({ where: { kasId: { startsWith: TAG } }, select: { id: true } })).map((m) => m.id);
  if (ids.length) {
    await prisma.driverDebtPayment.deleteMany({ where: { memberId: { in: ids } } }).catch(() => undefined);
    await prisma.coinTxn.deleteMany({ where: { memberId: { in: ids } } });
  }
  await prisma.telegramUser.deleteMany({ where: { id: { startsWith: TAG } } });
  await prisma.member.deleteMany({ where: { kasId: { startsWith: TAG } } });
}

async function main(): Promise<void> {
  if (!process.env.ALLOW_DEBUG_AUTH) { console.log("⚠️ set ALLOW_DEBUG_AUTH=true to run this"); process.exit(0); }
  await cleanup();
  const flagBefore = await prisma.appState.findUnique({ where: { key: "feature:qarz" } });

  // demo driver (type=driver + carNumber) linked to a debug telegram id
  const drv = await prisma.member.create({ data: { type: "driver", kasId: `${TAG}-d`, fullName: "API Driver", carNumber: "77M001AA", coins: 100_000 } });
  const drvTg = `${TAG}-drvtg`;
  await prisma.telegramUser.create({ data: { id: drvTg, memberId: drv.id } });
  // a client (non-driver)
  const cli = await prisma.member.create({ data: { type: "client", kasId: `${TAG}-c`, fullName: "API Client", phone: "+998900099003" } });
  const cliTg = `${TAG}-clitg`;
  await prisma.telegramUser.create({ data: { id: cliTg, memberId: cli.id } });

  const app = createApiServer();
  const srv: Server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const port = (srv.address() as AddressInfo).port;
  const base = `http://127.0.0.1:${port}`;
  const get = async (path: string, tg: string): Promise<{ status: number; body: Record<string, unknown> }> => {
    const res = await fetch(`${base}${path}`, { headers: { "X-Debug-Telegram-Id": tg } });
    return { status: res.status, body: (await res.json().catch(() => ({}))) as Record<string, unknown> };
  };
  const post = async (path: string, tg: string, body: unknown): Promise<{ status: number; body: Record<string, unknown> }> => {
    const res = await fetch(`${base}${path}`, { method: "POST", headers: { "X-Debug-Telegram-Id": tg, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { status: res.status, body: (await res.json().catch(() => ({}))) as Record<string, unknown> };
  };

  try {
    // ── /api/driver/account ───────────────────────────────────────────────────
    {
      const r = await get("/api/driver/account", drvTg);
      ok(r.status === 200 && r.body.linked === true, `account: driver linked:true (${r.status})`);
      ok(r.body.balance === 18200 && r.body.debt === 45000, `account: kas balance/debt surfaced (${r.body.balance}/${r.body.debt})`);
    }
    {
      const r = await get("/api/driver/account", cliTg);
      ok(r.status === 200 && r.body.linked === false, `account: client linked:false`);
    }

    // ── /api/driver/qr ─────────────────────────────────────────────────────────
    {
      const r = await get("/api/driver/qr", drvTg);
      ok(r.status === 200 && r.body.ok === true, `qr: ok:true for driver`);
      ok(typeof r.body.link === "string" && (r.body.link as string).includes("drv_"), `qr: recruit link present (${String(r.body.link).slice(0, 40)})`);
      ok(typeof r.body.png === "string" && (r.body.png as string).startsWith("data:image/png"), `qr: PNG data URL present`);
      const c = await get("/api/driver/qr", cliTg);
      ok(c.body.ok === false && c.body.reason === "not_driver", `qr: client → not_driver`);
    }

    // ── /api/driver/debt/pay — qarz OFF → refused, no money moves ───────────────
    await setFeature("qarz", false);
    __resetFeatureCache();
    {
      const r = await post("/api/driver/debt/pay", drvTg, { amount: 10_000, nonce: "apitest-off" });
      ok(r.status === 200 && r.body.ok === false, `pay (qarz OFF): refused`);
      const m = await prisma.member.findUnique({ where: { id: drv.id }, select: { coins: true } });
      ok(m?.coins === 100_000, `pay (qarz OFF): no tanga moved (${m?.coins})`);
    }

    // ── /api/driver/debt/pay — qarz ON → pays, tanga drops, kas debt settled ────
    await setFeature("qarz", true);
    __resetFeatureCache();
    {
      const r = await post("/api/driver/debt/pay", drvTg, { amount: 10_000, nonce: "apitest-on" });
      ok(r.status === 200 && r.body.ok === true && r.body.paid === 10_000, `pay (qarz ON): paid 10000`);
      const m = await prisma.member.findUnique({ where: { id: drv.id }, select: { coins: true } });
      ok(m?.coins === 90_000, `pay (qarz ON): tanga 100000 → 90000 (${m?.coins})`);
      // double-submit same nonce → no second charge
      const r2 = await post("/api/driver/debt/pay", drvTg, { amount: 10_000, nonce: "apitest-on" });
      const m2 = await prisma.member.findUnique({ where: { id: drv.id }, select: { coins: true } });
      ok(m2?.coins === 90_000, `pay: double-submit same nonce → still 90000 (idempotent, ${m2?.coins})`);
      void r2;
    }
    srv.close();
  } finally {
    if (flagBefore) await prisma.appState.upsert({ where: { key: "feature:qarz" }, create: { key: "feature:qarz", value: flagBefore.value }, update: { value: flagBefore.value } });
    else await prisma.appState.deleteMany({ where: { key: "feature:qarz" } });
    __resetFeatureCache();
    await cleanup();
    await prisma.$disconnect();
  }
  console.log(failed ? `\n❌ ${failed} FAIL` : "\n✅ DRIVER-API: account + qr + debt/pay endpointlari wiring to'g'ri");
  process.exit(failed ? 1 : 0);
}
main();
