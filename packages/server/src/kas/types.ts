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
  /** Booking tracking: the caller's current active booking (status + assigned driver), by phone. */
  getActiveBooking(phone: string): Promise<ActiveBooking | null>;
  /** All active bookings (one call) — for the status-push notifier. */
  listActiveBookings(): Promise<ActiveBookingLite[]>;

  /** Reward: set a client's cashback bonus (writes real money via kas1067, code 1303). */
  setClientBonus(phone: string, newBonus: number): Promise<{ ok: boolean; oldBonus: number; name?: string; status?: number }>;
  /** Reward: add a delta to a client's cashback bonus. */
  addClientBonus(phone: string, delta: number): Promise<{ ok: boolean; oldBonus: number; newBonus: number; status?: number }>;
}
