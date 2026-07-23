// P2P coin transfer (client<->client, client->driver tip).
//
// Closed-loop by construction: coins MOVE between members, never mint — paired
// CoinTxn rows (-amount sender / +net receiver) are written in the SAME
// transaction as the balance updates, so the reconciliation invariant
// (Member.coins == Σ CoinTxn) holds per member at all times. The burn is
// destroyed (supply shrinks), so wash-trading always loses money.
//
// Anti-funnel walls (all enforced INSIDE the transaction):
//   • two-sided daily caps — received-cap < per-member withdraw cap, so
//     funneling farm coins into one mule grants zero extra cash-out
//   • distinct-recipient fan-out cap (tips to drivers exempt)
//   • 48h account-age gate on the sender
//   • A→B→A ring reject (24h window) + admin alert on big moves
import {
  FARE_MAX_PER_TX,
  MIN_RIDES_FOR_PAID,
  TRANSFER_DAILY_RECEIVED,
  TRANSFER_DAILY_SENT,
  TRANSFER_MAX_COUNTERPARTIES,
  TRANSFER_MAX_PER_TX,
  TRANSFER_MIN,
  TRANSFER_MIN_ACCOUNT_AGE_H,
  clampTransferEcon,
  computeTransferFee,
  formatNumber,
  transferEconDefaults,
  type DriverPayLookup,
  type RecipientLookup,
  type TransferResponse,
} from "@t1067/shared";
import { prisma } from "../db";
import { withMemberLock } from "./coinService";
import { featureOn } from "./featureFlags";

const DAY_MS = 24 * 3600 * 1000;

// ── 💸 dashboard-configurable commission (AppState "tx:econ", JSON dict) ──────────────────────
export async function getTransferEcon(): Promise<Record<string, number>> {
  const defaults = transferEconDefaults();
  const row = await prisma.appState.findUnique({ where: { key: "tx:econ" } });
  if (!row) return defaults;
  let saved: Record<string, unknown> = {};
  try { saved = JSON.parse(row.value) as Record<string, unknown>; } catch { saved = {}; }
  const out: Record<string, number> = {};
  for (const k of Object.keys(defaults)) out[k] = clampTransferEcon(k, typeof saved[k] === "number" ? (saved[k] as number) : defaults[k]!);
  return out;
}
export async function setTransferEcon(key: string, value: number): Promise<Record<string, number>> {
  const cur = await getTransferEcon();
  if (key in cur) cur[key] = clampTransferEcon(key, value);
  await prisma.appState.upsert({ where: { key: "tx:econ" }, create: { key: "tx:econ", value: JSON.stringify(cur) }, update: { value: JSON.stringify(cur) } });
  return cur;
}

// Fee model. DARK (komissiya flag off) = the legacy 2% burn, unchanged — so deploy changes no
// money behavior. LIVE = the configurable commission charged ON TOP of the sender; recipient
// gets the full amount, the fee is booked to the PlatformLedger.
async function feeModel(amount: number): Promise<{ burn: number; commission: number; received: number; charged: number }> {
  const on = await featureOn("komissiya");
  const pct = on ? (await getTransferEcon()).commissionPct ?? 0 : 0;
  return computeTransferFee(amount, pct, on);
}

function norm9(phone: string): string {
  return phone.replace(/\D/g, "").slice(-9);
}

/** Resolve a transfer recipient by phone (last-9 digits, like kas lookups). */
export async function findRecipientByPhone(phone: string): Promise<{ id: number; fullName: string; type: string } | null> {
  const last9 = norm9(phone);
  if (last9.length !== 9) return null;
  const m = await prisma.member.findFirst({
    where: { phone: { endsWith: last9 } },
    select: { id: true, fullName: true, type: true },
  });
  return m;
}

// Uzbek plates are stored Latin ("01A111AA") but a Cyrillic keyboard types lookalike letters
// (01А111АА — Cyrillic А/В/С…). Map the lookalikes → Latin so either keyboard finds the same
// driver. UPPER + strip spaces too.
const CYR2LAT: Record<string, string> = {
  А: "A", В: "B", С: "C", Е: "E", Н: "H", К: "K", М: "M", О: "O", Р: "P", Т: "T", Х: "X", У: "Y", І: "I",
};
function normCar(car: string): string {
  return car.toUpperCase().replace(/\s+/g, "").split("").map((ch) => CYR2LAT[ch] ?? ch).join("");
}

/** Look up a driver by car number, tolerant of Cyrillic/Latin lookalikes + spacing/case.
 *  Scans drivers (a small set) and matches on the normalized plate so both keyboards work. */
export async function findDriverByCar(car: string): Promise<{ id: number; fullName: string; carNumber: string | null } | null> {
  const norm = normCar(car);
  if (norm.length < 4) return null;
  const drivers = await prisma.member.findMany({
    where: { type: "driver", carNumber: { not: null } },
    select: { id: true, fullName: true, carNumber: true },
  });
  return drivers.find((d) => normCar(d.carNumber ?? "") === norm) ?? null;
}

// normalized plate similarity (0..1) via Levenshtein — powers typo suggestions.
function plateSim(a: string, b: string): number {
  if (!a || !b) return 0;
  const m = a.length, n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) d[0]![j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
  return 1 - d[m]![n]! / Math.max(m, n);
}

/** Rich driver lookup for the pay-fare flow: exact match → kas details (name/phone/model/rating);
 *  no match → up to 4 closest plates as typo suggestions. Excludes the caller's own driver row. */
export async function lookupDriverForPay(car: string, selfId: number | null): Promise<DriverPayLookup> {
  const norm = normCar(car);
  if (norm.length < 4) return { found: false, suggestions: [] };
  const drivers = await prisma.member.findMany({
    where: { type: "driver", carNumber: { not: null } },
    select: { id: true, fullName: true, phone: true, carNumber: true, rating: true },
  });
  const exact = drivers.find((d) => normCar(d.carNumber ?? "") === norm && d.id !== selfId);
  if (exact) {
    let carModel = "";
    let rating = exact.rating ?? 0;
    let phone = exact.phone ?? "";
    try {
      const { getDataSource } = await import("../kas");
      const kd = await getDataSource().getDriverByCar(exact.carNumber!);
      if (kd) { carModel = kd.carModel; rating = kd.rating || rating; phone = kd.phone || phone; }
    } catch { /* kas best-effort — DB data still answers */ }
    return { found: true, id: exact.id, name: exact.fullName, phone, carNumber: exact.carNumber!, carModel, rating };
  }
  const suggestions = drivers
    .filter((d) => d.id !== selfId)
    .map((d) => ({ car: d.carNumber!, name: d.fullName, score: plateSim(norm, normCar(d.carNumber ?? "")) }))
    .filter((s) => s.score >= 0.6)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map((s) => ({ car: s.car, name: s.name }));
  return { found: false, suggestions };
}

/** Rich recipient lookup for the friend-transfer flow: name, type, phone + Telegram @username. */
export async function lookupRecipient(phone: string): Promise<RecipientLookup> {
  const last9 = norm9(phone);
  if (last9.length !== 9) return { found: false };
  const m = await prisma.member.findFirst({ where: { phone: { endsWith: last9 } }, select: { id: true, fullName: true, type: true, phone: true } });
  if (!m) return { found: false };
  const tg = await prisma.telegramUser.findFirst({ where: { memberId: m.id }, select: { username: true } });
  return { found: true, name: m.fullName, type: m.type, phone: m.phone ?? "", username: tg?.username ?? null };
}

export async function transfer(
  fromMemberId: number,
  toPhone: string,
  amount: number,
  opts: { note?: string; kind?: "transfer" | "tip" | "fare"; toMemberId?: number } = {},
): Promise<TransferResponse> {
  amount = Math.floor(amount);
  const kind = opts.kind ?? "transfer";
  // tip + fare both pay a VETTED kas driver → exempt from the anti-mule walls (counterparty
  // fan-out + two-sided daily caps + account-age). The withdraw gate still bounds real money out.
  const driverPay = kind === "tip" || kind === "fare";
  const maxTx = kind === "fare" ? FARE_MAX_PER_TX : TRANSFER_MAX_PER_TX;
  const { burn, commission, received, charged } = await feeModel(amount);

  const sender = await prisma.member.findUnique({
    where: { id: fromMemberId },
    select: { id: true, coins: true, fullName: true, phone: true, trips: true, createdAt: true, type: true },
  });
  const fail = (reason: TransferResponse["reason"]): TransferResponse => ({
    ok: false,
    reason,
    amount,
    received,
    burn,
    commission,
    charged,
    coinsLeft: sender?.coins ?? 0,
  });
  if (!sender) return fail("failed");
  if (amount < TRANSFER_MIN) return fail("below_min");
  if (amount > maxTx) return fail("over_max");

  // sender must be an established account (sybil farms are fresh). Trust the ACCOUNT's age
  // (member.createdAt), NOT the telegram LINK age — re-linking a mis-linked account (the Elbek
  // fix) must not reset trust. P2P transfers always face the gate; a TIP is exempt once you've
  // taken any ride (so you can tip your driver right after the trip).
  const acctAgeMs = sender.createdAt ? Date.now() - sender.createdAt.getTime() : 0;
  const tooNew = acctAgeMs < TRANSFER_MIN_ACCOUNT_AGE_H * 3600 * 1000;
  if (tooNew && !(driverPay && sender.trips > 0)) {
    return fail("account_too_new");
  }

  // 🚕 PAID-OUT GATE (the exploit this closes): a CLIENT must be a real taxi user (≥MIN_RIDES_FOR_PAID
  // rides) before ANY tanga leaves their account — P2P transfer, tip, OR fare. Kills the welcome-funnel
  // at the root: a freshly-linked victim has trips 0, so an onboarder holding their phone can move
  // nothing out. The sovg'a stays SPENDABLE in-app (shop/market/e'lon) — only value LEAVING the account
  // is gated. Once they've genuinely ridden ≥3×, everything (welcome included) transfers normally.
  // Drivers are vetted kas identities → exempt, same as the withdraw ride-gate.
  if (sender.type === "client" && sender.trips < MIN_RIDES_FOR_PAID) return fail("locked");

  const recipient = opts.toMemberId
    ? await prisma.member.findUnique({ where: { id: opts.toMemberId }, select: { id: true, fullName: true, type: true, phone: true } })
    : await prisma.member.findFirst({
        where: { phone: { endsWith: norm9(toPhone) } },
        select: { id: true, fullName: true, type: true, phone: true },
      });
  if (!recipient || (!opts.toMemberId && norm9(toPhone).length !== 9)) return fail("not_found");
  if (recipient.id === fromMemberId || (sender.phone && recipient.phone && norm9(sender.phone) === norm9(recipient.phone))) {
    return fail("self");
  }

  const since = new Date(Date.now() - DAY_MS);
  try {
    // Serialize this sender's transfers (same in-process lock as ride-grants/withdraw):
    // the daily-sent cap is a read-then-write on the sender's own 24h outflow, so two
    // concurrent sends could each read the same sum and both slip past. The lock makes
    // the 2nd send see the 1st's committed row → the cap holds under concurrency.
    const result = await withMemberLock(fromMemberId, () => prisma.$transaction(async (tx) => {
      // anti-mule caps — FRIEND transfers only (driver tips/fares pay a vetted kas identity and
      // bypass; only kind:"transfer" counts toward these so a fare never eats a friend budget).
      if (!driverPay) {
        const sent = await tx.transfer.aggregate({ where: { fromMemberId, kind: "transfer", createdAt: { gte: since } }, _sum: { amount: true } });
        if ((sent._sum.amount ?? 0) + amount > TRANSFER_DAILY_SENT) throw new Error("daily_sent_cap");

        const recv = await tx.transfer.aggregate({ where: { toMemberId: recipient.id, kind: "transfer", createdAt: { gte: since } }, _sum: { amount: true } });
        if ((recv._sum.amount ?? 0) + amount > TRANSFER_DAILY_RECEIVED) throw new Error("daily_received_cap");

        const partners = await tx.transfer.findMany({
          where: { fromMemberId, kind: "transfer", createdAt: { gte: since } },
          select: { toMemberId: true },
          distinct: ["toMemberId"],
        });
        const set = new Set(partners.map((p) => p.toMemberId));
        if (!set.has(recipient.id) && set.size >= TRANSFER_MAX_COUNTERPARTIES) throw new Error("too_many_recipients");
      }

      // A→B→A ring: they sent ME coins in the last 24h and now I send back (always on — cheap)
      const reverse = await tx.transfer.findFirst({
        where: { fromMemberId: recipient.id, toMemberId: fromMemberId, createdAt: { gte: since } },
        select: { id: true },
      });
      if (reverse) throw new Error("ring");

      // atomic debit of the FULL charge (amount + commission) — never goes negative
      const dec = await tx.member.updateMany({
        where: { id: fromMemberId, coins: { gte: charged } },
        data: { coins: { decrement: charged } },
      });
      if (dec.count === 0) throw new Error("insufficient");

      await tx.member.update({ where: { id: recipient.id }, data: { coins: { increment: received } } });

      const row = await tx.transfer.create({
        data: { fromMemberId, toMemberId: recipient.id, amount, burn, commission, note: opts.note?.slice(0, 120), kind },
      });
      // platform fee → company ledger (outside the member loop; tracked as income, idempotent per row)
      if (commission > 0) {
        await tx.platformLedger.create({ data: { amount: commission, source: kind, transferId: row.id } });
      }
      const label = kind === "fare" ? "Yo'l haqi" : kind === "tip" ? "Rahmat (tip)" : "P2P o'tkazma";
      await tx.coinTxn.create({
        data: { memberId: fromMemberId, amount: -charged, kind: `${kind}_out`, reason: `${label} → ${recipient.fullName}`, idempotencyKey: `transfer:${row.id}:out` },
      });
      await tx.coinTxn.create({
        data: { memberId: recipient.id, amount: received, kind: `${kind}_in`, reason: `${label} ← ${sender.fullName}`, idempotencyKey: `transfer:${row.id}:in` },
      });
      return row;
    }));

    if (amount >= 10000) {
      const { alertAdmins } = await import("./economyService");
      await alertAdmins(
        `💸 ${kind === "fare" ? "Yo'l haqi" : kind === "tip" ? "Tip" : "O'tkazma"}: <b>${formatNumber(amount)}</b> — ${sender.fullName} → ${recipient.fullName} (id ${result.id})`,
      ).catch(() => undefined);
    }
    const after = await prisma.member.findUnique({ where: { id: fromMemberId }, select: { coins: true } });
    return { ok: true, amount, received, burn, commission, charged, coinsLeft: after?.coins ?? 0, toName: recipient.fullName };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const known: TransferResponse["reason"][] = ["daily_sent_cap", "daily_received_cap", "too_many_recipients", "insufficient", "ring"];
    return fail(known.includes(msg as TransferResponse["reason"]) ? (msg as TransferResponse["reason"]) : "failed");
  }
}

/** Driver earnings view: tips + transfers in, lifetime and today. */
export async function getDriverEarnings(memberId: number): Promise<{ todayIn: number; totalIn: number; txns: { amount: number; kind: string; reason: string; at: string }[] }> {
  const since = new Date(Date.now() - DAY_MS);
  const inKinds = ["tip_in", "fare_in", "transfer_in", "driver_bonus"];
  const [today, total, txns] = await Promise.all([
    prisma.coinTxn.aggregate({ where: { memberId, kind: { in: inKinds }, createdAt: { gte: since } }, _sum: { amount: true } }),
    prisma.coinTxn.aggregate({ where: { memberId, kind: { in: inKinds } }, _sum: { amount: true } }),
    prisma.coinTxn.findMany({ where: { memberId }, orderBy: { createdAt: "desc" }, take: 15 }),
  ]);
  return {
    todayIn: today._sum.amount ?? 0,
    totalIn: total._sum.amount ?? 0,
    txns: txns.map((t) => ({ amount: t.amount, kind: t.kind, reason: t.reason, at: t.createdAt.toISOString() })),
  };
}
