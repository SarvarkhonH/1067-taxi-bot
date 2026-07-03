// 📞 Obzvon — the kas1067 driver call panel backend.
// A sync mirrors the kas driver roster into DriverCall (kas fields overwritten each run) while the
// operator's call state (status/note/callback/callCount) survives every sync. No money is touched —
// this is pure CRM. "inBot" flags a driver whose car already matches a linked bot Member; a driver
// counts as "taking orders" when their last kas ride was within TAKING_DAYS.
import { prisma } from "../db";
import { getDataSource } from "../kas";
import type { DriverCall } from "@prisma/client";

// statuses that mean "an operator actually reached out" — logging one stamps calledAt + bumps count
const CONTACTED = new Set(["called", "no_answer", "callback", "interested", "joined", "refused"]);
export const CALL_STATUSES = ["new", "called", "no_answer", "callback", "interested", "joined", "refused", "invalid"] as const;

function normCar(car: string | null | undefined): string {
  return (car ?? "").toUpperCase().replace(/\s+/g, "");
}
// "buyurtma olyapti?" — kas byFilter never populates lastTakeBookingDate/takeBookingCount usefully,
// so the only reliable working-signal is kas's own `active` account flag (enabled vs blocked/idle).
// Validated: 84% of drivers actually linked & driving in the bot are active=true.
function isTaking(d: { active: boolean }): boolean {
  return d.active;
}

export interface DriverCallRow {
  id: number;
  kasDriverId: number;
  fullName: string;
  phone: string | null;
  carNumber: string | null;
  carModel: string | null;
  address: string | null;
  balance: number;
  debt: number;
  trips: number;
  rating: number;
  active: boolean;
  lastRideAt: string | null;
  licenseTerm: string | null;
  inBot: boolean;
  takingOrders: boolean;
  status: string;
  note: string | null;
  callbackAt: string | null;
  calledAt: string | null;
  calledBy: string | null;
  callCount: number;
}

export interface DriverCallStats {
  total: number;
  inBot: number;
  notInBot: number;
  taking: number;
  called: number; // rows in any contacted status
  remaining: number; // status === "new"
  joined: number;
  byStatus: Record<string, number>;
  lastSyncAt: string | null;
}

export interface DriverCallList {
  rows: DriverCallRow[];
  stats: DriverCallStats;
}

function toRow(d: DriverCall): DriverCallRow {
  return {
    id: d.id,
    kasDriverId: d.kasDriverId,
    fullName: d.fullName,
    phone: d.phone,
    carNumber: d.carNumber,
    carModel: d.carModel,
    address: d.address,
    balance: d.balance,
    debt: d.debt,
    trips: d.trips,
    rating: d.rating,
    active: d.active,
    lastRideAt: d.lastRideAt ? d.lastRideAt.toISOString() : null,
    licenseTerm: d.licenseTerm ? d.licenseTerm.toISOString() : null,
    inBot: d.inBot,
    takingOrders: isTaking(d),
    status: d.status,
    note: d.note,
    callbackAt: d.callbackAt ? d.callbackAt.toISOString() : null,
    calledAt: d.calledAt ? d.calledAt.toISOString() : null,
    calledBy: d.calledBy,
    callCount: d.callCount,
  };
}

/** Pull the full kas roster → upsert. Creates new drivers, refreshes kas fields on existing ones,
 *  and NEVER overwrites operator call state. Recomputes inBot from the current linked-car set. */
export async function syncDriverCalls(): Promise<{
  total: number;
  created: number;
  updated: number;
  inBot: number;
  taking: number;
}> {
  const roster = await getDataSource().listDriverRoster();
  const linked = await prisma.member.findMany({
    where: { type: "driver", carNumber: { not: null } },
    select: { carNumber: true },
  });
  const linkedCars = new Set(linked.map((m) => normCar(m.carNumber)).filter(Boolean));

  const existing = await prisma.driverCall.findMany({ select: { kasDriverId: true } });
  const known = new Set(existing.map((e) => e.kasDriverId));
  const now = new Date();

  let inBot = 0;
  let taking = 0;
  const toCreate: DriverCall[] = [];
  // column arrays for the bulk UPDATE (existing rows only)
  const uId: number[] = [], uName: string[] = [], uPhone: (string | null)[] = [], uCar: (string | null)[] = [];
  const uModel: (string | null)[] = [], uAddr: (string | null)[] = [], uBal: number[] = [], uDebt: number[] = [];
  const uTrips: number[] = [], uRating: number[] = [], uActive: boolean[] = [], uInBot: boolean[] = [];
  for (const d of roster) {
    const linkedCar = d.carNumber ? linkedCars.has(normCar(d.carNumber)) : false;
    if (linkedCar) inBot++;
    if (isTaking(d)) taking++;
    if (known.has(d.kasId)) {
      uId.push(d.kasId); uName.push(d.fullName); uPhone.push(d.phone); uCar.push(d.carNumber);
      uModel.push(d.carModel); uAddr.push(d.address); uBal.push(Math.round(d.balance)); uDebt.push(Math.round(d.debt));
      uTrips.push(d.trips); uRating.push(d.rating); uActive.push(d.active); uInBot.push(linkedCar);
    } else {
      toCreate.push({
        kasDriverId: d.kasId, fullName: d.fullName, phone: d.phone, carNumber: d.carNumber,
        carModel: d.carModel, address: d.address, balance: Math.round(d.balance), debt: Math.round(d.debt),
        trips: d.trips, rating: d.rating, active: d.active,
        lastRideAt: d.lastRideAt ? new Date(d.lastRideAt) : null,
        licenseTerm: d.licenseTerm ? new Date(d.licenseTerm) : null,
        inBot: linkedCar, syncedAt: now,
      } as unknown as DriverCall);
    }
  }
  if (toCreate.length) {
    // createMany ignores unknown call-state columns → schema defaults fill status="new" etc.
    await prisma.driverCall.createMany({ data: toCreate as never, skipDuplicates: true });
  }
  if (uId.length) {
    // ONE round-trip: refresh kas-derived fields for all existing rows via unnest arrays.
    // Call state (status/note/callback/…) is NOT in the SET list → preserved. Beats 564 awaits (~90s → <1s).
    // lastRideAt/licenseTerm intentionally excluded (kas byFilter never repopulates them usefully).
    await prisma.$executeRaw`
      UPDATE "DriverCall" AS t SET
        "fullName" = v.name, "phone" = v.phone, "carNumber" = v.car, "carModel" = v.model,
        "address" = v.addr, "balance" = v.bal, "debt" = v.debt, "trips" = v.trips,
        "rating" = v.rating, "active" = v.active, "inBot" = v.inbot,
        "syncedAt" = now(), "updatedAt" = now()
      FROM (SELECT
        unnest(${uId}::int[]) AS kas_id,
        unnest(${uName}::text[]) AS name,
        unnest(${uPhone}::text[]) AS phone,
        unnest(${uCar}::text[]) AS car,
        unnest(${uModel}::text[]) AS model,
        unnest(${uAddr}::text[]) AS addr,
        unnest(${uBal}::int[]) AS bal,
        unnest(${uDebt}::int[]) AS debt,
        unnest(${uTrips}::int[]) AS trips,
        unnest(${uRating}::double precision[]) AS rating,
        unnest(${uActive}::boolean[]) AS active,
        unnest(${uInBot}::boolean[]) AS inbot
      ) AS v
      WHERE t."kasDriverId" = v.kas_id`;
  }

  return { total: roster.length, created: toCreate.length, updated: uId.length, inBot, taking };
}

/** Filtered, sorted call list + GLOBAL stats (stats always cover the whole table, not the filter,
 *  so the operator sees true progress). Default sort surfaces the best recruit targets first:
 *  not-in-bot, then most-recently-active (taking orders), then most experienced. */
export async function listDriverCalls(opts: {
  status?: string;
  search?: string;
  segment?: string; // notinbot | inbot | taking | idle | all
  limit?: number;
}): Promise<DriverCallList> {
  const and: object[] = [];
  if (opts.status && opts.status !== "all") and.push({ status: opts.status });
  const s = opts.search?.trim();
  if (s) {
    and.push({
      OR: [
        { fullName: { contains: s, mode: "insensitive" as const } },
        { carNumber: { contains: s, mode: "insensitive" as const } },
        { phone: { contains: s } },
      ],
    });
  }
  if (opts.segment === "notinbot") and.push({ inBot: false });
  else if (opts.segment === "inbot") and.push({ inBot: true });
  else if (opts.segment === "taking") and.push({ active: true });
  else if (opts.segment === "idle") and.push({ active: false });

  const where = and.length ? { AND: and } : {};
  const rows = await prisma.driverCall.findMany({
    where,
    orderBy: [
      { inBot: "asc" }, // not-in-bot first (false<true)
      { active: "desc" }, // working (taking orders) before idle/blocked
      { trips: "desc" },
    ],
    take: opts.limit ?? 500,
  });

  const [total, inBot, taking, byStatusRaw, last] = await Promise.all([
    prisma.driverCall.count(),
    prisma.driverCall.count({ where: { inBot: true } }),
    prisma.driverCall.count({ where: { active: true } }),
    prisma.driverCall.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.driverCall.findFirst({ orderBy: { syncedAt: "desc" }, select: { syncedAt: true } }),
  ]);
  const byStatus: Record<string, number> = {};
  for (const g of byStatusRaw) byStatus[g.status] = g._count._all;
  const called = Object.entries(byStatus).reduce((n, [k, v]) => (CONTACTED.has(k) ? n + v : n), 0);

  return {
    rows: rows.map(toRow),
    stats: {
      total,
      inBot,
      notInBot: total - inBot,
      taking,
      called,
      remaining: byStatus.new ?? 0,
      joined: byStatus.joined ?? 0,
      byStatus,
      lastSyncAt: last?.syncedAt ? last.syncedAt.toISOString() : null,
    },
  };
}

/** Log a call outcome / note / callback time for one lead. Setting a contacted status stamps
 *  calledAt + calledBy and bumps callCount (rough attempt counter). */
export async function updateDriverCall(
  id: number,
  opts: { status?: string; note?: string; callbackAt?: string | null; operator?: string },
): Promise<{ ok: boolean; row?: DriverCallRow; error?: string }> {
  if (opts.status && !CALL_STATUSES.includes(opts.status as (typeof CALL_STATUSES)[number])) {
    return { ok: false, error: "bad status" };
  }
  const data: Record<string, unknown> = {};
  if (opts.note !== undefined) data.note = opts.note || null;
  if (opts.callbackAt !== undefined) data.callbackAt = opts.callbackAt ? new Date(opts.callbackAt) : null;
  if (opts.status) {
    data.status = opts.status;
    if (CONTACTED.has(opts.status)) {
      data.calledAt = new Date();
      data.calledBy = opts.operator ?? null;
      data.callCount = { increment: 1 };
    }
  }
  if (!Object.keys(data).length) return { ok: false, error: "nothing to update" };
  try {
    const row = await prisma.driverCall.update({ where: { id }, data });
    return { ok: true, row: toRow(row) };
  } catch {
    return { ok: false, error: "not found" };
  }
}
