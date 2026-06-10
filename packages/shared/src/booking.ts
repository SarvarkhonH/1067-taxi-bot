// Mini App booking DTOs — Uber-style map order + live tracking, backed by kas1067.

export interface GeoPt {
  lat: number;
  lng: number;
}

export interface SavedAddressView {
  id: number;
  name: string;
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
  status: string; // searching | assigned | arrived | started | …
  statusLabel: string;
  addressName: string;
  cashback: number; // so'm this ride earns
  driver: BookingDriverView | null;
}

export interface BookingInfoResponse {
  clientName: string;
  serviceArea: GeoPt[];
  center: GeoPt;
  savedAddresses: SavedAddressView[];
  cars: { id: number; name: string; category: string }[];
  cashbackPerRide: number;
  bookingLive: boolean; // false = dry-run (no real dispatch)
  active: ActiveBookingView | null;
}

export interface BookingCreateResponse {
  ok: boolean;
  live: boolean; // real dispatch happened (vs dry-run)
  message?: string;
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
  };
  return map[status] ?? `ℹ️ ${status}`;
}

export const BOOKING_STEPS = ["🔍 Qidiruv", "🚖 Yo'lda", "✅ Keldi", "🚗 Safar"] as const;

/** Map a kas status to a 0-based step index for the timeline. */
export function bookingStepIndex(status: string): number {
  if (["arrived"].includes(status)) return 2;
  if (["started"].includes(status)) return 3;
  if (["called", "accepted", "on_the_way"].includes(status)) return 1;
  return 0;
}
