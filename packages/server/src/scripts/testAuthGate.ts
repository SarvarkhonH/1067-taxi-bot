// QA P1 (auth): prove /api/admin/heal + /api/admin/unflag REJECT non-owner (operator)
// tokens and ALLOW the owner. Boots the real Express app and hits the live routes.
// Run: KAS_MODE=mock dotenv -e ../../.env -- tsx src/scripts/testAuthGate.ts
import "../env";
import { prisma } from "../db";
import { createApiServer } from "../api/server";
import type { Server, AddressInfo } from "node:net";

const TOK = "authgate-test-token-Zx9"; // operator-role
const OWN = "authgate-test-owner-Zx9"; // owner-role (env-independent owner proof)
let failed = 0;
const ok = (c: boolean, l: string): void => { console.log(`${c ? "✅" : "❌"} ${l}`); if (!c) failed++; };

async function main(): Promise<void> {
  // seed an OPERATOR-role token (adminRole="operator") and an OWNER-role token (adminRole="owner").
  // Using an owner-role oprtoken proves the owner path without depending on ADMIN_PANEL_TOKEN
  // (which lives in Render env, not the local .env).
  await prisma.appState.deleteMany({ where: { key: { in: [`oprtoken:${TOK}`, `oprtoken:${OWN}`] } } });
  await prisma.appState.create({ data: { key: `oprtoken:${TOK}`, value: "operator" } });
  await prisma.appState.create({ data: { key: `oprtoken:${OWN}`, value: "owner" } });

  const app = createApiServer();
  const srv: Server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const port = (srv.address() as AddressInfo).port;
  const base = `http://127.0.0.1:${port}`;
  const call = async (path: string, token: string): Promise<number> => {
    const res = await fetch(`${base}${path}`, {
      method: "POST",
      headers: { "X-Admin-Token": token, "Content-Type": "application/json" },
      body: JSON.stringify({ memberId: 999999999 }),
    });
    return res.status;
  };

  // OPERATOR (non-owner) must be REJECTED on the fraud/money routes
  ok((await call("/api/admin/unflag", TOK)) === 403, "operator token REJECTED on /api/admin/unflag → 403");
  ok((await call("/api/admin/heal", TOK)) === 403, "operator token REJECTED on /api/admin/heal → 403");
  // sanity: the operator token IS valid for a non-owner route (proves 403 is owner-gate, not bad token)
  const rd = await fetch(`${base}/api/admin/recruits`, { headers: { "X-Admin-Token": TOK } });
  ok(rd.status !== 403, `operator token is VALID (passes requireAdmin on a read route → ${rd.status}, not 403)`);
  // OWNER (owner-role token) must PASS the owner-gate (handler runs → not 403)
  const ownerUnflag = await call("/api/admin/unflag", OWN);
  ok(ownerUnflag !== 403, `owner token PASSES /api/admin/unflag → ${ownerUnflag} (not 403)`);

  await new Promise<void>((r) => srv.close(() => r()));
  await prisma.appState.deleteMany({ where: { key: { in: [`oprtoken:${TOK}`, `oprtoken:${OWN}`] } } });
  await prisma.$disconnect();
  console.log(failed ? `\n❌ ${failed} FAIL` : "\n✅ AUTH-GATE: heal/unflag reject operators (403), allow owner");
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error("FATAL", e instanceof Error ? e.message : e); process.exit(1); });
