// Mini App booking DTOs — Uber-style map order + live tracking, backed by
// kas1067. NOTE: kas dispatches a taxi to ONE pickup address (taximeter model,
// no native destination). We add an optional destination purely to ESTIMATE
// the fare; the dispatch itself is pickup-only.

export interface GeoPt {
  lat: number;
  lng: number;
}

export interface SavedAddressView {
  id: number;
  name: string;
  lat?: number;
  lng?: number;
  surcharge?: number; // per-address additionalPayment (so'm)
}

export interface BookingAddon {
  id: number;
  name: string;
  price: number;
}

export interface CarTypeView2 {
  id: number;
  name: string;
  category: number;
  photo?: string | null;
}

export interface BookingDriverView {
  fullName: string;
  phone: string;
  carModel: string;
  carNumber: string;
  rating: number;
  lat: number;
  lng: number;
}

export interface ActiveBookingView {
  id: number;
  status: string;
  statusLabel: string;
  addressName: string;
  pickup: GeoPt | null;
  cashback: number; // so'm this ride earns
  etaMin: number | null; // driver → pickup estimate
  canCancel: boolean; // early status only
  driver: BookingDriverView | null;
}

export interface BookingInfoResponse {
  clientName: string;
  serviceArea: GeoPt[];
  center: GeoPt;
  savedAddresses: SavedAddressView[];
  cars: CarTypeView2[];
  addons: BookingAddon[];
  cashbackPerRide: number;
  bonusBalance: number; // member kas cashback (can pay with it)
  bookingLive: boolean; // false = dry-run (no real dispatch)
  active: ActiveBookingView | null;
  // 1-tap: where "call now" would dispatch to (last/default pickup), if known
  quickPickup: SavedAddressView | null;
  // T4-A: real per-km tariff for the honest rate card (NO fabricated total — kas is taximeter)
  tariff: { minimalPayment: number; minimalDistanceKm: number; perKmCity: number; perMinute: number } | null;
  booking3?: boolean; // T4: feature flag — show the MapLibre flow vs the old Leaflet one
}

// ── 1-tap "1067 Now" ──────────────────────────────────────────────────────────
// One contract for bot + miniapp: the server resolves the pickup behind the
// button (GPS near last pickup → nearest saved → default → last), dispatches,
// and reports which state the client should render.
export interface BookingNowBody {
  lat?: number;
  lng?: number;
  addressId?: number; // explicit override (user picked a suggestion)
}

export interface BookingNowResponse {
  state: "dispatched" | "active" | "need_pickup" | "throttled" | "failed" | "test" | "confirm_required";
  pickupName?: string; // where we dispatched (state=dispatched/test)
  booking?: ActiveBookingView | null; // state=active
  suggestions?: SavedAddressView[]; // state=need_pickup
  message?: string;
}

export interface FareQuote {
  km: number;
  base: number;
  perKm: number;
  surcharge: number; // address + add-ons
  total: number;
  cashback: number;
}

export interface BookingCreateBody {
  pickupId: number;
  pickupName: string;
  addonIds?: number[];
  carCategory?: number;
}

export interface BookingCreateResponse {
  ok: boolean;
  live: boolean; // real dispatch happened (vs dry-run)
  message?: string;
}

export interface BookingCancelResponse {
  ok: boolean;
  reason?: "no_booking" | "too_late" | "failed";
  live: boolean;
}

/** Friendly status label for the order timeline. */
export function bookingStatusLabel(status: string): string {
  const map: Record<string, string> = {
    in_place: "🔍 Haydovchi qidirilyapti",
    searching: "🔍 Haydovchi qidirilyapti",
    new: "🔍 Haydovchi qidirilyapti",
    called: "🚖 Haydovchi yo'lda",
    accepted: "🚖 Haydovchi yo'lda",
    on_the_way: "🚖 Haydovchi yo'lda",
    arrived: "✅ Haydovchi yetib keldi",
    started: "🚗 Safar boshlandi",
    completed: "🏁 Safar yakunlandi",
    finished: "🏁 Safar yakunlandi",
    delivered: "🏁 Safar yakunlandi", // bookingReports terminal status
    take: "🚖 Haydovchi oldi",
    take_back: "↩️ Qaytarildi",
    cancel_by_operator: "✖ Bekor qilindi",
    cancel_by_server: "✖ Bekor qilindi",
  };
  return map[status] ?? `ℹ️ ${status}`;
}

export const BOOKING_STEPS = ["🔍 Qidiruv", "🚖 Yo'lda", "✅ Keldi", "🚗 Safar"] as const;

export function bookingStepIndex(status: string): number {
  if (["arrived"].includes(status)) return 2;
  if (["started"].includes(status)) return 3;
  if (["called", "accepted", "on_the_way"].includes(status)) return 1;
  return 0;
}

/** Cancellable only before the driver has arrived. */
export function bookingCancellable(status: string): boolean {
  return ["in_place", "searching", "new", "called", "accepted", "on_the_way"].includes(status);
}

/** Great-circle distance in km. */
export function haversineKm(a: GeoPt, b: GeoPt): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
