import {
  bookingCancellable,
  bookingStatusLabel,
  haversineKm,
  type ActiveBookingView,
  type BookingCancelResponse,
  type BookingCreateBody,
  type BookingCreateResponse,
  type BookingInfoResponse,
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
  const [client, area, company, fare, addons, active] = await Promise.all([
    ds.checkClient(who.phone).catch(() => null),
    ds.getServiceArea().catch(() => []),
    ds.getCompanyInfo().catch(() => ({ companyName: "1067", dispatcherPhones: [], lat: 39.04, lng: 65.57 })),
    getFareConfig().catch(() => null),
    ds.getBookingAddons().catch(() => []),
    ds.getActiveBooking(who.phone).catch(() => null),
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

export async function createBookingFor(memberId: number, body: BookingCreateBody): Promise<BookingCreateResponse> {
  const who = await phoneOf(memberId);
  if (!who) return { ok: false, live: false, message: "Telefon raqami topilmadi" };

  // add-ons + per-address surcharge → additionalPayment
  let additionalPayment = 0;
  if (body.addonIds?.length) {
    const addons = await getDataSource().getBookingAddons().catch(() => []);
    additionalPayment += addons.filter((a) => body.addonIds!.includes(a.id)).reduce((s, a) => s + a.price, 0);
  }

  if (!env.bookingLive) {
    return { ok: true, live: false, message: "TEST rejimi — haqiqiy taxi chaqirilmadi" };
  }
  const res = await getDataSource()
    .createBooking({ clientName: who.name, addressName: body.pickupName, addressId: body.pickupId, phoneNumber: who.phone, additionalPayment })
    .catch((e) => ({ ok: false, message: e instanceof Error ? e.message : String(e) }));
  return { ok: res.ok, live: true, message: res.message };
}

export async function cancelBookingFor(memberId: number): Promise<BookingCancelResponse> {
  const who = await phoneOf(memberId);
  if (!who) return { ok: false, reason: "no_booking", live: false };
  const active = await getDataSource().getActiveBooking(who.phone).catch(() => null);
  if (!active) return { ok: false, reason: "no_booking", live: false };
  if (!bookingCancellable(active.status)) return { ok: false, reason: "too_late", live: env.bookingLive };
  if (!env.bookingLive) return { ok: true, live: false };
  const res = await getDataSource().cancelBooking(active.id).catch(() => ({ ok: false }));
  return { ok: res.ok, reason: res.ok ? undefined : "failed", live: true };
}

export async function getActiveBookingFor(memberId: number): Promise<ActiveBookingView | null> {
  const who = await phoneOf(memberId);
  if (!who) return null;
  return toView(await getDataSource().getActiveBooking(who.phone).catch(() => null));
}
