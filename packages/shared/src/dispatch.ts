// 🚕 O'Z DISPETCHER (feature "owndispatch", DISPATCH_PLAN.md) — sof yordamchilar.
// DB / tarmoq / Telegram YO'Q: holat-mashina, haydovchi saralash, id-fazo, narx variantlari va
// server↔mijoz DTO'lari. Server (`dispatchService.ts`), bot (`bot/dispatch.ts`), miniapp va admin
// AYNAN shu funksiyalarni import qiladi — nusxa yo'q (simGuards saboqi: nusxa jimgina eskiradi).
import { haversineKm, type GeoPt } from "./booking";

export const DISPATCH_STATUSES = ["searching", "accepted", "arrived", "started", "finished", "cancelled", "expired"] as const;
export type DispatchStatus = (typeof DISPATCH_STATUSES)[number];

/** Safar hali "jonli" — mijozda faol buyurtma bor, haydovchi band. */
export const DISPATCH_ACTIVE: readonly DispatchStatus[] = ["searching", "accepted", "arrived", "started"];
export function isDispatchActive(s: string): s is DispatchStatus {
  return (DISPATCH_ACTIVE as readonly string[]).includes(s);
}

// ── id-fazo ──────────────────────────────────────────────────────────────────────────────────
// Tanga/RideReward/RideRating kalitlari `bookingId` (Int) bilan yuradi. kas id'lari ~10⁵
// diapazonda; o'z safarlar 900 000 000 + ride.id — hech qachon to'qnashmaydi, Int (2^31) ichida.
export const DISPATCH_BOOKING_ID_BASE = 900_000_000;
export function dispatchBookingId(rideId: number): number {
  return DISPATCH_BOOKING_ID_BASE + rideId;
}
export function isDispatchBookingId(bookingId: number): boolean {
  return Number.isInteger(bookingId) && bookingId > DISPATCH_BOOKING_ID_BASE && bookingId < DISPATCH_BOOKING_ID_BASE * 2;
}
export function dispatchRideIdOf(bookingId: number): number | null {
  return isDispatchBookingId(bookingId) ? bookingId - DISPATCH_BOOKING_ID_BASE : null;
}

// ── mijoz ko'rinishi uchun kas-uslub holat ─────────────────────────────────────────────────
// `ActiveBookingView.status` ni booking3.tsx / bookingStatusLabel / bookingCancellable kas
// so'zlari bilan o'qiydi — o'z safar o'sha lug'atga tarjima qilinadi, UI o'zgarmaydi.
export function dispatchToBookingStatus(s: DispatchStatus): string {
  switch (s) {
    case "searching": return "new";
    case "accepted": return "accepted";
    case "arrived": return "arrived";
    case "started": return "started";
    case "finished": return "finished";
    case "cancelled": return "cancel_by_client";
    case "expired": return "cancel_by_server";
  }
}

// ── holat-mashina ───────────────────────────────────────────────────────────────────────────
export type DispatchActor = "driver" | "rider" | "system" | "admin";
const TRANSITIONS: Record<DispatchActor, Partial<Record<DispatchStatus, readonly DispatchStatus[]>>> = {
  driver: {
    searching: ["accepted"], // birinchi qabul qilgan oladi (atomik updateMany server tomonida)
    accepted: ["arrived", "searching"], // "searching" = haydovchi bekor qildi → mijozga QAYTA qidiruv
    arrived: ["started", "cancelled"], // "cancelled" = mijoz chiqmadi (no-show) — safar yopiladi
    started: ["finished"],
  },
  rider: {
    // kas-qoidasi bilan bir xil (bookingCancellable): haydovchi YETIB KELGACH mijoz bekor qila olmaydi
    searching: ["cancelled"],
    accepted: ["cancelled"],
  },
  system: {
    searching: ["expired", "cancelled"],
    accepted: ["cancelled"],
    arrived: ["cancelled"],
    started: ["cancelled"],
  },
  admin: {
    searching: ["cancelled"],
    accepted: ["cancelled"],
    arrived: ["cancelled"],
    started: ["cancelled"],
  },
};
export function canTransition(from: DispatchStatus, to: DispatchStatus, actor: DispatchActor): boolean {
  return (TRANSITIONS[actor][from] ?? []).includes(to);
}
/** Mijoz bekor qila oladimi — faqat haydovchi yetib kelguncha (kas `bookingCancellable` bilan bir xil). */
export function dispatchRiderCancellable(s: DispatchStatus): boolean {
  return canTransition(s, "cancelled", "rider");
}

// ── haydovchi saralash ──────────────────────────────────────────────────────────────────────
export interface DriverCandidate {
  driverId: number;
  lat: number | null;
  lng: number | null;
  locAt: number | null; // ms epoch of the last location fix
}
export interface RankOpts {
  nowMs: number;
  freshMs: number; // joylashuv shu muddatdan eski bo'lsa "joylashuvsiz" deb qaraladi
  radiusKm: number; // joylashuvli haydovchi faqat shu radius ichida taklif oladi
}
export interface RankedCandidate {
  driverId: number;
  distanceKm: number | null; // null = joylashuvi yo'q/eskirgan
}
/** Yaqin (yangi joylashuvli, radius ichida) → masofa bo'yicha; keyin joylashuvsiz/eskirganlar
 *  berilgan tartibda (barqaror). Radiusdan TASHQARIDAGI joylashuvli haydovchi CHIQARILADI —
 *  u aniq uzoqda, «yaqinmi-yo'qmi noma'lum» emas. Pickup koordinatasi yo'q bo'lsa masofa
 *  hisoblanmaydi: hamma joylashuvli haydovchi teng (berilgan tartib), keyin qolganlar. */
export function rankDriverCandidates(cands: readonly DriverCandidate[], pickup: GeoPt | null, opts: RankOpts): RankedCandidate[] {
  const near: { driverId: number; distanceKm: number }[] = [];
  const blind: RankedCandidate[] = [];
  const located: RankedCandidate[] = [];
  for (const c of cands) {
    const fresh = c.lat != null && c.lng != null && c.locAt != null && opts.nowMs - c.locAt <= opts.freshMs;
    if (!fresh) {
      blind.push({ driverId: c.driverId, distanceKm: null });
      continue;
    }
    if (!pickup) {
      located.push({ driverId: c.driverId, distanceKm: null });
      continue;
    }
    const km = haversineKm(pickup, { lat: c.lat!, lng: c.lng! });
    if (km > opts.radiusKm) continue; // aniq uzoqda
    near.push({ driverId: c.driverId, distanceKm: +km.toFixed(2) });
  }
  near.sort((a, b) => a.distanceKm - b.distanceKm || a.driverId - b.driverId);
  return [...near, ...located, ...blind];
}

// ── narx variantlari (taksometr yo'q — haydovchi yakunda tasdiqlaydi) ───────────────────────
/** Yakun kartasidagi narx tugmalari: taxminiy narx (yoki minimal) va undan yuqori yaxlit
 *  variantlar. Har doim ≥ minFare, 1000 ga yaxlit, takrorsiz, o'sish tartibida, 4 tagacha. */
export function dispatchFarePresets(estimate: number | null, minFare: number): number[] {
  const base = Math.max(minFare, estimate && Number.isFinite(estimate) ? estimate : minFare);
  const r = (n: number) => Math.max(minFare, Math.round(n / 1000) * 1000);
  const out: number[] = [];
  for (const v of [r(base), r(base * 1.25), r(base * 1.5), r(base * 2)]) {
    if (!out.includes(v)) out.push(v);
  }
  return out.sort((a, b) => a - b).slice(0, 4);
}

/** Haydovchi yozgan narx (matn) → so'm; noto'g'ri bo'lsa null. Chegaralar: ≥1000, ≤2 000 000. */
export function parseFareInput(text: string): number | null {
  const digits = text.replace(/[^\d]/g, "");
  if (!digits) return null;
  let n = Number(digits);
  if (!Number.isFinite(n)) return null;
  if (n < 1000 && /\b(ming|k)\b/i.test(text)) n *= 1000; // "12 ming" / "12k"
  if (n < 1000 || n > 2_000_000) return null;
  return Math.round(n);
}

/** ETA (daq) — shahar tezligi 24 km/soat (bookingService bilan bir xil taxmin), kamida 1. */
export const DISPATCH_CITY_KMH = 24;
export function dispatchEtaMin(km: number | null): number | null {
  if (km == null || !Number.isFinite(km)) return null;
  return Math.max(1, Math.ceil((km / DISPATCH_CITY_KMH) * 60));
}

// ── DTO'lar ─────────────────────────────────────────────────────────────────────────────────
export interface DispatchRideView {
  id: number;
  status: DispatchStatus;
  source: string;
  pickupName: string;
  pickup: GeoPt | null;
  destName: string | null;
  fareEstimate: number | null;
  fareFinal: number | null;
  offeredCount: number;
  wave: number;
  rider: { id: number; name: string; phone: string | null } | null;
  driver: { id: number; name: string; phone: string | null; carNumber: string | null; carModel: string | null; lat: number | null; lng: number | null; locAt: string | null } | null;
  distanceKm: number | null; // haydovchi → olib ketish (ma'lum bo'lsa)
  etaMin: number | null;
  createdAt: string;
  acceptedAt: string | null;
  arrivedAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  kasFallbackAt: string | null;
}

/** Haydovchi paneli/kartasi uchun jonli holat (bot + miniapp bir xil manba). */
export interface DispatchDriverState {
  on: boolean; // owndispatch bayrog'i
  isDriver: boolean;
  online: boolean;
  onlineSince: string | null;
  locAgeSec: number | null; // oxirgi joylashuvdan beri (s); null = joylashuv yo'q
  ride: DispatchRideView | null; // joriy safar (accepted|arrived|started)
  pendingOffers: { rideId: number; pickupName: string; distanceKm: number | null; fareEstimate: number | null; sentAt: string }[];
  todayRides: number;
  todayFare: number;
  onlineDrivers: number; // liniyadagi jami (ijtimoiy isbot: «siz + 3 haydovchi»)
}

export interface DispatchActionResult {
  ok: boolean;
  reason?: "feature_off" | "not_driver" | "not_found" | "taken" | "bad_state" | "busy" | "offline" | "on_ride" | "bad_fare" | "no_location" | "active";
  message?: string;
  ride?: DispatchRideView | null;
  state?: DispatchDriverState;
}

export interface AdminDispatchDriverRow {
  driverId: number;
  name: string;
  phone: string | null;
  carNumber: string | null;
  online: boolean;
  onlineSince: string | null;
  locAgeSec: number | null;
  lat: number | null;
  lng: number | null;
  currentRideId: number | null;
  todayRides: number;
  todayFare: number;
}
