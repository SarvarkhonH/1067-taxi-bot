// T0.5 PUL-QALQON util: (1) atomicIncrement — raw upsert (jackpot patterni),
// read-modify-write race'larsiz; (2) pending-marker — pul o'tishi tugamay
// qolsa (crash/PG drop) periodik tick qayta uradi; 5 urinishdan keyin
// to'xtab egaga TG alert ("qo'lda ko'rish kerak").
import { prisma } from "../db";

export async function atomicIncrement(key: string, delta: number): Promise<number> {
  const inc = Math.floor(delta);
  await prisma.$executeRaw`
    INSERT INTO "AppState" ("key","value","updatedAt")
    VALUES (${key}, ${String(inc)}, NOW())
    ON CONFLICT ("key") DO UPDATE
      SET "value" = CAST((CAST("AppState"."value" AS DOUBLE PRECISION) + ${inc}) AS TEXT),
          "updatedAt" = NOW()`;
  const row = await prisma.appState.findUnique({ where: { key } });
  return row ? Number(row.value) || 0 : 0;
}

export interface PendingPayload {
  memberId: number;
  amount: number;
  note?: string;
}

interface PendingValue extends PendingPayload {
  attempts: number;
  stuck?: boolean;
}

const PENDING_MAX_ATTEMPTS = 5;
const PENDING_MIN_AGE_MS = 10 * 60_000; // retry only after 10 min quiet

export function pendingKey(kind: string, id: string): string {
  return `pending:${kind}:${id}`;
}

/** Yozish — pul-operatsiya natijasi noma'lum bo'lishidan OLDIN. Tranzaksiya
 *  ichida ham ishlatish mumkin (tx client bilan). */
export async function pendingCreate(
  kind: string,
  id: string,
  payload: PendingPayload,
  tx?: { appState: { create: (a: { data: { key: string; value: string } }) => Promise<unknown> } },
): Promise<void> {
  const data = { key: pendingKey(kind, id), value: JSON.stringify({ ...payload, attempts: 0 } satisfies PendingValue) };
  await (tx ?? prisma).appState.create({ data }).catch(() => null); // already exists = fine (retry path)
}

/** Pul manzilga yetdi — marker o'chadi. */
export async function pendingResolve(kind: string, id: string): Promise<void> {
  await prisma.appState.deleteMany({ where: { key: pendingKey(kind, id) } });
}

export interface PendingRow {
  id: string;
  payload: PendingValue;
}

/** Periodik tick uchun: 10 daq+ eski, stuck bo'lmagan markerlar; har chaqirikda
 *  attempts++ yoziladi; limitdan oshganlari stuck=true + alert ro'yxatiga. */
export async function pendingScan(kind: string): Promise<{ retry: PendingRow[]; stuck: PendingRow[] }> {
  const rows = await prisma.appState.findMany({ where: { key: { startsWith: `pending:${kind}:` } } });
  const cutoff = Date.now() - PENDING_MIN_AGE_MS;
  const retry: PendingRow[] = [];
  const stuck: PendingRow[] = [];
  for (const r of rows) {
    let v: PendingValue;
    try {
      v = JSON.parse(r.value) as PendingValue;
    } catch {
      continue;
    }
    if (v.stuck) continue;
    if (r.updatedAt.getTime() > cutoff) continue; // too fresh — main path may still finish
    const id = r.key.slice(`pending:${kind}:`.length);
    if (v.attempts >= PENDING_MAX_ATTEMPTS) {
      v.stuck = true;
      await prisma.appState.update({ where: { key: r.key }, data: { value: JSON.stringify(v) } }).catch(() => null);
      stuck.push({ id, payload: v });
    } else {
      v.attempts += 1;
      await prisma.appState.update({ where: { key: r.key }, data: { value: JSON.stringify(v) } }).catch(() => null);
      retry.push({ id, payload: v });
    }
  }
  return { retry, stuck };
}

// ── V-NEXT #3: AppState marker TTL ────────────────────────────────────────────
// Per-ride idempotency markers (~8-10 AppState rows per completed ride: qinc×3, qscore, wsarrived,
// waitstart/waitfound, finishcard, faredone, fundride…) accumulated FOREVER — 1,000 rides ≈ 9k dead
// rows degrading every startsWith scan. Their replay-protection window is MINUTES (sweep re-polls),
// so 30 days is far beyond any legitimate retry. waitvoucher/barabantoken are excluded: they carry
// their own expiry and are consumed in-flow. Runs daily off the existing 15-min tick (no new poller).
// EPHEMERAL: pure per-ride coordination markers whose replay window is MINUTES (the sweep re-polls
// the same booking within seconds). These accumulate ~10/ride and dominate the table; a 2-day TTL is
// far beyond any legitimate retry. NONE of these gate money — the money idempotency keys live in
// CoinTxn.idempotencyKey (a real unique index), never here. trackjoin: is kept LONGER (K-factor
// metric, below). icbrd:/icdep: are intercity sweep once-markers (audit P2-D).
const EPHEMERAL_MARKER_PREFIXES = [
  "qinc:", "qscore:", "ridefin:", "wsarrived:", "waitstart:", "waitfound:", "waitvfail:",
  "finishcard:", "faredone:", "fundride:", "farepending:", "cancels:", "tracknudge:", "icbrd:", "icdep:",
  "oprpause:", // 🆘 operator-escalation AI-pause marker (operatorPause.ts) — logically expires in 1h, this is just table hygiene
  "staffsummary:", // 👔 JAMOA J4 kechki xulosa once-marker — kaliti sanali, replay oynasi o'sha kechqurunning o'zi
  "stfremin:", "stfremout:", "stfotping:", // 👔 JAMOA eslatma-markerlari (Keldim/Ketdim/OT-soat) — bir kunlik
];
// LONGER: kept 30 days (metrics / analytics reads, not per-ride ephemera).
const LONG_MARKER_PREFIXES = ["trackjoin:"];

export async function cleanupExpiredMarkers(ephemeralDays = 2, longDays = 30): Promise<number> {
  const del = async (prefixes: string[], days: number): Promise<number> => {
    const cutoff = new Date(Date.now() - days * 86400_000);
    let n = 0;
    for (const prefix of prefixes) {
      const r = await prisma.appState.deleteMany({ where: { key: { startsWith: prefix }, updatedAt: { lt: cutoff } } }).catch(() => ({ count: 0 }));
      n += r.count;
    }
    return n;
  };
  return (await del(EPHEMERAL_MARKER_PREFIXES, ephemeralDays)) + (await del(LONG_MARKER_PREFIXES, longDays));
}

/** Daily gate for the tick: run at most once per Tashkent day (marker itself is 1 AppState row). */
export async function maybeDailyMarkerCleanup(): Promise<void> {
  const today = new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10);
  const row = await prisma.appState.findUnique({ where: { key: "cleanup:markers" } }).catch(() => null);
  if (row?.value === today) return;
  await prisma.appState.upsert({ where: { key: "cleanup:markers" }, create: { key: "cleanup:markers", value: today }, update: { value: today } });
  const n = await cleanupExpiredMarkers();
  if (n > 0) console.log(`[cleanup] ${n} expired AppState markers removed (ephemeral >2d, metrics >30d)`);
}
