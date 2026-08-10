import {
  bookingCancellable,
  bookingStatusLabel,
  haversineKm,
  type ActiveBookingView,
  type BookingCancelResponse,
  type BookingCreateBody,
  type BookingCreateResponse,
  type BookingInfoResponse,
  type BookingNowBody,
  type BookingNowResponse,
  type FareQuote,
  type GeoPt,
  type SavedAddressView,
} from "@t1067/shared";
import { prisma } from "../db";
import { env } from "../env";
import { getDataSource, type RideHistoryItem } from "../kas";
import { getFareConfig } from "./clientInfoService";

export interface RideHistoryFull {
  rides: RideHistoryItem[];
  totals: { count: number; spent: number; cashback: number; savingsPct: number };
}

/** Full rider history + lifetime totals, shared by the Mini App endpoint AND the bot /tarix.
 *  Pagination is adaptive (most riders fit one page → one call). savingsPct is a DETERMINISTIC
 *  per-rider vanity number in 10–15% (owner decision — a friendly "siz X% tejadingiz", same value
 *  every time for a given rider so it never flickers; NOT the real cashback/spend ratio). */
export async function getRideHistoryFull(memberId: number, phone: string): Promise<RideHistoryFull> {
  const ds = getDataSource();
  const SIZE = 50;
  const MAX_PAGES = 8; // cap 400 rides
  const rides: RideHistoryItem[] = [];
  for (let p = 0; p < MAX_PAGES; p++) {
    const page = await ds.getRideHistory(phone, SIZE, p).catch(() => [] as RideHistoryItem[]);
    rides.push(...page);
    if (page.length < SIZE) break;
  }
  const spent = rides.reduce((s, r) => s + (r.payment || 0), 0);
  const cashback = rides.reduce((s, r) => s + (r.cashback || 0), 0);
  const savingsPct = 10 + ((memberId * 7 + 3) % 6); // 10..15, stable per rider
  return { rides, totals: { count: rides.length, spent, cashback, savingsPct } };
}

const CITY_KMH = 24; // assumed city speed for ETA

async function phoneOf(memberId: number): Promise<{ phone: string; name: string; bonus: number } | null> {
  const m = await prisma.member.findUnique({ where: { id: memberId }, select: { phone: true, fullName: true, points: true } });
  return m?.phone ? { phone: m.phone, name: m.fullName, bonus: m.points } : null;
}

async function toView(
  b: Awaited<ReturnType<ReturnType<typeof getDataSource>["getActiveBooking"]>>,
): Promise<ActiveBookingView | null> {
  if (!b) return null;
  // "new" = kas is still OFFERING the ride — it already carries a CANDIDATE carNumber (the car being
  // offered), but no driver has ACCEPTED yet. Surfacing that candidate as `driver` made the Mini App
  // flip to "Haydovchi QABUL qildi" (plate-zoom popup + success haptic + assigned-poll cadence) while
  // the ride was really still searching. Mirror the bot sweep's guard (bookingNotifier: status !==
  // "new") here: no driver until an actual acceptance ("take"+). Status label already reads
  // "🔍 Haydovchi qidirilyapti" for "new", so the card stays honestly in the searching state.
  const drv = b.status === "new" ? null : b.driver;
  let etaMin: number | null = null;
  if (drv?.lat && drv?.lng && b.lat && b.lng) {
    etaMin = Math.max(1, Math.ceil((haversineKm({ lat: drv.lat, lng: drv.lng }, { lat: b.lat, lng: b.lng }) / CITY_KMH) * 60));
  }
  // 📷 driver portrait: look up the driver by carNumber, expose the proxy URL ONLY when a photo is
  // configured — saves the rider a wasted 404 request when the driver isn't linked / has no avatar.
  let photoUrl: string | undefined;
  if (drv?.carNumber) {
    const dm = await prisma.member.findFirst({
      where: { type: "driver", carNumber: drv.carNumber },
      select: { id: true, photoFileId: true, photoUrl: true },
    }).catch(() => null);
    if (dm && (dm.photoUrl || dm.photoFileId)) photoUrl = `/api/driver-photo/${dm.id}`;
  }
  return {
    id: b.id,
    status: b.status,
    statusLabel: bookingStatusLabel(b.status),
    addressName: b.addressName,
    pickup: b.lat && b.lng ? { lat: b.lat, lng: b.lng } : null,
    cashback: b.clientBonus,
    etaMin,
    canCancel: bookingCancellable(b.status),
    notifiedCount: b.notifiedCount,
    driver: drv
      ? {
          fullName: drv.fullName,
          phone: drv.phone,
          carModel: drv.carModel,
          carNumber: drv.carNumber,
          rating: drv.rating,
          lat: drv.lat,
          lng: drv.lng,
          bearing: drv.bearing,
          meterPayment: drv.meterPayment,
          photoUrl,
        }
      : null,
  };
}

export async function getBookingInfo(memberId: number): Promise<BookingInfoResponse | { error: string }> {
  const who = await phoneOf(memberId);
  if (!who) return { error: "no phone" };
  const ds = getDataSource();
  const [client, area, company, fare, addons, active, quickPickup] = await Promise.all([
    ds.checkClient(who.phone).catch(() => null),
    ds.getServiceArea().catch(() => []),
    ds.getCompanyInfo().catch(() => ({ companyName: "1067", dispatcherPhones: [], lat: 39.04, lng: 65.57 })),
    getFareConfig().catch(() => null),
    ds.getBookingAddons().catch(() => []),
    ds.getActiveBooking(who.phone).catch(() => null),
    getQuickPickup(memberId).catch(() => null),
  ]);
  const saved: SavedAddressView[] = (client?.addresses ?? []).map((a) => ({ id: a.id, name: a.name, lat: a.lat, lng: a.lng, surcharge: a.surcharge }));
  // T4: the default-pickup branch of getQuickPickup carries no coords (no schema column for it);
  // resolve them from the freshly-fetched saved list so the 1-tap pin-drop + recenter work.
  let quick = quickPickup;
  if (quick && (quick.lat == null || quick.lng == null)) {
    const qid = quick.id;
    const hit = saved.find((a) => a.id === qid);
    if (hit) quick = { ...quick, lat: hit.lat, lng: hit.lng };
  }
  // 🪙 wait-comp preview config — null while the flag is OFF so the client doesn't render a running
  // estimate for a mechanic that won't actually pay out.
  const { featureOn } = await import("./featureFlags");
  let waitComp: BookingInfoResponse["waitComp"] = null;
  if (await featureOn("waitcomp")) {
    const { getBonusEcon } = await import("./bonusConfig");
    const econ = await getBonusEcon();
    waitComp = { graceSec: econ.waitCompGraceSec ?? 20, fullSec: econ.waitCompFullSec ?? 300, ceiling: econ.waitCompCeiling ?? 2000 };
  }
  return {
    clientName: client?.clientName ?? who.name,
    serviceArea: area.map((p) => ({ lat: p.lat, lng: p.lng })),
    center: { lat: company.lat || 39.04, lng: company.lng || 65.57 },
    savedAddresses: saved,
    cars: (fare?.cars ?? []).map((c) => ({ id: c.id, name: c.name, category: 0, photo: null })),
    addons: addons.map((a) => ({ id: a.id, name: a.name, price: a.price })),
    cashbackPerRide: fare?.cashback.perAppRide ?? 0,
    bonusBalance: who.bonus,
    bookingLive: env.bookingLive,
    active: await toView(active),
    quickPickup: quick,
    tariff: fare ? { minimalPayment: fare.minimalPayment, minimalDistanceKm: fare.minimalDistanceKm, perKmCity: fare.perKmCity, perMinute: fare.perMinute } : null,
    waitComp,
    // ☎️ Birinchi dispetcher raqami — mijozning "hech kim javob bermadi" holatidagi tirik yo'li.
    // Bo'sh satr `null` ga aylantiriladi: aks holda mijoz `tel:` bo'sh tugmani ko'rardi.
    dispatcherPhone: company.dispatcherPhones?.[0]?.trim() || null,
  };
}

export async function searchBookingAddress(q: string): Promise<SavedAddressView[]> {
  const res = await getDataSource().searchAddresses(q).catch(() => []);
  return res.map((a) => ({ id: a.id, name: a.name, lat: a.lat, lng: a.lng, surcharge: a.surcharge }));
}

/** The whole company catalog (~150 named Koson places) for the rider-side picker. kas caches it for
 *  6h, so browsing/filtering costs no extra upstream call — the client filters and sorts locally
 *  instead of round-tripping every keystroke through the narrower byName search. */
export async function listCatalogPlaces(): Promise<SavedAddressView[]> {
  const cat = await getDataSource().getAllAddresses().catch(() => [] as SavedAddressView[]);
  return cat.map((a) => ({ id: a.id, name: a.name, lat: a.lat, lng: a.lng, surcharge: a.surcharge }));
}

/** M7 center-pin: nearest kas catalog address to an arbitrary map point — the official rider
 *  app's getAddressByLocation (Haversine over the full company catalog from checkClient). READ-ONLY:
 *  the returned address is then booked through the unchanged createBooking-by-addressId path, so
 *  the dispatch flow is untouched (no raw lat/lng booking). */
export async function nearestAddressFor(memberId: number, lat: number, lng: number): Promise<SavedAddressView | null> {
  void memberId; // catalog is company-wide, not per-member (kept in the signature for the route)
  const hit = await nearestCatalogAddress(lat, lng);
  return hit ? hit.addr : null;
}

/** Nearest place in the FULL company catalog (~111 named addresses) to an arbitrary map point —
 *  the official rider app's getAddressByLocation. Returns the address + its distance so callers can
 *  label a pin honestly ("Shabada" when on it, "Shabada yaqini" when a few hundred metres off). */
export async function nearestCatalogAddress(lat: number, lng: number): Promise<{ addr: SavedAddressView; km: number } | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const cat = await getDataSource().getAllAddresses().catch(() => [] as SavedAddressView[]);
  let best: SavedAddressView | null = null;
  let bestKm = Infinity;
  for (const a of cat) {
    if (a.lat == null || a.lng == null) continue;
    const km = haversineKm({ lat, lng }, { lat: a.lat, lng: a.lng });
    if (km < bestKm) {
      bestKm = km;
      best = { id: a.id, name: a.name, lat: a.lat, lng: a.lng, surcharge: a.surcharge };
    }
  }
  return best ? { addr: best, km: bestKm } : null;
}

/** Human label for a map pin: nearest catalog place, with a "yaqini" suffix when the pin is a few
 *  hundred metres off it (so the driver knows it's an approximate reference, not the exact door). */
export async function pinLabel(lat: number, lng: number): Promise<string> {
  const hit = await nearestCatalogAddress(lat, lng);
  if (!hit) return "Xaritada belgilangan nuqta";
  return hit.km <= 0.15 ? hit.addr.name : `${hit.addr.name} yaqini`;
}

/** Fare estimate for a pickup→destination distance (kas dispatch stays pickup-only). */
export async function estimateFare(pickup: GeoPt, dest: GeoPt, surcharge = 0): Promise<FareQuote> {
  const f = await getFareConfig();
  const km = haversineKm(pickup, dest);
  const billable = Math.max(0, km - (f?.minimalDistanceKm ?? 3));
  const base = f?.minimalPayment ?? 8000;
  const perKm = f?.perKmCity ?? 1800;
  const total = Math.round(base + billable * perKm + surcharge);
  return { km: +km.toFixed(1), base, perKm, surcharge, total, cashback: f?.cashback.perAppRide ?? 0 };
}

export async function createBookingFor(memberId: number, body: BookingCreateBody, source = "miniapp"): Promise<BookingCreateResponse> {
  const who = await phoneOf(memberId);
  if (!who) return { ok: false, live: false, message: "Telefon raqami topilmadi" };

  // T4 (money-shield): server-side double-dispatch guard. The miniapp `busy` flag does NOT
  // survive a reload / second tab / slow double-tap; phantom dispatches waste real drivers
  // (our moat). Mirrors the hardened 1-tap path (callOneTapFor). No coins are minted here.
  const active = await getActiveBookingFor(memberId);
  if (active) { console.log(`[dispatch] m${memberId} src=${source} blocked=active-booking (b${active.id ?? "?"})`); return { ok: false, live: env.bookingLive, message: "Sizda faol buyurtma bor" }; }
  // Throttle window shrinks when the last claim never became a tracked ride (see DEAD_REBOOK_MS).
  const trow = await prisma.member.findUnique({ where: { id: memberId }, select: { lastBookingAt: true, lastBookingId: true } });
  const throttleMs = trow?.lastBookingId == null ? DEAD_REBOOK_MS : ONE_TAP_THROTTLE_MS;
  if (trow?.lastBookingAt && Date.now() - trow.lastBookingAt.getTime() < throttleMs) {
    console.log(`[dispatch] m${memberId} src=${source} blocked=throttle (${Math.round((Date.now() - trow.lastBookingAt.getTime()) / 1000)}s<${throttleMs / 1000}s, dead=${trow.lastBookingId == null})`);
    return { ok: false, live: env.bookingLive, message: "Hozirgina buyurtma yuborilgan — biroz kuting" };
  }

  // add-ons + per-address surcharge → additionalPayment
  let additionalPayment = 0;
  if (body.addonIds?.length) {
    const addons = await getDataSource().getBookingAddons().catch(() => []);
    additionalPayment += addons.filter((a) => body.addonIds!.includes(a.id)).reduce((s, a) => s + a.price, 0);
  }

  // M7 center-pin: raw map point (pickupId 0) → dispatch to the exact pin (addressId 0 +
  // addressLatitude/Longitude), same proven path as a Telegram GPS-location share. Absent for
  // normal saved-address orders → behaviour identical to before.
  const hasPin = Number.isFinite(body.lat) && Number.isFinite(body.lng);
  // Resolve the nearest REAL catalog place server-side so the DRIVER gets a meaningful name (e.g.
  // "Shabada"), never "Xaritada belgilangan nuqta" — regardless of what the client sent. The exact
  // lat/lng is still dispatched for precise navigation; this only fixes the human label.
  const pinName = hasPin ? await pinLabel(body.lat!, body.lng!) : body.pickupName;
  const pinMem = { id: body.pickupId, name: pinName, lat: hasPin ? body.lat! : null, lng: hasPin ? body.lng! : null };

  if (!env.bookingLive) {
    await rememberPickup(memberId, pinMem, source);
    return { ok: true, live: false, message: "TEST rejimi — haqiqiy taxi chaqirilmadi" };
  }
  // atomic anti-double-dispatch claim (the early throttle check above is only a fast UX reject)
  const slot = await claimDispatchSlot(memberId, throttleMs);
  if (!slot.ok) return { ok: false, live: true, message: "Hozirgina buyurtma yuborilgan — biroz kuting" };
  const res = await getDataSource()
    .createBooking({
      clientName: who.name,
      addressName: pinName,
      addressId: body.pickupId,
      phoneNumber: who.phone,
      additionalPayment,
      ...(hasPin ? { addressLatitude: body.lat, addressLongitude: body.lng } : {}),
    })
    .catch((e) => ({ ok: false, message: e instanceof Error ? e.message : String(e) }));
  // dispatch outcome trace — proves whether kas ACCEPTED the order (ok=true then no driver = the
  // "created but silently died" bug) vs REJECTED it (ok=false + reason). Read from Render logs.
  console.log(`[dispatch] m${memberId} src=${source} pin=${hasPin ? "map" : body.pickupId} → ok=${res.ok}${res.ok ? "" : ` msg="${res.message ?? ""}"`}`);
  if (res.ok) {
    await rememberPickup(memberId, pinMem, source);
    // ⚡ arm the instant-status socket NOW (before the driver accepts) so take_booking lands in ~1-2s
    void import("./kasClientSocket").then(({ armInstant }) => armInstant(memberId, who.phone)).catch(() => undefined);
  } else await releaseDispatchSlot(memberId, slot.prev);
  return { ok: res.ok, live: true, message: res.message };
}

export async function cancelBookingFor(memberId: number): Promise<BookingCancelResponse> {
  const who = await phoneOf(memberId);
  if (!who) return { ok: false, reason: "no_booking", live: false };
  const active = await getDataSource().getActiveBooking(who.phone).catch(() => null);
  if (!active) return { ok: false, reason: "no_booking", live: false };
  if (!bookingCancellable(active.status)) return { ok: false, reason: "too_late", live: env.bookingLive };
  if (!env.bookingLive) {
    await bumpCancelCount(memberId).catch(() => undefined);
    return { ok: true, live: false };
  }
  const res = await getDataSource().cancelBooking(active.id).catch(() => ({ ok: false }));
  if (res.ok) await bumpCancelCount(memberId).catch(() => undefined);
  return { ok: res.ok, reason: res.ok ? undefined : "failed", live: true };
}

export async function getActiveBookingFor(memberId: number): Promise<ActiveBookingView | null> {
  const who = await phoneOf(memberId);
  if (!who) return null;
  const view = await toView(await getDataSource().getActiveBooking(who.phone).catch(() => null));
  // T5-E6: once the ride has started, expose rideStartedAt (set by the sweep) so the
  // Mini App can show a live garage counter. Display-only — grants stay in the bot sweep.
  if (view && view.status === "started") {
    const m = await prisma.member.findUnique({ where: { id: memberId }, select: { rideStartedAt: true } }).catch(() => null);
    view.rideStartedAt = m?.rideStartedAt ? m.rideStartedAt.toISOString() : null;
  }
  return view;
}

// ── 1-tap "1067 Now" ──────────────────────────────────────────────────────────

const ONE_TAP_GPS_LAST_KM = 0.12; // GPS within 120m of last pickup → same spot
const ONE_TAP_GPS_SAVED_KM = 0.25; // GPS within 250m of a saved address → snap
const ONE_TAP_THROTTLE_MS = 30_000; // min gap between dispatches (double-tap guard; 60s felt too long — a real re-book after a quick cancel was blocked for a full minute)
// A member whose LAST claim never became a tracked ride (lastBookingId still null) had their order
// die with no driver / lost mid-flight. The active-booking guard above already dedups any LIVE order,
// so keeping them under the full 30s throttle only traps them on a "Hozirgina buyurtma yuborilgan"
// they can't escape. Let them re-book after a short anti-double-tap gap instead. (Concurrency safety
// is the atomic claimDispatchSlot CAS, NOT this window — see that function.)
const DEAD_REBOOK_MS = 8_000;

/** Atomically claim the dispatch slot (CAS on lastBookingAt) RIGHT BEFORE a real kas
 *  dispatch — the early throttle check is read-then-act (TOCTOU), so two concurrent
 *  taps / a reload / a second tab can both pass it and dispatch two taxis (wasted
 *  driver — the supply moat). This updateMany only succeeds for ONE caller; the loser
 *  is throttled. Returns the prior value so a FAILED dispatch can release it (below). */
export async function claimDispatchSlot(memberId: number, windowMs: number = ONE_TAP_THROTTLE_MS): Promise<{ ok: boolean; prev: Date | null }> {
  const before = await prisma.member.findUnique({ where: { id: memberId }, select: { lastBookingAt: true } });
  const cutoff = new Date(Date.now() - windowMs);
  const claim = await prisma.member.updateMany({
    where: { id: memberId, OR: [{ lastBookingAt: null }, { lastBookingAt: { lt: cutoff } }] },
    data: { lastBookingAt: new Date() },
  });
  return { ok: claim.count > 0, prev: before?.lastBookingAt ?? null };
}
/** Release the slot after a FAILED dispatch so the user can retry immediately.
 *  Exported: the classic bot confirm (bk:confirm) uses the same claim/release pair. */
export async function releaseDispatchSlot(memberId: number, prev: Date | null): Promise<void> {
  await prisma.member.updateMany({ where: { id: memberId }, data: { lastBookingAt: prev } }).catch(() => undefined);
}
const CANCEL_FARM_LIMIT = 4; // self-cancels per day before 1-tap demands the full confirm flow

function tashkentDay(d = new Date()): string {
  return new Date(d.getTime() + 5 * 3600 * 1000).toISOString().slice(0, 10);
}

/** Count a self-cancel (phantom dispatches waste real drivers — our moat). */
async function bumpCancelCount(memberId: number): Promise<void> {
  const key = `cancels:${memberId}:${tashkentDay()}`;
  await prisma.$executeRaw`
    INSERT INTO "AppState" ("key","value","updatedAt") VALUES (${key}, '1', NOW())
    ON CONFLICT ("key") DO UPDATE
      SET "value" = CAST((CAST("AppState"."value" AS INTEGER) + 1) AS TEXT), "updatedAt" = NOW()`;
}

async function cancelsToday(memberId: number): Promise<number> {
  const row = await prisma.appState.findUnique({ where: { key: `cancels:${memberId}:${tashkentDay()}` } });
  return row ? Number(row.value) || 0 : 0;
}

/** Remember where this member booked from — the 1-tap memory (survives deploys). */
const MAX_RECENT_PICKUPS = 3;

/** "Yana shu yo'l" chip list: prepend, dedup (by id when non-zero, else by trimmed
 *  lower-cased name for raw map pins), cap at 3. Best-effort — never blocks dispatch. */
async function pushRecentPickup(memberId: number, a: SavedAddressView): Promise<void> {
  const row = await prisma.member.findUnique({ where: { id: memberId }, select: { recentPickupsJson: true } }).catch(() => null);
  let list: SavedAddressView[] = [];
  try {
    list = row?.recentPickupsJson ? (JSON.parse(row.recentPickupsJson) as SavedAddressView[]) : [];
  } catch {
    list = [];
  }
  const sameKey = (b: SavedAddressView) => (a.id ? b.id === a.id : b.name.trim().toLowerCase() === a.name.trim().toLowerCase());
  list = [{ id: a.id, name: a.name, lat: a.lat, lng: a.lng }, ...list.filter((b) => !sameKey(b))].slice(0, MAX_RECENT_PICKUPS);
  await prisma.member.update({ where: { id: memberId }, data: { recentPickupsJson: JSON.stringify(list) } }).catch(() => undefined);
}

/** Home-screen 1-tap "Yana shu yo'l" chips — up to 3 most recently dispatched DISTINCT pickups. */
export async function getRecentPickups(memberId: number): Promise<SavedAddressView[]> {
  const row = await prisma.member.findUnique({ where: { id: memberId }, select: { recentPickupsJson: true } }).catch(() => null);
  if (!row?.recentPickupsJson) return [];
  try {
    return JSON.parse(row.recentPickupsJson) as SavedAddressView[];
  } catch {
    return [];
  }
}

// stampDispatch=false: remember the pickup WITHOUT touching lastBookingAt/lastBookingSource — for
// callers that still need to claimDispatchSlot() themselves AFTER this call (the bot's manzil-wizard
// confirm). Stamping lastBookingAt here used to make that immediately-following claimDispatchSlot()
// see a "just claimed" slot and refuse it every time — a real dispatch never left this function
// (bug found 2026-07-29, ~25 days live: the wizard's ✅ Chaqirish button silently no-opped after
// showing "✅ Buyurtma qabul qilindi"). Default stays true for every OTHER caller (createBookingFor /
// callOneTapFor), which already call claimDispatchSlot BEFORE rememberPickup.
export async function rememberPickup(
  memberId: number,
  a: { id: number; name: string; lat?: number | null; lng?: number | null },
  source = "bot",
  stampDispatch = true,
): Promise<void> {
  await prisma.member
    .update({
      where: { id: memberId },
      data: {
        lastPickupId: a.id,
        lastPickupName: a.name,
        lastPickupLat: a.lat ?? null,
        lastPickupLng: a.lng ?? null,
        ...(stampDispatch ? { lastBookingAt: new Date(), lastBookingSource: source } : {}),
      },
    })
    .catch(() => undefined);
  // first remembered pickup becomes the sticky default (kept until user changes it)
  await prisma.member.updateMany({
    where: { id: memberId, defaultPickupId: null },
    data: { defaultPickupId: a.id, defaultPickupName: a.name },
  });
  await pushRecentPickup(memberId, { id: a.id, name: a.name, lat: a.lat ?? undefined, lng: a.lng ?? undefined });
}

/** The pickup "call now" would use, without dispatching (for button labels). */
export async function getQuickPickup(memberId: number): Promise<SavedAddressView | null> {
  const m = await prisma.member.findUnique({
    where: { id: memberId },
    select: { lastPickupId: true, lastPickupName: true, lastPickupLat: true, lastPickupLng: true, defaultPickupId: true, defaultPickupName: true },
  });
  if (!m) return null;
  if (m.lastPickupId && m.lastPickupName) return { id: m.lastPickupId, name: m.lastPickupName, lat: m.lastPickupLat ?? undefined, lng: m.lastPickupLng ?? undefined };
  if (m.defaultPickupId && m.defaultPickupName) return { id: m.defaultPickupId, name: m.defaultPickupName };
  return null;
}

/**
 * The 1-tap dispatch: resolve the pickup BEHIND the button (active-booking
 * guard → explicit override → GPS near last pickup → GPS-nearest saved →
 * default → last), throttle double-taps, dispatch via the existing
 * createBooking path (additionalPayment 0 — booking never mints coins).
 */
export async function callOneTapFor(memberId: number, body: BookingNowBody, source = "bot"): Promise<BookingNowResponse> {
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: {
      phone: true,
      fullName: true,
      lastPickupId: true,
      lastPickupName: true,
      lastPickupLat: true,
      lastPickupLng: true,
      defaultPickupId: true,
      defaultPickupName: true,
      lastBookingAt: true,
      lastBookingId: true,
    },
  });
  if (!member?.phone) return { state: "failed", message: "Telefon raqami ulanmagan" };

  // never double-book: an active ride wins
  const active = await getActiveBookingFor(memberId);
  if (active) return { state: "active", booking: active };

  // double-tap / accidental-repeat guard (real taxis get dispatched here). Window shrinks when the
  // last claim never became a tracked ride (lastBookingId null → it died) so a stuck user can re-book.
  const throttleMs = member.lastBookingId == null ? DEAD_REBOOK_MS : ONE_TAP_THROTTLE_MS;
  if (member.lastBookingAt && Date.now() - member.lastBookingAt.getTime() < throttleMs) {
    console.log(`[dispatch] m${memberId} src=${source} blocked=throttle-1tap (dead=${member.lastBookingId == null})`);
    return { state: "throttled", message: "Hozirgina buyurtma yuborilgan — biroz kuting" };
  }

  // cancel-farm: too many self-cancels today → no more instant dispatch,
  // the full confirm flow protects driver liquidity from phantom orders
  if ((await cancelsToday(memberId).catch(() => 0)) >= CANCEL_FARM_LIMIT) {
    return { state: "confirm_required", message: "Bugun ko'p bekor qilindi — manzilni tasdiqlab chaqiring" };
  }

  const ds = getDataSource();
  const saved = await ds.checkClient(member.phone).then((c) => c?.addresses ?? []).catch(() => [] as { id: number; name: string; lat?: number; lng?: number }[]);

  // resolve the pickup down the tier cascade
  let pickup: { id: number; name: string; lat?: number | null; lng?: number | null } | null = null;
  if (body.addressId) {
    pickup = saved.find((a) => a.id === body.addressId) ?? null;
    if (!pickup && member.lastPickupId === body.addressId && member.lastPickupName) {
      pickup = { id: member.lastPickupId, name: member.lastPickupName, lat: member.lastPickupLat, lng: member.lastPickupLng };
    }
  }
  if (!pickup && body.lat != null && body.lng != null) {
    const here = { lat: body.lat, lng: body.lng };
    // T1: standing where you last booked from
    if (member.lastPickupLat != null && member.lastPickupLng != null && member.lastPickupId && member.lastPickupName) {
      if (haversineKm(here, { lat: member.lastPickupLat, lng: member.lastPickupLng }) <= ONE_TAP_GPS_LAST_KM) {
        pickup = { id: member.lastPickupId, name: member.lastPickupName, lat: member.lastPickupLat, lng: member.lastPickupLng };
      }
    }
    // T2: snap to the nearest saved address
    if (!pickup) {
      let bestKm = ONE_TAP_GPS_SAVED_KM;
      for (const a of saved) {
        if (a.lat == null || a.lng == null) continue;
        const km = haversineKm(here, { lat: a.lat, lng: a.lng });
        if (km <= bestKm) {
          bestKm = km;
          pickup = a;
        }
      }
    }
  }
  // T3: last pickup ("repeat my last order" — must match getQuickPickup's label)
  // → T4: sticky default
  if (!pickup && member.lastPickupId && member.lastPickupName) {
    pickup = { id: member.lastPickupId, name: member.lastPickupName, lat: member.lastPickupLat, lng: member.lastPickupLng };
  }
  if (!pickup && member.defaultPickupId && member.defaultPickupName) {
    pickup = { id: member.defaultPickupId, name: member.defaultPickupName };
  }
  if (!pickup) {
    return {
      state: "need_pickup",
      suggestions: saved.slice(0, 6).map((a) => ({ id: a.id, name: a.name, lat: a.lat, lng: a.lng })),
    };
  }

  if (!env.bookingLive) {
    await rememberPickup(memberId, pickup, source);
    return { state: "test", pickupName: pickup.name, message: "TEST rejimi — haqiqiy taxi chaqirilmadi" };
  }

  // atomic anti-double-dispatch claim (the early throttle check above is only a fast UX reject)
  const slot = await claimDispatchSlot(memberId, throttleMs);
  if (!slot.ok) return { state: "throttled", message: "Hozirgina buyurtma yuborilgan — biroz kuting" };
  const res = await ds
    .createBooking({ clientName: member.fullName, addressName: pickup.name, addressId: pickup.id, phoneNumber: member.phone, additionalPayment: 0 })
    .catch((e) => ({ ok: false as const, message: e instanceof Error ? e.message : String(e) }));
  console.log(`[dispatch] m${memberId} src=${source} 1tap=${pickup.id} → ok=${res.ok}${res.ok ? "" : ` msg="${res.message ?? ""}"`}`);
  if (!res.ok) {
    await releaseDispatchSlot(memberId, slot.prev);
    return { state: "failed", message: res.message };
  }

  await rememberPickup(memberId, pickup, source);
  // ⚡ arm instant-status before the accept (1-tap dispatch path)
  void import("./kasClientSocket").then(({ armInstant }) => armInstant(memberId, member.phone)).catch(() => undefined);
  return { state: "dispatched", pickupName: pickup.name };
}
