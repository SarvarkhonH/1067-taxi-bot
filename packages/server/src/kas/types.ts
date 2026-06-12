// Normalized member record. Both clients and drivers map into this shape.
import type { MemberType } from "@t1067/shared";

export interface KasMember {
  type: MemberType;
  kasId: string;
  fullName: string;
  phone?: string;
  carNumber?: string; // drivers only
  points: number; // bonus (client) | balance (driver)
  trips: number; // bookingCount (client) | takeBookingCount (driver)
  rating: number; // drivers only
}

// ─── booking ──────────────────────────────────────────────────────────────────
export interface SavedAddress {
  id: number;
  name: string;
  lat?: number; // kas addressDto.latitude
  lng?: number; // kas addressDto.longitude
  surcharge?: number; // per-address additionalPayment (so'm)
}

export interface ClientBookingInfo {
  clientName: string;
  phoneNumber: string;
  addresses: SavedAddress[];
  activeBooking: { addressName: string; createdDate: string } | null;
}

export interface BookingRequest {
  clientName: string;
  addressName: string;
  addressId: number;
  phoneNumber: string;
  additionalPayment: number;
}

export interface BookingResult {
  ok: boolean;
  message?: string;
}

export interface KasAddon {
  id: number;
  name: string;
  price: number;
}

export interface BookingDriver {
  fullName: string;
  phone: string;
  carModel: string;
  carNumber: string;
  rating: number;
  lat: number;
  lng: number;
}

export interface ActiveBooking {
  id: number;
  status: string; // in_place | called | arrived | ...
  addressName: string;
  lat?: number; // pickup addressLatitude
  lng?: number; // pickup addressLongitude
  clientBonus: number; // cashback earned from this ride
  priceTier: string; // bookingPrice (e.g. "standard")
  createdDate: string;
  driver: BookingDriver | null; // assigned once a driver takes it
}

export interface ActiveBookingLite {
  id: number;
  phoneNorm: string; // last 9 digits, for matching members
  status: string;
  carNumber: string;
  addressName: string;
  clientBonus: number;
  lat?: number; // pickup coords (ETA for the live card)
  lng?: number;
}

// One row of a client's ride history (kas bookingReports).
export interface DriverPin {
  lat: number;
  lng: number;
  bearing: number;
  busy: boolean;
}

export interface RideHistoryItem {
  id: number;
  addressName: string;
  status: string;
  carNumber: string;
  carModel: string;
  payment: number;
  cashback: number;
  at: string; // ISO date
}

// ─── client-facing reference data (read-only, cached) ──────────────────────────
export interface ClientTariff {
  minimalDistance: number; // metres included in the minimal payment
  minimalPayment: number; // base fare (so'm)
  firstKilometerPaymentInCity: number;
  secondKilometerPaymentInCity: number;
  distancePaymentInCity: number; // so'm per km after that, in city
  firstKilometerPaymentInRegion: number;
  secondKilometerPaymentInRegion: number;
  distancePaymentInRegion: number;
  timePayment: number; // so'm per minute (waiting/slow)
}

export interface BonusRules {
  enabled: boolean;
  clientBonusCall: number; // cashback per phone-call booking
  clientBonusApp: number; // cashback per app/bot booking
  clientBonusCallFirstTime: number;
  clientBonusAppFirstTime: number;
  clientBonusMinimalDistance: number; // metres a ride must reach to earn bonus
}

export interface CarModel {
  id: number;
  name: string;
  category: string;
  rating: number;
}

export interface KasMainReport {
  completedYesterday: number; // latest full-day completed rides (= bookings − cancellations)
  bookingsYesterday: number;
  onlineDrivers: number;
  activeDrivers: number;
  serviceCost: number; // company revenue figure from kas
}

export interface CompanyInfo {
  companyName: string;
  dispatcherPhones: string[];
  lat: number;
  lng: number;
}

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface KasDataSource {
  readonly name: "mock" | "live";
  /** Full pull (mock seed / optional bulk import). */
  fetchMembers(): Promise<KasMember[]>;
  /** On-demand: fetch the member(s) matching a phone (client and/or driver). Light, no bulk scan. */
  fetchByPhone(phone: string): Promise<KasMember[]>;

  /** Booking: client name + saved addresses + any active booking, by phone. */
  checkClient(phone: string): Promise<ClientBookingInfo | null>;
  /** Booking: address autocomplete. */
  searchAddresses(text: string): Promise<SavedAddress[]>;
  /** Booking: create a real order (POST throughWeb). Only called when BOOKING_LIVE=true. */
  createBooking(req: BookingRequest): Promise<BookingResult>;
  /** Booking: optional paid add-ons (bag, moto…) with prices. */
  getBookingAddons(): Promise<KasAddon[]>;
  /** Booking: cancel an active order by id (DELETE). Only when BOOKING_LIVE=true. */
  cancelBooking(bookingId: number): Promise<BookingResult>;
  /** Booking tracking: the caller's current active booking (status + assigned driver), by phone. */
  getActiveBooking(phone: string): Promise<ActiveBooking | null>;
  /** All active bookings (one call) — for the status-push notifier. */
  listActiveBookings(): Promise<ActiveBookingLite[]>;
  /** Ride history for a phone (bookingReports, newest first). */
  getRideHistory(phone: string, size?: number): Promise<RideHistoryItem[]>;
  /** E1: free/online driver map pins (best-effort — drivers with live coords). */
  getDriverPins(): Promise<DriverPin[]>;
  /** Live driver position/identity by car number (the moving pin). */
  getDriverByCar(carNumber: string): Promise<BookingDriver | null>;
  /** Raw bookingReports page (analytics: per-driver distribution, north-star). */
  getReportsPage(page: number, size: number): Promise<RideHistoryItem[]>;

  /** Reward: set a client's cashback bonus (writes real money via kas1067, code 1303). */
  setClientBonus(phone: string, newBonus: number): Promise<{ ok: boolean; oldBonus: number; name?: string; status?: number }>;
  /** Reward: add a delta to a client's cashback bonus. */
  addClientBonus(phone: string, delta: number): Promise<{ ok: boolean; oldBonus: number; newBonus: number; status?: number }>;

  /** Client info: pricing tariff (for fare estimates). */
  getTariff(): Promise<ClientTariff>;
  /** Client info: cashback rules (how much a ride earns). */
  getBonusRules(): Promise<BonusRules>;
  /** Client info: available car models/categories. */
  getCarModels(): Promise<CarModel[]>;
  /** Client info: company name + dispatcher phones + city centre. */
  getCompanyInfo(): Promise<CompanyInfo>;
  /** Client info: service-area polygon (lat/lng points). */
  getServiceArea(): Promise<GeoPoint[]>;
  /** Revenue/volume signal: latest daily ride counts + revenue (drives the reward budget). */
  getMainReport(): Promise<KasMainReport>;
}
