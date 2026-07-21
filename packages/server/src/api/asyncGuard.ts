// Jonli xato-sinfi (2026-07-08 restoran NaN crash): Express 4 `async` handler'dan chiqqan
// rejection'ni errorHandler'ga UZATMAYDI — javob HECH QACHON yuborilmaydi (mijoz timeout'gacha
// osiladi) + `unhandledRejection` process darajasiga chiqadi. 273 route'ni birma-bir try/catch
// bilan o'rash o'rniga ro'yxatdan o'tkazish nuqtasini bir marta ushlaymiz: har verb-metodga
// berilgan har handler wrap qilinadi va rejection `next(e)` orqali server.ts oxiridagi yagona
// errorHandler'ga boradi (log + kunlik `apierr:` hisoblagich + 500 JSON).
//
// Express 5'ga o'tilganda bu fayl OLIB TASHLANADI — u async rejection'ni o'zi uzatadi.
// Alohida modul, chunki server.ts'ni import qilish env+prisma+50 servisni ko'taradi; guard esa
// yon-ta'sirsiz test qilinishi kerak (scripts/testAsyncGuard.ts).
import type express from "express";
import type { NextFunction, Request, Response } from "express";

type Handler = (req: Request, res: Response, next: NextFunction) => unknown;

export function installAsyncGuard(app: express.Express): void {
  const verbs = ["get", "post", "put", "patch", "delete", "all"] as const;
  for (const verb of verbs) {
    const orig = app[verb].bind(app) as (...a: unknown[]) => unknown;
    (app as unknown as Record<string, unknown>)[verb] = (...args: unknown[]) => {
      // `app.get("etag")` — Express'ning sozlama-O'QISH shakli: hech narsa o'ramaymiz.
      if (verb === "get" && args.length === 1) return orig(...args);
      return orig(
        ...args.map((a, i) => {
          if (i === 0 || typeof a !== "function") return a; // [0] = yo'l (path)
          const fn = a as Handler;
          if (fn.length >= 4) return a; // errorHandler (err,req,res,next) — tegilmaydi
          return (req: Request, res: Response, next: NextFunction) => {
            try {
              const out = fn(req, res, next);
              if (out && typeof (out as Promise<unknown>).catch === "function") {
                (out as Promise<unknown>).catch(next);
              }
            } catch (e) {
              next(e);
            }
          };
        }),
      );
    };
  }
}
