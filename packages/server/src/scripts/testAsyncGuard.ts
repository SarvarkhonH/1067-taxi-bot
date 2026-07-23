// 🛡 ISBOT: Express 4 async-rejection guard (src/api/asyncGuard.ts).
// DB TALAB QILMAYDI — na TEST_DATABASE_URL, na app DB. Sof Express, tasodifiy portda.
// Nima isbotlanadi:
//   NAZORAT (guard'siz) = tuzatishdan OLDINGI holat: async throw → javob YO'Q (mijoz osiladi)
//                          + unhandledRejection process darajasiga chiqadi (egaga crash-alert).
//   TUZATILGAN (guard bilan): 500 JSON, osilish yo'q, yangi unhandledRejection yo'q,
//                          normal route'lar va app.get("etag") sozlama-o'qishi buzilmagan.
// Yugurtirish: npx tsx src/scripts/testAsyncGuard.ts
import express, { type NextFunction, type Request, type Response } from "express";
import type { Server } from "node:http";
import { installAsyncGuard } from "../api/asyncGuard";

let unhandled = 0;
process.on("unhandledRejection", () => { unhandled++; });

let fails = 0;
function ok(cond: boolean, label: string, detail = ""): void {
  console.log(`${cond ? "✅" : "❌"} ${label}${detail ? "  → " + detail : ""}`);
  if (!cond) fails++;
}

function build(withGuard: boolean): express.Express {
  const app = express();
  if (withGuard) installAsyncGuard(app);
  // server.ts'dagi restoran/intercity route'larining aynan xatti-harakati: NaN id → prisma throw
  app.get("/boom", async (_req: Request, _res: Response) => {
    await Promise.resolve();
    throw new Error("simulated prisma NaN throw");
  });
  app.get("/ok", async (_req: Request, res: Response) => { res.json({ ok: true }); });
  app.get("/sync-boom", (_req: Request, _res: Response) => { throw new Error("sync throw"); });
  // server.ts:2213 dagi yagona errorHandler bilan bir xil shakl (4 argument)
  app.use((_err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (!res.headersSent) res.status(500).json({ error: "internal" });
  });
  return app;
}

function listen(app: express.Express): Promise<{ url: string; close: () => void }> {
  return new Promise((resolve) => {
    const s: Server = app.listen(0, () => {
      const port = (s.address() as { port: number }).port;
      resolve({ url: `http://127.0.0.1:${port}`, close: () => s.close() });
    });
  });
}

async function hit(url: string, timeoutMs = 1500): Promise<string> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ac.signal });
    return `HTTP ${r.status} ${await r.text()}`;
  } catch {
    return "JAVOB YO'Q (osildi/timeout)";
  } finally { clearTimeout(t); }
}

async function main(): Promise<void> {
  // ── NAZORAT: guard'SIZ = tuzatishdan oldingi jonli holat ──
  const before = await listen(build(false));
  const r0 = await hit(`${before.url}/boom`);
  ok(r0.startsWith("JAVOB YO'Q"), "NAZORAT (guard'siz): async throw → javob yo'q, mijoz osiladi", r0);
  before.close();
  await new Promise((r) => setTimeout(r, 300));
  ok(unhandled > 0, "NAZORAT (guard'siz): unhandledRejection process darajasiga chiqdi", `soni=${unhandled}`);

  // ── TUZATILGAN: guard bilan ──
  const after = await listen(build(true));
  const r1 = await hit(`${after.url}/boom`);
  ok(r1 === 'HTTP 500 {"error":"internal"}', "guard: async throw → 500 JSON (osilmaydi)", r1);
  const r2 = await hit(`${after.url}/sync-boom`);
  ok(r2 === 'HTTP 500 {"error":"internal"}', "guard: sinxron throw → 500 JSON", r2);
  const r3 = await hit(`${after.url}/ok`);
  ok(r3 === 'HTTP 200 {"ok":true}', "guard: normal route buzilmagan (regressiya)", r3);
  after.close();

  const snap = unhandled;
  await new Promise((r) => setTimeout(r, 400));
  ok(unhandled === snap, "guard: YANGI unhandledRejection YO'Q", `soni=${unhandled}`);

  // Express'ning `app.get("etag")` sozlama-o'qish shakli o'ralib qolmasligi kerak
  const app = express();
  installAsyncGuard(app);
  app.set("etag", "strong");
  ok(app.get("etag") === "strong", "guard: app.get('etag') sozlama-o'qishi buzilmagan", String(app.get("etag")));

  console.log(fails === 0 ? "\n🟢 asyncGuard: 7/7 o'tdi" : `\n🔴 ${fails} ta yiqildi`);
  process.exit(fails === 0 ? 0 : 1);
}

void main();
