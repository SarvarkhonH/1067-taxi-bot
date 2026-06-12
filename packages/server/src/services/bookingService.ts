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
import { getDataSource } from "../kas";
import { getFareConfig } from "./clientInfoService";

const CITY_KMH = 24; // assumed city speed for ETA

async function phoneOf(memberId: number): Promise<{ phone: string; name: string; bonus: number } | null> {
  const m = await prisma.member.findUnique({ where: { id: memberId }, select: { phone: true, fullName: true, points: true } });
  return m?.phone ? { phone: m.phone, name: m.fullName, bonus: m.points } : null;
}

function toView(
  b: Awaited<ReturnType<ReturnType<typeof getDataSource>["getActiveBooking"]>>,
): ActiveBookingView | null {
  if (!b) return null;
  let etaMin: number | null = null;
  if (b.driver?.lat && b.driver?.lng && b.lat && b.lng) {
    etaMin = Math.max(1, Math.ceil((haversineKm({ lat: b.driver.lat, lng: b.driver.lng }, { lat: b.lat, lng: b.lng }) / CITY_KMH) * 60));
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
    driver: b.driver
      ? {
          fullName: b.driver.fullName,
          phone: b.driver.phone,
          carModel: b.driver.carModel,
          carNumber: b.driver.carNumber,
          rating: b.driver.rating,
          lat: b.driver.lat,
          lng: b.driver.lng,
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
    active: toView(active),
    quickPickup,
  };
}

export async function searchBookingAddress(q: string): Promise<SavedAddressView[]> {
  const res = await getDataSource().searchAddresses(q).catch(() => []);
  return res.map((a) => ({ id: a.id, name: a.name, lat: a.lat, lng: a.lng, surcharge: a.surcharge }));
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

  // add-ons + per-address surcharge → additionalPayment
  let additionalPayment = 0;
  if (body.addonIds?.length) {
    const addons = await getDataSource().getBookingAddons().catch(() => []);
    additionalPayment += addons.filter((a) => body.addonIds!.includes(a.id)).reduce((s, a) => s + a.price, 0);
  }

  if (!env.bookingLive) {
    await rememberPickup(memberId, { id: body.pickupId, name: body.pickupName }, source);
    return { ok: true, live: false, message: "TEST rejimi — haqiqiy taxi chaqirilmadi" };
  }
  const res = await getDataSource()
    .createBooking({ clientName: who.name, addressName: body.pickupName, addressId: body.pickupId, phoneNumber: who.phone, additionalPayment })
    .catch((e) => ({ ok: false, message: e instanceof Error ? e.message : String(e) }));
  if (res.ok) await rememberPickup(memberId, { id: body.pickupId, name: body.pickupName }, source);
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
  return toView(await getDataSource().getActiveBooking(who.phone).catch(() => null));
}

// ── 1-tap "1067 Now" ──────────────────────────────────────────────────────────

const ONE_TAP_GPS_LAST_KM = 0.12; // GPS within 120m of last pickup → same spot
const ONE_TAP_GPS_SAVED_KM = 0.25; // GPS within 250m of a saved address → snap
const ONE_TAP_THROTTLE_MS = 60_000; // min gap between dispatches (double-tap guard)
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
export async function rememberPickup(memberId: number, a: { id: number; name: string; lat?: number | null; lng?: number | null }, source = "bot"): Promise<void> {
  await prisma.member
    .update({
      where: { id: memberId },
      data: {
        lastPickupId: a.id,
        lastPickupName: a.name,
        lastPickupLat: a.lat ?? null,
        lastPickupLng: a.lng ?? null,
        lastBookingAt: new Date(),
        lastBookingSource: source,
      },
    })
    .catch(() => undefined);
  // first remembered pickup becomes the sticky default (kept until user changes it)
  await prisma.member.updateMany({
    where: { id: memberId, defaultPickupId: null },
    data: { defaultPickupId: a.id, defaultPickupName: a.name },
  });
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
    },
  });
  if (!member?.phone) return { state: "failed", message: "Telefon raqami ulanmagan" };

  // never double-book: an active ride wins
  const active = await getActiveBookingFor(memberId);
  if (active) return { state: "active", booking: active };

  // double-tap / accidental-repeat guard (real taxis get dispatched here)
  if (member.lastBookingAt && Date.now() - member.lastBookingAt.getTime() < ONE_TAP_THROTTLE_MS) {
    return { state: "throttled", message: "Hozirgina buyurtma yuborilgan — bir daqiqa kuting" };
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

  const res = await ds
    .createBooking({ clientName: member.fullName, addressName: pickup.name, addressId: pickup.id, phoneNumber: member.phone, additionalPayment: 0 })
    .catch((e) => ({ ok: false as const, message: e instanceof Error ? e.message : String(e) }));
  if (!res.ok) return { state: "failed", message: res.message };

  await rememberPickup(memberId, pickup, source);
  return { state: "dispatched", pickupName: pickup.name };
}
