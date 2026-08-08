// 📊 Sim-dashboard mini-server — dependency'siz node:http (port 5555). sim-out/<run>/metrics.jsonl
// va events.jsonl ni JSON qilib beradi, '/' esa index.html. Bu faqat O'QISH-OYNASI: sim-mantiq,
// DB yoki services import YO'Q — run.ts import-tartibiga mutlaqo ta'sir qilmaydi.

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { readFile, readdir, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const DEFAULT_PORT = 5555;

function setCors(res: ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");
}

function sendJson(res: ServerResponse, code: number, body: unknown): void {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

/** Run-nomi faqat xavfsiz belgilar — path-traversal (../) strukturaviy imkonsiz. */
function safeRunName(name: string | null): string | null {
  if (!name || !/^[A-Za-z0-9._-]+$/.test(name) || name.startsWith(".")) return null;
  return name;
}

/** JSONL faylni massivga o'qish; fayl hali yo'q bo'lsa (run endi boshlangan) — bo'sh massiv. */
async function readJsonl(file: string): Promise<unknown[]> {
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch {
    return [];
  }
  const out: unknown[] = [];
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try {
      out.push(JSON.parse(t));
    } catch {
      // chala yozilgan oxirgi qator (run hozir yozayotgan bo'lishi mumkin) — tashlab ketiladi
    }
  }
  return out;
}

/** sim-out ichidagi run-papkalar, eng yangisi birinchi (mtime bo'yicha). */
async function listRuns(simOutDir: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(simOutDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const dirs = entries.filter((e) => e.isDirectory() && safeRunName(e.name));
  const withTime = await Promise.all(
    dirs.map(async (d) => {
      try {
        const s = await stat(join(simOutDir, d.name));
        return { name: d.name, mtime: s.mtimeMs };
      } catch {
        return { name: d.name, mtime: 0 };
      }
    }),
  );
  return withTime.sort((a, b) => b.mtime - a.mtime).map((r) => r.name);
}

async function handle(simOutDir: string, req: IncomingMessage, res: ServerResponse): Promise<void> {
  setCors(res);
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }
  const url = new URL(req.url ?? "/", "http://localhost");

  if (url.pathname === "/") {
    try {
      const html = await readFile(join(here, "index.html"), "utf8");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
    } catch {
      sendJson(res, 500, { error: "index.html topilmadi" });
    }
    return;
  }

  if (url.pathname === "/runs") {
    sendJson(res, 200, await listRuns(simOutDir));
    return;
  }

  if (url.pathname === "/data" || url.pathname === "/events") {
    const run = safeRunName(url.searchParams.get("run"));
    if (!run) {
      sendJson(res, 400, { error: "run parametri kerak (faqat harf/raqam/._-)" });
      return;
    }
    const file = url.pathname === "/data" ? "metrics.jsonl" : "events.jsonl";
    sendJson(res, 200, await readJsonl(join(simOutDir, run, file)));
    return;
  }

  sendJson(res, 404, { error: "topilmadi" });
}

/** Dashboard-serverni ishga tushirish. run.ts oxirida yoki mustaqil (tsx server.ts) chaqiriladi. */
export function startDashboard(simOutDir: string, port = DEFAULT_PORT): Server {
  const server = createServer((req, res) => {
    void handle(simOutDir, req, res).catch((e: unknown) => {
      if (!res.headersSent) sendJson(res, 500, { error: String(e) });
      else res.end();
    });
  });
  server.listen(port, () => {
    console.log(`[dashboard] http://localhost:${port} — sim-out: ${simOutDir}`);
  });
  return server;
}

// To'g'ridan yugurtirish: cd packages/server && npx tsx src/sim/dashboard/server.ts
const isMain =
  typeof process.argv[1] === "string" &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  // here = packages/server/src/sim/dashboard → repo-ildiz 5 pog'ona yuqorida (run.ts sim/ dan 4).
  const simOutDir = process.env.SIM_OUT_DIR ?? resolve(here, "../../../../..", "sim-out");
  startDashboard(simOutDir);
}
