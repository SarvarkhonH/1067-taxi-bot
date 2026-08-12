// ⏳ «HAR MAVSUM BALL NOL» — ega qarori 2026-08-11.
//
// Qoida: ball mavsum ichida yashaydi va mavsum tugashi bilan yonadi. Uni saqlashning YAGONA
// yo'li — karta olib qo'yish. To'lmagan mukofot kartasi keyingi mavsumga o'tadi; tirajda
// yutmagan karta esa butunlay yonadi (balli ham, kartasi ham).
//
// Bu faylda IKKI xil tekshiruv bor va ular bir xil kuchga EGA EMAS — buni ochiq yozamiz:
//   1. SOF funksiya testlari (`oyinSumInWindow`) — haqiqiy xatti-harakat isboti.
//   2. TUZILMA QO'RIQLARI — `computeBallMap` manba kodini o'qib, oyna-invariantining
//      joyida ekanini tekshiradi. Bu xatti-harakat isboti EMAS (u DB talab qiladi, loyihada
//      esa `TEST_DATABASE_URL` yo'q — CLAUDE.md). Qo'riq faqat JIM REGRESSIYANI ushlaydi:
//      kimdir `spent` filtrini olib tashlasa yoki oynani qaytarsa, CI yiqiladi.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { oyinSumInWindow } from "../oyin";

const FROM = Date.parse("2026-08-01T00:00:00+05:00");
const TO = Date.parse("2026-08-31T23:59:00+05:00");
const inSeason = "2026-08-10T12:00:00+05:00";
const beforeSeason = "2026-07-20T12:00:00+05:00";
const afterSeason = "2026-09-05T12:00:00+05:00";

describe("oyinSumInWindow — mavsum oynasi", () => {
  it("mavsum ICHIDAGI yozuv hisoblanadi", () => {
    expect(oyinSumInWindow([{ at: inSeason, ball: 500 }], FROM, TO)).toBe(500);
  });

  it("mavsumdan OLDINGI yozuv hisoblanmaydi — aks holda eski bonus har mavsum qaytardi", () => {
    expect(oyinSumInWindow([{ at: beforeSeason, ball: 5000 }], FROM, TO)).toBe(0);
  });

  it("mavsumdan KEYINGI yozuv hisoblanmaydi", () => {
    expect(oyinSumInWindow([{ at: afterSeason, ball: 5000 }], FROM, TO)).toBe(0);
  });

  it("aralash ro'yxatdan faqat mavsum ichidagisi qo'shiladi", () => {
    const sum = oyinSumInWindow([
      { at: beforeSeason, ball: 9000 },
      { at: inSeason, ball: 300 },
      { at: inSeason, ball: -100 },
      { at: afterSeason, ball: 7000 },
    ], FROM, TO);
    expect(sum).toBe(200);
  });

  it("MANFIY tuzatish ham oynadan o'tadi (jazo mavsum ichida ishlashi kerak)", () => {
    expect(oyinSumInWindow([{ at: inSeason, ball: -750 }], FROM, TO)).toBe(-750);
  });

  it("sanasi buzuq/eski formatdagi yozuv HISOBGA OLINMAYDI (ball beruvchi yo'nalish)", () => {
    // Eski `oyin:phoneball:` qatorlarida "1" turadi — Date.parse NaN qaytaradi.
    expect(oyinSumInWindow([{ at: "1", ball: 1000 }], FROM, TO)).toBe(0);
    expect(oyinSumInWindow([{ at: "", ball: 1000 }], FROM, TO)).toBe(0);
  });

  it("chegara ANIQ: boshlanish va tugash lahzasi ICHKARIDA", () => {
    expect(oyinSumInWindow([{ at: new Date(FROM).toISOString(), ball: 10 }], FROM, TO)).toBe(10);
    expect(oyinSumInWindow([{ at: new Date(TO).toISOString(), ball: 10 }], FROM, TO)).toBe(10);
    expect(oyinSumInWindow([{ at: new Date(FROM - 1).toISOString(), ball: 10 }], FROM, TO)).toBe(0);
    expect(oyinSumInWindow([{ at: new Date(TO + 1).toISOString(), ball: 10 }], FROM, TO)).toBe(0);
  });

  it("buzuq `ball` NaN tarqatmaydi", () => {
    expect(oyinSumInWindow([{ at: inSeason, ball: Number.NaN }, { at: inSeason, ball: 5 }], FROM, TO)).toBe(5);
  });

  it("bo'sh ro'yxat 0", () => {
    expect(oyinSumInWindow([], FROM, TO)).toBe(0);
  });
});

// ── TUZILMA QO'RIQLARI ─────────────────────────────────────────────────────────────────────────
const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(here, "../../../server/src/services/oyinService.ts"), "utf8");
/** Izohlarni tashlab, FAQAT kodni tekshiramiz — izohdagi so'z testni aldamasin. */
const code = src.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");

describe("computeBallMap — oyna invarianti (jim regressiya qo'rig'i)", () => {
  it("oyna MAVSUM boshidan olinadi, 24 oylik siljish emas", () => {
    expect(code).toMatch(/const fromMs = season\.startMs \?\?/);
    expect(code).toMatch(/const toMs = season\.endMs != null \? Math\.min\(nowMs, season\.endMs\)/);
  });

  it("`spent` AYNAN shu oynadan filtrlanadi — S8 dagi «hammada 0» bug'ining sababi shu edi", () => {
    expect(code).toMatch(/sum \+= t\.priceAtPurchase/);
    expect(code).toMatch(/ms >= fromMs/);
  });

  it("kun-markerlari (login/share/quest/home) oynadan filtrlanadi", () => {
    expect(code).toMatch(/d >= fromDay && d <= toDay/);
  });

  it("qo'lda tuzatish oynadan filtrlanadi — `total` TO'G'RIDAN-TO'G'RI ishlatilmaydi", () => {
    expect(code).toMatch(/oyinSumInWindow\(parseAdjust\(row\.value\)\.log, fromMs, toMs\)/);
    expect(code).not.toMatch(/adjustByMember\.set\(memberId, parseAdjust\(row\.value\)\.total\)/);
  });

  it("telefon bonusi oynadan filtrlanadi (belgi endi SANA saqlaydi)", () => {
    expect(code).toMatch(/at >= fromMs && at <= toMs\) phoneBallGranted\.add/);
    expect(code).toMatch(/value: new Date\(\)\.toISOString\(\)/);
  });

  it("harakatsizlik so'nishi OLIB TASHLANGAN — o'lik-lekin-xavfli kod qolmadi", () => {
    expect(code).not.toMatch(/dormant/);
    expect(code).not.toMatch(/BALL_INACTIVITY_MS/);
  });
});

describe("jurnal va balans BIR XIL oynadan o'qiydi (ega 2026-08-11 da topgan bug)", () => {
  // Ega shikoyati: «hozir menga ball berilyapti, lekin yozilmagan ballarga».
  // Sabab: `computeBallMap` mavsum oynasiga o'tdi, `getActivity` esa 24 oyda qoldi —
  // jurnalda voqea bor, balansda yo'q. Ikkalasi AJRALIB KETA OLMASLIGI kerak.
  const act = code.slice(code.indexOf("export async function getActivity"));
  const body = act.slice(0, act.indexOf("\nexport ", 1));

  it("`getActivity` oynasi MAVSUMDAN olinadi", () => {
    expect(body).toMatch(/season\.startMs/);
    expect(body).toMatch(/season\.endMs/);
  });

  it("`getActivity` 24 oylik oynani TO'G'RIDAN-TO'G'RI standart qilib olmaydi", () => {
    // `BALL_DATA_WINDOW_MS` faqat ZAXIRA sifatida (mavsum sanasi yo'q holat) ishlatilishi mumkin —
    // ya'ni u har doim `season.startMs ??` dan KEYIN kelishi shart.
    const uses = [...body.matchAll(/BALL_DATA_WINDOW_MS/g)].length;
    if (uses > 0) expect(body).toMatch(/season\.startMs \?\? [^;]*BALL_DATA_WINDOW_MS/);
  });
});

describe("karta abadiy — ega qoidasi buzilmagan", () => {
  it("chipta va sotilgan-hisoblagich arxivlanmaydi (to'lmagan mukofot keyingi mavsumga o'tadi)", () => {
    // ⚠️ Ro'yxat `];` bilan tugaydi, `] as const` bilan EMAS — noto'g'ri kesish keyingi
    // kodni ham tortib, testni yolg'on yiqitardi (birinchi yozilganda aynan shunday bo'ldi).
    const start = src.indexOf("export const ARCHIVED_PREFIXES");
    const block = src.slice(start, src.indexOf("\n];", start));
    const active = block.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
    expect(active).not.toMatch(/"oyin:tickets:"/);
    expect(active).not.toMatch(/"oyin_sold:"/);
    expect(active).not.toMatch(/"oyin:winner:"/);
  });

  it("tirajdan keyin har karta `won`/`lost` deb belgilanadi (yutmagani yonadi)", () => {
    expect(code).toMatch(/const nextResult: "won" \| "lost"/);
  });
});

describe("O11 — o'tgan mavsum kartasi bekor qilinmaydi (jonli bug, 2026-08-12)", () => {
  // Ega jonli tizimda topmadi — audit topdi: o'tgan mavsum kartasini `cancelOwnTicket` bilan
  // bekor qilsa ball QAYTMAYDI (`spent` joriy oynadan tashqarida hisoblanadi), lekin sotuv
  // sanog'i KAMAYADI — to'lib kelayotgan (keyingi mavsumga o'tgan) sovg'a orqaga tepadi.
  const fn = code.slice(code.indexOf("export async function cancelOwnTicket"));
  const body = fn.slice(0, fn.indexOf("\nexport ", 1));

  it("bekor qilishdan OLDIN kartaning sanasi JORIY mavsum bilan solishtiriladi", () => {
    expect(body).toMatch(/Date\.parse\(target\.ts\) < \(season\.startMs/);
  });

  it("solishtiruv `releaseSoldSlot` dan OLDIN turadi — kech tekshiruv sanoqni allaqachon buzardi", () => {
    const cmpIdx = body.indexOf("season.startMs ?? -Infinity");
    const releaseIdx = body.indexOf("releaseSoldSlot(");
    expect(cmpIdx).toBeGreaterThan(-1);
    expect(releaseIdx).toBeGreaterThan(cmpIdx);
  });
});

describe("mavsum yakuni — xabarnoma zanjiri (2026-08-12, ega talabi)", () => {
  const wt = code.slice(code.indexOf("export async function seasonWarningTick"));
  const wtBody = wt.slice(0, wt.indexOf("\nexport ", 1));
  const cn = code.slice(code.indexOf("export async function seasonCloseNotify"));
  const cnBody = cn.slice(0, cn.indexOf("\nexport ", 1));
  const dn = code.slice(code.indexOf("export async function seasonDrawNotify"));
  const dnBody = dn.slice(0, dn.indexOf("\nexport ", 1));

  it("ogohlantirish FAQAT mavsum FAOL ekanida yuguradi — tugagandan keyin emas", () => {
    expect(wtBody).toMatch(/season\.phase !== "active"/);
  });

  it("uch bosqich bor: T-7 kun, T-3 kun, T-49 soat", () => {
    expect(wtBody).toMatch(/7 \* 86_400_000/);
    expect(wtBody).toMatch(/3 \* 86_400_000/);
    expect(wtBody).toMatch(/49 \* 3_600_000/);
  });

  it("T-24/T-1 soatda BALL haqida push YO'Q — faqat T-49 soatgacha", () => {
    // Eng kichik oyna 49 soat: undan kichik raqamli qo'shimcha bosqich YO'Q.
    expect(wtBody).not.toMatch(/24 \* 3_600_000/);
    expect(wtBody).not.toMatch(/1 \* 3_600_000/);
  });

  it("yakun xabari `seasonClose` MARKERINI tekshiradi — hali yugurmagan bo'lsa yubormaydi", () => {
    expect(cnBody).toMatch(/oyin:seasonclosed:\$\{season\.seasonId\}/);
    expect(cnBody).toMatch(/if \(!closed\) return/);
  });

  it("balli 0 bo'lganga yakun xabari YUBORILMAYDI", () => {
    expect(cnBody).toMatch(/breakdown\.ball > 0/);
  });

  it("g'olibga push `notifiedAt` bilan bir martalik — qayta yugursa qayta yubormaydi", () => {
    expect(dnBody).toMatch(/if \(w\.notifiedAt\) continue/);
    expect(dnBody).toMatch(/w\.notifiedAt = new Date\(\)\.toISOString\(\)/);
  });

  it("yutqazganga push `notifiedLoss` bilan bir martalik", () => {
    expect(dnBody).toMatch(/result === "lost" && !t\.notifiedLoss/);
    expect(dnBody).toMatch(/t\.notifiedLoss = true/);
  });

  it("durable marker DAYKEY'ga emas — mavsum+a'zo ID'siga bog'langan (kunlik cap muammosidan xoli)", () => {
    const pc = code.slice(code.indexOf("async function pushCandidates"));
    const pcBody = pc.slice(0, pc.indexOf("\nasync function markPushed"));
    expect(pcBody).toMatch(/\$\{markerPrefix\}:\$\{seasonId\}:\$\{id\}/);
    expect(pcBody).not.toMatch(/dayKey/);
  });

  it("har bosqich bir tikda cheklangan (SEASON_PUSH_BATCH) — minglab a'zoni bitta tikda urib yubormaydi", () => {
    expect(code).toMatch(/const SEASON_PUSH_BATCH = 300/);
  });

  it("index.ts yangi poller QO'SHMAYDI — mavjud 15-daqiqalik tikka ulanadi", () => {
    const idx = readFileSync(resolve(here, "../../../server/src/index.ts"), "utf8");
    expect(idx).toMatch(/seasonWarningTick\(bot\)/);
    expect(idx).toMatch(/seasonDrawNotify\(bot\)/);
    expect(idx).toMatch(/seasonCloseNotify\(bot\)/);
    // Uchtasi ham AYNAN shu bitta chaqiruv atrofida — alohida `setInterval` YO'Q.
    expect(idx).not.toMatch(/setInterval[\s\S]{0,80}seasonWarningTick/);
  });
});
