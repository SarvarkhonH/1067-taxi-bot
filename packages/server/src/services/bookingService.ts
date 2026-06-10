import {
  bookingStatusLabel,
  type ActiveBookingView,
  type BookingCreateResponse,
  type BookingInfoResponse,
  type SavedAddressView,
} from "@t1067/shared";
import { prisma } from "../db";
import { env } from "../env";
import { getDataSource } from "../kas";
import { getFareConfig } from "./clientInfoService";

async function phoneOf(memberId: number): Promise<{ phone: string; name: string } | null> {
  const m = await prisma.member.findUnique({ where: { id: memberId }, select: { phone: true, fullName: true } });
  return m?.phone ? { phone: m.phone, name: m.fullName } : null;
}

function toActiveView(b: Awaited<ReturnType<ReturnType<typeof getDataSource>["getActiveBooking"]>>): ActiveBookingView | null {
  if (!b) return null;
  return {
    id: b.id,
    status: b.status,
    statusLabel: bookingStatusLabel(b.status),
    addressName: b.addressName,
    cashback: b.clientBonus,
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
  const [client, area, company, fare, active] = await Promise.all([
    ds.checkClient(who.phone).catch(() => null),
    ds.getServiceArea().catch(() => []),
    ds.getCompanyInfo().catch(() => ({ companyName: "1067", dispatcherPhones: [], lat: 39.04, lng: 65.57 })),
    getFareConfig().catch(() => null),
    ds.getActiveBooking(who.phone).catch(() => null),
  ]);
  const saved: SavedAddressView[] = (client?.addresses ?? []).map((a) => ({ id: a.id, name: a.name }));
  return {
    clientName: client?.clientName ?? who.name,
    serviceArea: area.map((p) => ({ lat: p.lat, lng: p.lng })),
    center: { lat: company.lat || 39.04, lng: company.lng || 65.57 },
    savedAddresses: saved,
    cars: fare?.cars.map((c) => ({ id: c.id, name: c.name, category: c.category })) ?? [],
    cashbackPerRide: fare?.cashback.perAppRide ?? 0,
    bookingLive: env.bookingLive,
    active: toActiveView(active),
  };
}

export async function searchBookingAddress(q: string): Promise<SavedAddressView[]> {
  const res = await getDataSource().searchAddresses(q).catch(() => []);
  return res.map((a) => ({ id: a.id, name: a.name }));
}

export async function createBookingFor(memberId: number, addressId: number, addressName: string): Promise<BookingCreateResponse> {
  const who = await phoneOf(memberId);
  if (!who) return { ok: false, live: false, message: "Telefon raqami topilmadi" };
  if (!env.bookingLive) {
    // dry-run: safe default until BOOKING_LIVE=true
    return { ok: true, live: false, message: "TEST rejimi — haqiqiy taxi chaqirilmadi" };
  }
  const res = await getDataSource()
    .createBooking({ clientName: who.name, addressName, addressId, phoneNumber: who.phone, additionalPayment: 0 })
    .catch((e) => ({ ok: false, message: e instanceof Error ? e.message : String(e) }));
  return { ok: res.ok, live: true, message: res.message };
}

export async function getActiveBookingFor(memberId: number): Promise<ActiveBookingView | null> {
  const who = await phoneOf(memberId);
  if (!who) return null;
  return toActiveView(await getDataSource().getActiveBooking(who.phone).catch(() => null));
}
