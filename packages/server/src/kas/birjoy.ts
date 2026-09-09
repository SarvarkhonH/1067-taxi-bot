import type { MemberType } from "@t1067/shared";
import type {
  ActiveBooking,
  ActiveBookingLite,
  BonusRules,
  BookingDriver,
  BookingRequest,
  BookingResult,
  CarModel,
  ClientBookingInfo,
  ClientTariff,
  CompanyInfo,
  DriverAccount,
  DriverPin,
  DriverRosterRow,
  GeoPoint,
  KasAddon,
  KasDataSource,
  KasMainReport,
  KasMember,
  RideHistoryItem,
  SavedAddress,
} from "./types";

export interface BirJoyConfig {
  /** Base URL of the 1067-taxi (B) API, e.g. http://localhost:4000/api/v1 */
  baseUrl: string;
  /** Shared secret sent as x-service-token (B's ServiceTokenGuard). */
  serviceToken: string;
  /** Injectable for tests; defaults to global fetch. */
  fetchFn?: typeof fetch;
}

/**
 * Third KasDataSource implementation (F1-bridge). Reads/writes the taxi core (B)
 * over HTTP instead of kas1067. Selected by KAS_MODE=birjoy. Rollback = KAS_MODE=live.
 *
 * Slice 5a: the HTTP chokepoint + wiring are live and tested; the 27 methods are
 * filled in 5b (HTTP mappers) and 5c (tanga methods resolve inside A, not B).
 * While KAS_MODE !== "birjoy" this class is never constructed, so the not-yet
 * implemented methods are dormant.
 */
export class BirJoySource implements KasDataSource {
  readonly name = "birjoy" as const;

  constructor(private readonly config: BirJoyConfig) {}

  // ── single HTTP chokepoint ────────────────────────────────────────────────
  private async request<T>(
    method: string,
    path: string,
    opts: { query?: Record<string, string | number | undefined | null>; body?: unknown } = {},
  ): Promise<T> {
    const f = this.config.fetchFn ?? fetch;
    const url = new URL(this.config.baseUrl.replace(/\/+$/, "") + path);
    if (opts.query) {
      for (const [k, v] of Object.entries(opts.query)) {
        if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
      }
    }
    const res = await f(url, {
      method,
      headers: {
        "content-type": "application/json",
        "x-service-token": this.config.serviceToken,
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
    if (!res.ok) {
      throw new Error(`BirJoySource ${method} ${path} → HTTP ${res.status}`);
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  /** Placeholder for methods implemented in Slice 5b/5c. Never reached while
   *  KAS_MODE !== "birjoy". */
  private notImpl(method: string): Promise<never> {
    return Promise.reject(new Error(`BirJoySource.${method} not implemented yet (F1-bridge Slice 5b)`));
  }

  // ── implemented in 5a (proves the chokepoint) ─────────────────────────────
  async getCarModels(): Promise<CarModel[]> {
    const rows = await this.request<Array<{ id: number; name: string; category?: number | string; rating?: number | string }>>(
      "GET",
      "/car-models",
    );
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      category: String(r.category ?? ""),
      rating: Number(r.rating ?? 0),
    }));
  }

  // ── 5b: HTTP mappers ──────────────────────────────────────────────────────

  /** B addresses row → kas SavedAddress. B stores lat/lng as decimal strings and
   *  the per-address surcharge as additional_payment_uzs. */
  private static toSavedAddress(r: {
    id: number; name: string;
    lat?: string | number | null; lng?: string | number | null;
    additionalPayment?: number | null; additionalPaymentUzs?: number | null;
  }): SavedAddress {
    return {
      id: r.id,
      name: r.name,
      lat: r.lat != null ? Number(r.lat) : undefined,
      lng: r.lng != null ? Number(r.lng) : undefined,
      surcharge: r.additionalPayment ?? r.additionalPaymentUzs ?? 0,
    };
  }

  async searchAddresses(text: string): Promise<SavedAddress[]> {
    const rows = await this.request<Parameters<typeof BirJoySource.toSavedAddress>[0][]>(
      "GET", "/addresses/search", { query: { q: text } },
    );
    return rows.map(BirJoySource.toSavedAddress);
  }

  async getAllAddresses(): Promise<SavedAddress[]> {
    const rows = await this.request<Parameters<typeof BirJoySource.toSavedAddress>[0][]>(
      "GET", "/addresses",
    );
    return rows.map(BirJoySource.toSavedAddress);
  }

  async getBookingAddons(): Promise<KasAddon[]> {
    const rows = await this.request<Array<{ id: number; name: string; priceUzs?: number; price?: number }>>(
      "GET", "/order-requirements",
    );
    return rows.map((r) => ({ id: r.id, name: r.name, price: r.priceUzs ?? r.price ?? 0 }));
  }

  async createBooking(req: BookingRequest): Promise<BookingResult> {
    // B (createServiceOrder) resolves the client by phone and pickup coords from
    // addressId (catalog) OR raw lat/lng — mirrors the B5 decision. clientName is
    // unused (B find-or-creates by phone).
    try {
      await this.request("POST", "/orders", {
        body: {
          phone:          req.phoneNumber,
          pickupAddress:  req.addressName,
          addressId:      req.addressId > 0 ? req.addressId : undefined,
          pickupLat:      req.addressLatitude,
          pickupLng:      req.addressLongitude,
        },
      });
      return { ok: true };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) };
    }
  }

  // ── 5b (remaining) / 5c: stubbed ──────────────────────────────────────────
  fetchMembers(): Promise<KasMember[]> { return this.notImpl("fetchMembers"); }
  fetchByPhone(_phone: string, _only?: MemberType): Promise<KasMember[]> { return this.notImpl("fetchByPhone"); }
  checkClient(_phone: string): Promise<ClientBookingInfo | null> { return this.notImpl("checkClient"); }
  cancelBooking(_bookingId: number): Promise<BookingResult> { return this.notImpl("cancelBooking"); }
  getActiveBooking(_phone: string): Promise<ActiveBooking | null> { return this.notImpl("getActiveBooking"); }
  listActiveBookings(): Promise<ActiveBookingLite[]> { return this.notImpl("listActiveBookings"); }
  getRideHistory(_phone: string, _size?: number, _page?: number): Promise<RideHistoryItem[]> { return this.notImpl("getRideHistory"); }
  getRidesByCar(_carNumber: string, _size?: number): Promise<RideHistoryItem[]> { return this.notImpl("getRidesByCar"); }
  getDriverPins(): Promise<DriverPin[]> { return this.notImpl("getDriverPins"); }
  getDriverByCar(_carNumber: string): Promise<BookingDriver | null> { return this.notImpl("getDriverByCar"); }
  getReportsPage(_page: number, _size: number): Promise<RideHistoryItem[]> { return this.notImpl("getReportsPage"); }
  listDriverRoster(): Promise<DriverRosterRow[]> { return this.notImpl("listDriverRoster"); }
  setClientName(_phone: string, _fullName: string): Promise<{ ok: boolean; status?: number }> { return this.notImpl("setClientName"); }
  addDriverPayment(_driverId: number, _carNumber: string, _amount: number, _comment?: string, _debt?: boolean): Promise<{ ok: boolean; balance: number | null; status: number }> { return this.notImpl("addDriverPayment"); }
  getDriverAccount(_carNumber: string): Promise<DriverAccount | null> { return this.notImpl("getDriverAccount"); }
  getTariff(): Promise<ClientTariff> { return this.notImpl("getTariff"); }
  getCompanyInfo(): Promise<CompanyInfo> { return this.notImpl("getCompanyInfo"); }
  getServiceArea(): Promise<GeoPoint[]> { return this.notImpl("getServiceArea"); }
  getMainReport(): Promise<KasMainReport> { return this.notImpl("getMainReport"); }

  // ── 5c: tanga methods — resolve inside A (coinService), not B ──────────────
  setClientBonus(_phone: string, _newBonus: number): Promise<{ ok: boolean; oldBonus: number; name?: string; status?: number }> { return this.notImpl("setClientBonus"); }
  addClientBonus(_phone: string, _delta: number): Promise<{ ok: boolean; oldBonus: number; newBonus: number; status?: number }> { return this.notImpl("addClientBonus"); }
  getBonusRules(): Promise<BonusRules> { return this.notImpl("getBonusRules"); }
}
