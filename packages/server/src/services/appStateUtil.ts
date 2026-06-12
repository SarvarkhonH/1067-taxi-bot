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
