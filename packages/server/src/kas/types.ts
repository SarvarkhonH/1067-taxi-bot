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
  // GPS pickup (Telegram «location» share) — sent to kas throughWeb so the driver gets the exact
  // pin when there is no saved addressId (addressId 0). Omitted for normal saved-address orders.
  addressLatitude?: number;
  addressLongitude?: number;
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
  bearing?: number; // C: heading (deg) for the rotating car marker
  meterPayment?: number; // C: live taximeter running fare (so'm)
  meterDistance?: number; // C: live taximeter distance (m)
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
  notifiedCount?: number; // drivers notified (carNumberList length) — honest "N haydovchiga yuborildi"
  // Surcharge breakdown — kas's three stacked extras on top of the meter base. The driver app's
  // ProvideBooking screen displays addressName + (addr + client + company); the rider's `payment`
  // already includes addr+client (taximeter starts at minimalPayment+addr+client), while company is
  // tracked separately as commission. Surfacing all three lets us show an honest breakdown.
  additionalPaymentAddress?: number;
  additionalPaymentClient?: number;
  additionalPaymentCompany?: number;
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
  additionalPaymentAddress?: number;
  additionalPaymentClient?: number;
  additionalPaymentCompany?: number;
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
  payment: number; // total paid (already includes address + client surcharges)
  cashback: number;
  distance?: number; // km (kas taximeter — set on a completed ride)
  time?: number; // minutes (kas taximeter — set on a completed ride)
  at: string; // ISO date
  // Surcharge breakdown (see ActiveBooking for the math). The company portion is the kas commission
  // recorded against the ride — needed for honest "driver take-home" math in driver-side history.
  additionalPaymentAddress?: number;
  additionalPaymentClient?: number;
  additionalPaymentCompany?: number;
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

// Bosqich 3: a driver's financial snapshot (kas drivers/byCarNumber). debt = what the driver owes
// the company (commission), balance = their kas wallet. Used by /qarz to show the figure and to
// settle it from tanga.
export interface DriverAccount {
  kasId: number;
  carNumber: string;
  balance: number;
  debt: number;
  rating?: number; // bookingRating (fallback companyRating)
  takeCount?: number; // lifetime taken bookings
  cancelCount?: number; // lifetime cancelled bookings
  active?: boolean; // false = blocked/disabled by the company
}

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface KasDataSource {
  readonly name: "mock" | "live";
  /** Full pull (mock seed / optional bulk import). */
  fetchMembers(): Promise<KasMember[]>;
  /**
   * On-demand: fetch the member(s) matching a phone (client and/or driver). Light, no bulk scan.
   * Pass `only` to hit a single kas endpoint (the refresh loop knows each member's type, so it skips
   * the irrelevant lookup — halving kas load and avoiding needless cross-type 429s).
   */
  fetchByPhone(phone: string, only?: MemberType): Promise<KasMember[]>;

  /** Booking: client name + saved addresses + any active booking, by phone. */
  checkClient(phone: string): Promise<ClientBookingInfo | null>;
  /** Booking: address autocomplete. */
  searchAddresses(text: string): Promise<SavedAddress[]>;
  /** Booking: the FULL company address catalog (GET api/addresses/) — the same list the official
   *  rider app uses for getAddressByLocation. Lets a map pin snap to the nearest real place name. */
  getAllAddresses(): Promise<SavedAddress[]>;
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
  /** Rides DRIVEN by a car (bookingReports is client-indexed, so search by plate). */
  getRidesByCar(carNumber: string, size?: number): Promise<RideHistoryItem[]>;
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
  /** Update a CLIENT's name in kas1067 (PUT api/clients with the full record + bonusSecretKey). */
  setClientName(phone: string, fullName: string): Promise<{ ok: boolean; status?: number }>;
  /** Top up a DRIVER's kas balance (drivers/payment, online). Driver write — NOT the client bonus.
   *  `debt=true` flags the payment as a debt settlement (the SPA's debt checkbox) instead of a plain
   *  balance top-up. */
  addDriverPayment(driverId: number, carNumber: string, amount: number, comment?: string, debt?: boolean): Promise<{ ok: boolean; balance: number | null; status: number }>;
  /** Bosqich 3: a driver's financial snapshot (balance + debt + kasId) by car number. */
  getDriverAccount(carNumber: string): Promise<DriverAccount | null>;

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
