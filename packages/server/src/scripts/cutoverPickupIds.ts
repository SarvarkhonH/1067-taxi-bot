/**
 * Carry every remembered pickup across the switch from kas1067 to our own taxi core.
 *
 * Stored place ids (Member.lastPickupId / defaultPickupId / recentPickupsJson,
 * pending ScheduledRide.addressId, and the "district_<id>" badge types) were all
 * issued by kas1067. The core numbers the same places differently and keeps
 * kas's number as `externalId`. For a catalogue id the core uses ITS coordinates,
 * so a one-tap "Shabada" left alone would dispatch a car to whichever place the
 * core numbers the same — nothing would error.
 *
 * It also clears ride state left from kas1067 (lastBookingId below the bridge
 * offset): the core never lists those ids, so the first sweep would otherwise
 * treat every one of them as a finished ride and pay its rewards.
 *
 * The mapping rule lives in @t1067/shared/pickupRemap (tested). This script:
 *   • dry run by default — prints what would change, writes nothing
 *   • --go writes everything AND the "done" marker in ONE transaction: a failure
 *     leaves nothing half-migrated, and a second run refuses (it would read the
 *     core's new ids as kas ids)
 *
 * ORDER: run it BEFORE the bot restarts on the new code (kas1067 is down, so the
 * old process saves no new pickups meanwhile). After the switch the bot stores
 * core ids, and this script would read those as kas ids.
 *
 * Needs the core's `GET /addresses` to include `externalId`. Refuses to run if it
 * does not.
 *
 * Run on the VPS, right before the cutover deploy (the core URL and token must be
 * in the environment, e.g. KAS_BIRJOY_URL / KAS_SERVICE_TOKEN):
 *   cd /opt/app/packages/server && npx dotenv -e ../../.env -- npx tsx src/scripts/cutoverPickupIds.ts [--go]
 */
import { BRIDGE_ID_OFFSET, remapPickupId, remapRecentPickups, type CorePlace, type RecentPickup } from "@t1067/shared";
import { prisma } from "../db";
import { env } from "../env";

const GO = process.argv.includes("--go");
const MARK = "cutover:pickupIds:v1";

async function corePlacesByKasId(): Promise<Map<number, CorePlace>> {
  if (!env.KAS_SERVICE_TOKEN) throw new Error("KAS_SERVICE_TOKEN is empty");
  const url = `${env.KAS_BIRJOY_URL.replace(/\/+$/, "")}/addresses?limit=1000`;
  const res = await fetch(url, { headers: { "x-service-token": env.KAS_SERVICE_TOKEN }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`GET /addresses → HTTP ${res.status}`);
  const rows = (await res.json()) as Array<{ id: number; name: string; lat?: string | number | null; lng?: string | number | null; externalId?: number | null }>;
  const map = new Map<number, CorePlace>();
  for (const r of rows) {
    if (r.externalId == null) continue;
    map.set(Number(r.externalId), {
      id: Number(r.id),
      name: r.name,
      lat: r.lat != null ? Number(r.lat) : undefined,
      lng: r.lng != null ? Number(r.lng) : undefined,
    });
  }
  console.log(`taksi tizimi: ${rows.length} joy, ${map.size} tasida kas raqami (externalId) bor`);
  return map;
}

async function main(): Promise<void> {
  console.log("═".repeat(72));
  console.log(GO ? "YOZISH (--go)" : "QURUQ YURGIZISH — hech narsa yozilmaydi");
  console.log("═".repeat(72));

  const done = await prisma.appState.findUnique({ where: { key: MARK } });
  if (done) {
    console.log(`⛔ Allaqachon bajarilgan (${done.updatedAt.toISOString()}): ${done.value}`);
    console.log("   Qayta yurgizish taksi tizimi raqamlarini kas raqamlari deb o'qiydi — to'xtatildi.");
    return;
  }

  // Stored ids are read as kas ids. Once the bot has run on the core it stores the core's own ids,
  // and a late run would re-map those — refuse if there is any sign the switch already happened.
  const liveRides = await prisma.member.count({ where: { lastBookingId: { gte: BRIDGE_ID_OFFSET } } });
  const paidRides = await prisma.rideReward.count({ where: { bookingId: { gte: BRIDGE_ID_OFFSET } } });
  const coreCatalog = await prisma.appState.findUnique({ where: { key: "taxi:addressCatalog" } });
  if (liveRides > 0 || paidRides > 0 || coreCatalog) {
    throw new Error(
      `Bot allaqachon yangi tizimda ishlagan (faol safar: ${liveRides}, to'langan safar: ${paidRides}, katalog nusxasi: ${coreCatalog ? "bor" : "yo'q"}). ` +
        "Skript faqat kas raqamlari uchun — endi yurgizilmaydi.",
    );
  }

  const map = await corePlacesByKasId();
  if (map.size === 0) {
    throw new Error("Taksi tizimi /addresses javobida externalId yo'q — avval 1067-taxi o'zgarishini chiqaring.");
  }

  // ── members ──
  const members = await prisma.member.findMany({
    where: { OR: [{ lastPickupId: { not: null } }, { defaultPickupId: { not: null } }, { recentPickupsJson: { not: null } }] },
    select: { id: true, lastPickupId: true, lastPickupLat: true, lastPickupLng: true, defaultPickupId: true, recentPickupsJson: true },
  });
  const tally = { last: { mapped: 0, coordsOnly: 0, forgotten: 0 }, def: { mapped: 0, forgotten: 0 }, recentMembers: 0, recentDropped: 0 };
  const writes: Array<{ id: number; data: Record<string, unknown> }> = [];
  for (const m of members) {
    const data: Record<string, unknown> = {};
    if (m.lastPickupId && m.lastPickupId > 0) {
      const next = remapPickupId(m.lastPickupId, m.lastPickupLat != null && m.lastPickupLng != null, map);
      if (next === null) { tally.last.forgotten++; data.lastPickupId = null; data.lastPickupName = null; data.lastPickupLat = null; data.lastPickupLng = null; }
      else if (next < 0) { tally.last.coordsOnly++; data.lastPickupId = next; }
      else { tally.last.mapped++; data.lastPickupId = next; }
    }
    if (m.defaultPickupId && m.defaultPickupId > 0) {
      const next = remapPickupId(m.defaultPickupId, false, map);
      if (next === null) { tally.def.forgotten++; data.defaultPickupId = null; data.defaultPickupName = null; }
      else { tally.def.mapped++; data.defaultPickupId = next; }
    }
    if (m.recentPickupsJson) {
      let list: RecentPickup[] = [];
      try { list = JSON.parse(m.recentPickupsJson) as RecentPickup[]; } catch { list = []; }
      if (Array.isArray(list) && list.length) {
        const next = remapRecentPickups(list, map);
        tally.recentMembers++;
        tally.recentDropped += list.length - next.length;
        data.recentPickupsJson = JSON.stringify(next);
      }
    }
    if (Object.keys(data).length) writes.push({ id: m.id, data });
  }

  // ── scheduled rides still waiting ──
  const scheduled = await prisma.scheduledRide.findMany({ where: { status: "pending" }, select: { id: true, addressId: true } });
  const schedWrites: Array<{ id: number; addressId: number | null }> = [];
  for (const r of scheduled) {
    if (r.addressId <= 0) continue;
    schedWrites.push({ id: r.id, addressId: remapPickupId(r.addressId, false, map) });
  }
  const schedLost = schedWrites.filter((w) => w.addressId === null);

  // ── district badges ── renamed as a permutation: every moving type leaves its old code first
  // (phase 1), so one type's new code may be another's old code. A target held by a type that is
  // NOT moving is a real clash: reported, and --go refuses.
  const districtTypes = await prisma.itemType.findMany({ where: { code: { startsWith: "district_" } }, select: { id: true, code: true } });
  const renames: Array<{ id: number; from: string; to: string }> = [];
  for (const t of districtTypes) {
    const kasId = Number(t.code.slice("district_".length));
    if (!Number.isFinite(kasId)) continue; // already not a kas-numbered badge (e.g. district_kas_…)
    const hit = map.get(kasId);
    // A kas place the core does not know keeps its badge under a name no core id can ever take —
    // otherwise the core's own place with that number would find it "already visited".
    const to = hit ? `district_${hit.id}` : `district_kas_${kasId}`;
    if (to !== t.code) renames.push({ id: t.id, from: t.code, to });
  }
  const moving = new Set(renames.map((r) => r.id));
  const holderOf = new Map(districtTypes.map((t) => [t.code, t.id] as const));
  const clashes = renames.filter((r) => {
    const holder = holderOf.get(r.to);
    return holder !== undefined && !moving.has(holder);
  });
  const targetCount = new Map<string, number>();
  for (const r of renames) targetCount.set(r.to, (targetCount.get(r.to) ?? 0) + 1);
  const dupTargets = [...targetCount.entries()].filter(([, n]) => n > 1).map(([code]) => code);

  // ── ride state left from kas1067 ──
  const staleRides = await prisma.member.count({ where: { lastBookingId: { not: null, lt: BRIDGE_ID_OFFSET } } });

  console.log(`\na'zolar ko'rildi          : ${members.length}`);
  console.log(`oxirgi manzil             : ${tally.last.mapped} ko'chirildi · ${tally.last.coordsOnly} faqat koordinata bilan · ${tally.last.forgotten} unutildi`);
  console.log(`odatiy manzil             : ${tally.def.mapped} ko'chirildi · ${tally.def.forgotten} unutildi`);
  console.log(`«Yana shu yo'l» ro'yxati  : ${tally.recentMembers} a'zo · ${tally.recentDropped} ta joy tushib qoldi`);
  console.log(`rejalashtirilgan safar    : ${schedWrites.length - schedLost.length} ko'chirildi · ${schedLost.length} joyi topilmadi (bekor qilinadi)`);
  console.log(`tuman nishonlari          : ${renames.length} ta tur yangi raqamga o'tadi · ${clashes.length} to'qnashuv · ${dupTargets.length} ikki tur bir nishonga`);
  console.log(`kas davridan qolgan safar : ${staleRides} a'zoda — mukofotsiz tozalanadi`);
  for (const c of clashes) console.log(`  ⚠️ to'qnashuv: ${c.from} → ${c.to} (band)`);
  for (const d of dupTargets) console.log(`  ⚠️ ikki tur bitta nishonga: ${d}`);

  if (clashes.length || dupTargets.length) {
    console.log("\n⛔ Nishon nomlarida to'qnashuv bor — --go rad etiladi. Avval qo'lda hal qiling.");
    return;
  }
  if (!GO) {
    console.log("\nhech narsa yozilmadi. Yozish uchun: --go");
    return;
  }

  const cleared = await prisma.$transaction(
    async (tx) => {
      for (const w of writes) await tx.member.update({ where: { id: w.id }, data: w.data });
      for (const w of schedWrites) {
        if (w.addressId === null) await tx.scheduledRide.update({ where: { id: w.id }, data: { status: "failed" } });
        else await tx.scheduledRide.update({ where: { id: w.id }, data: { addressId: w.addressId } });
      }
      for (const r of renames) await tx.itemType.update({ where: { id: r.id }, data: { code: `district_moving_${r.id}` } });
      for (const r of renames) await tx.itemType.update({ where: { id: r.id }, data: { code: r.to } });
      const c = await tx.member.updateMany({
        where: { lastBookingId: { not: null, lt: BRIDGE_ID_OFFSET } },
        data: { lastBookingId: null, lastBookingStatus: null, lastBookingBonus: null, rideCardMsgId: null, liveLocMsgId: null, rideStartedAt: null },
      });
      await tx.appState.deleteMany({ where: { key: "kas:addressCatalog" } });
      await tx.appState.create({
        data: {
          key: MARK,
          value: JSON.stringify({ members: writes.length, scheduled: schedWrites.length, districts: renames.length, staleRides: c.count, at: new Date().toISOString() }),
        },
      });
      return c.count;
    },
    { timeout: 120_000, maxWait: 10_000 },
  );
  for (const w of schedLost) console.log(`  rejalashtirilgan safar #${w.id} bekor qilindi (joyi topilmadi)`);
  console.log(`\n✅ yozildi (bitta tranzaksiya): ${writes.length} a'zo · ${schedWrites.length} rejalashtirilgan safar · ${renames.length} nishon turi · ${cleared} eski safar holati. Belgi: ${MARK}`);
}

main()
  .catch((e) => {
    console.error("❌", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
