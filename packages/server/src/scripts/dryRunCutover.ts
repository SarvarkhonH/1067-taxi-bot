/**
 * Rehearse the cutover — and the way back — against REAL data, writing nothing.
 *
 * The KAS_MODE=birjoy boot guard refuses the switch for four reasons, and two
 * of them are this script:
 *
 *   • "the cutover member-matching has never touched real data"
 *   • "no rollback has been rehearsed"
 *
 * Both are about one decision: when the same human arrives under a different
 * id, do we land on their existing row or make a new one? Get it wrong and
 * nothing errors — their tanga simply stays on a row nobody can see, and the
 * first anyone hears of it is a customer who cannot spend their balance.
 *
 * So this runs the REAL matcher (chooseMemberRow) over the REAL member table
 * and the REAL answers the taxi core would give, and reports what would happen.
 * Both directions:
 *
 *   forward   the taxi core starts answering; everyone arrives as "bj_…"
 *   back      KAS_MODE=live again; everyone arrives under their kas id, at a
 *             table the cutover has already rewritten
 *
 * The round trip matters more than either half. A cutover that lands perfectly
 * and cannot be undone is not a cutover, it is a one-way door.
 *
 * READ-ONLY. It opens no write path: no create, update, upsert or delete, and
 * a guard test enforces that by reading this file. Run it whenever you like,
 * including while the bot is serving.
 *
 * Run on the VPS:
 *   cd /opt/app && pnpm --filter @t1067/server exec dotenv -e ../../.env -- \
 *     tsx src/scripts/dryRunCutover.ts
 */
import { prisma } from "../db";
import { env } from "../env";
import { BirJoySource } from "../kas/birjoy";
import {
  chooseMemberRow,
  normPhone,
  isBridgeKasId,
  isKasMintedId,
  type MemberRow,
  type MemberMatch,
} from "@t1067/shared";

interface Row extends MemberRow {
  coins: number;
  points: number;
  fullName: string;
}

interface Incoming {
  type: "client" | "driver";
  kasId: string;
  phone?: string | null;
  fullName: string;
}

const uzs = (n: number) => Math.round(n).toLocaleString("en-US").replace(/,/g, " ");

/** The candidate set upsertKasMember builds: rows sharing the last nine digits. */
function candidatesFor(phone: string | null | undefined, rows: Row[]): Row[] {
  const want = normPhone(phone);
  if (want.length !== 9) return [];
  return rows.filter((r) => normPhone(r.phone) === want);
}

function run(incoming: Incoming[], rows: Row[]): { m: Incoming; v: MemberMatch }[] {
  return incoming.map((m) => ({ m, v: chooseMemberRow({ type: m.type, kasId: m.kasId, phone: m.phone }, candidatesFor(m.phone, rows)) }));
}

/** Prints what would happen, and returns the table as it would then look. */
function report(title: string, results: { m: Incoming; v: MemberMatch }[], rows: Row[]): Row[] {
  const counts = { update: 0, adopt: 0, create: 0 };
  const whys: Record<string, number> = {};
  let strandedCoins = 0;
  let strandedPoints = 0;
  const stranded: string[] = [];

  for (const { m, v } of results) {
    counts[v.action]++;
    if (v.action === "adopt") whys[v.why] = (whys[v.why] ?? 0) + 1;

    // The failure this whole exercise is about: a NEW row for somebody who
    // already has one. Their balance stays behind on the old row.
    if (v.action === "create") {
      const near = candidatesFor(m.phone, rows);
      if (near.length > 0) {
        const worst = near.reduce((a, b) => (b.coins + b.points > a.coins + a.points ? b : a));
        strandedCoins += worst.coins;
        strandedPoints += worst.points;
        if (stranded.length < 10) {
          stranded.push(`    ${m.type} ${m.kasId} (${m.fullName || "ismsiz"}) → yangi qator, lekin #${worst.id} bor: ${uzs(worst.coins)} tanga, ${uzs(worst.points)} ball`);
        }
      }
    }
  }

  console.log(`\n${title}`);
  console.log(`  kirgan: ${results.length}`);
  console.log(`  update : ${counts.update}   (o'sha qator, o'sha id)`);
  console.log(`  adopt  : ${counts.adopt}   ${Object.entries(whys).map(([w, n]) => `${w}=${n}`).join(" ")}`);
  console.log(`  create : ${counts.create}`);

  if (strandedCoins + strandedPoints > 0) {
    console.log(`  ⚠️  ORFAN QOLADIGAN PUL: ${uzs(strandedCoins)} tanga + ${uzs(strandedPoints)} ball`);
    for (const line of stranded) console.log(line);
  } else {
    console.log("  ✅ hech kimning puli orfan qolmaydi");
  }

  // What the table looks like afterwards, for the next leg of the round trip.
  const after = rows.map((r) => ({ ...r }));
  const seen = new Set<number>();
  for (const { m, v } of results) {
    if (v.action === "adopt" || v.action === "update") {
      const copy = after.find((r) => r.id === v.id);
      if (copy && !seen.has(v.id)) {
        // memberService writes `{ type, kasId, ...data }` on adopt — the row's
        // id survives, its identity does not.
        copy.type = m.type;
        copy.kasId = m.kasId;
        seen.add(v.id);
      }
    }
  }
  return after;
}

async function main(): Promise<void> {
  if (!env.KAS_BIRJOY_URL || !env.KAS_SERVICE_TOKEN) {
    throw new Error("KAS_BIRJOY_URL / KAS_SERVICE_TOKEN kerak — ko'prik manzili yo'q");
  }

  const rows: Row[] = (
    await prisma.member.findMany({
      select: { id: true, type: true, kasId: true, phone: true, coins: true, points: true, fullName: true },
    })
  ).map((m) => ({ id: m.id, type: m.type, kasId: m.kasId, phone: m.phone, coins: m.coins, points: m.points, fullName: m.fullName }));

  const totalCoins = rows.reduce((n, r) => n + r.coins, 0);
  console.log("═".repeat(72));
  console.log("QURUQ YURGIZISH — hech narsa yozilmaydi");
  console.log("═".repeat(72));
  console.log(`botdagi a'zo qatorlari : ${rows.length}`);
  console.log(`  kas id bilan         : ${rows.filter((r) => !isBridgeKasId(r.kasId) && !r.kasId.startsWith("tg_")).length}`);
  console.log(`  o'zi ro'yxatdan (tg_): ${rows.filter((r) => r.kasId.startsWith("tg_")).length}`);
  console.log(`  ko'prik (bj_)        : ${rows.filter((r) => isBridgeKasId(r.kasId)).length}`);
  console.log(`  telefoni bor         : ${rows.filter((r) => normPhone(r.phone).length === 9).length}`);
  console.log(`jami tanga             : ${uzs(totalCoins)}`);

  // The real path the cutover would take, not a re-implementation of it.
  const source = new BirJoySource({ baseUrl: env.KAS_BIRJOY_URL, serviceToken: env.KAS_SERVICE_TOKEN });
  const incoming = (await source.fetchMembers()).map((m) => ({
    type: m.type as "client" | "driver",
    kasId: m.kasId,
    phone: m.phone,
    fullName: m.fullName,
  }));

  const afterCutover = report(
    "① OLDINGA — taksi yadrosi javob bera boshladi (hamma 'bj_' bilan keladi)",
    run(incoming, rows),
    rows,
  );

  // The way back. kas sends every human under the id IT minted — which is
  // exactly what those rows held before the cutover rewrote them. A tg_ row is
  // somebody kas has never heard of, so kas sends nothing for them and they are
  // not part of this leg.
  const backFromKas: Incoming[] = rows
    .filter((r) => isKasMintedId(r.kasId))
    .map((r) => ({ type: r.type as "client" | "driver", kasId: r.kasId, phone: r.phone, fullName: r.fullName }));

  report("② ORQAGA — KAS_MODE=live (yagona chiqish yo'li)", run(backFromKas, afterCutover), afterCutover);

  console.log("\n" + "═".repeat(72));
  console.log("hech narsa yozilmadi.");
  await prisma.$disconnect();
}

void main().catch(async (e) => {
  console.error("dry run failed:", e instanceof Error ? e.message : e);
  await prisma.$disconnect();
  process.exit(1);
});
