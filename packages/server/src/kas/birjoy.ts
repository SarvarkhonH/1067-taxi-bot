import type { MemberType } from "@t1067/shared";
import { toBridgeId, fromBridgeId } from "@t1067/shared";
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

  // Id namespacing lives in @t1067/shared (bridgeIds) so it is covered by the CI
  // shield — packages/server has no test runner, and this is money logic: B's
  // order ids collide with historical kas booking ids inside CoinTxn /
  // RideReward idempotency keys.
  private toOuterId(id: number): number { return toBridgeId(id); }
  /** An id from A → B's real order id (kept for the write paths in 5b/5c). */
  private toInnerId(id: number): number { return fromBridgeId(id); }

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
  /**
   * Who is calling — name, the addresses they use, and whether a car is
   * already on its way.
   *
   * `null` for an unknown number rather than an empty record: the operator has
   * to be able to tell a new caller from a known one with nothing saved, and
   * those are different first sentences.
   */
  async checkClient(phone: string): Promise<ClientBookingInfo | null> {
    const info = await this.request<any>("GET", "/orders/by-phone/booking-info", { query: { phone } });
    if (!info) return null;
    return {
      clientName:  info.clientName ?? "",
      phoneNumber: info.phoneNumber ?? phone,
      addresses:   (info.addresses ?? []).map(BirJoySource.toSavedAddress),
      activeBooking: info.activeBooking
        ? {
            addressName: info.activeBooking.addressName ?? "",
            createdDate: String(info.activeBooking.createdDate ?? ""),
          }
        : null,
    };
  }
  /**
   * The passenger cancelled from the bot.
   *
   * The id arriving here is namespaced (A's ids and kas booking ids share a
   * space), so it is translated back before it reaches B — the same direction
   * `toOuterId` sends them out.
   */
  async cancelBooking(bookingId: number): Promise<BookingResult> {
    try {
      await this.request("PATCH", `/orders/${this.toInnerId(bookingId)}/cancel-service`, {
        body: { reason: "mijoz bekor qildi (bot)" },
      });
      return { ok: true };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) };
    }
  }
  async getActiveBooking(phone: string): Promise<ActiveBooking | null> {
    const order = await this.request<any>("GET", "/orders/by-phone/active", { query: { phone } });
    if (!order) return null;
    return {
      id: this.toOuterId(order.id),
      // B vocab (pending/dispatching/accepted/…). A status-vocab adapter
      // (dispatchToBookingStatus, salvaged per §4) is a follow-up.
      status: String(order.status ?? ""),
      addressName: order.pickupAddress ?? "",
      lat: order.pickupLat != null ? Number(order.pickupLat) : undefined,
      lng: order.pickupLng != null ? Number(order.pickupLng) : undefined,
      clientBonus: 0,          // tanga — filled by A's coin ledger in 5c (§5.5)
      priceTier: "standard",   // B has vehicleClassId; tier-name mapping is a follow-up
      createdDate: String(order.createdAt ?? ""),
      driver: order.driver
        ? {
            fullName: order.driver.fullName ?? "",
            phone: order.driver.phone ?? "",
            carModel: order.driver.carModel ?? "",
            carNumber: order.driver.carNumber ?? "",
            rating: Number(order.driver.avgRating ?? 0),
            lat: 0, lng: 0,    // live position comes from getDriverPins, not this row (§3.3)
          }
        : null,
    };
  }

  /**
   * Every live booking at once — what the status sweep runs on.
   *
   * One call, not one per passenger: the sweep asks what changed about all of
   * them on a timer, and doing that per phone is how a background job becomes
   * the reason the bot is slow.
   *
   * `clientBonus` is 0 here on purpose. In kas it is the passenger's cashback
   * balance, which travels with the booking; ours is tanga and lives in A's own
   * ledger, so the caller reads it from there. Returning a made-up number would
   * put a wrong balance on a live card.
   *
   * The three-way additional payment is one column in B, so it is reported as
   * the address share and the other two are left at 0 rather than split by
   * guesswork (KAS_PARITET §3.1).
   */
  async listActiveBookings(): Promise<ActiveBookingLite[]> {
    const rows = await this.request<any[]>("GET", "/orders/active-lite");
    return (rows ?? []).map((r) => ({
      id:          this.toOuterId(r.id),
      phoneNorm:   String(r.phoneNorm ?? ""),
      status:      String(r.status ?? ""),
      carNumber:   r.carNumber ?? "",
      addressName: r.addressName ?? "",
      clientBonus: 0,
      lat:         r.lat != null ? Number(r.lat) : undefined,
      lng:         r.lng != null ? Number(r.lng) : undefined,
      additionalPaymentAddress: Number(r.additionalPayment ?? 0),
      additionalPaymentClient:  0,
      additionalPaymentCompany: 0,
    }));
  }

  async getRideHistory(phone: string, size?: number, _page?: number): Promise<RideHistoryItem[]> {
    const rows = await this.request<any[]>("GET", "/orders/by-phone/history", { query: { phone, limit: size } });
    return (rows ?? []).map((r) => ({
      id: this.toOuterId(r.id),
      addressName: r.pickupAddress ?? "",
      status: String(r.status ?? ""),
      carNumber: "",   // B history has no driver join yet (gap — follow-up)
      carModel: "",
      payment: Number(r.finalFareUzs ?? 0),
      cashback: 0,     // tanga — A adds the per-ride award in 5c (§5.5)
      distance: r.distanceKm != null ? Number(r.distanceKm) : undefined,
      at: String(r.completedAt ?? r.createdAt ?? ""),
    }));
  }
  getRidesByCar(_carNumber: string, _size?: number): Promise<RideHistoryItem[]> { return this.notImpl("getRidesByCar"); }
  getDriverPins(): Promise<DriverPin[]> { return this.notImpl("getDriverPins"); }
  async getDriverByCar(carNumber: string): Promise<BookingDriver | null> {
    const d = await this.request<any>("GET", `/drivers/by-car/${encodeURIComponent(carNumber)}`);
    if (!d) return null;
    return {
      fullName: d.fullName ?? "",
      phone: d.phone ?? "",
      carModel: d.carModel ?? "",
      carNumber: d.carNumber ?? carNumber,
      rating: Number(d.avgRating ?? 0),
      lat: 0, lng: 0,   // by-car carries no live position; getDriverPins does (§3.3)
    };
  }
  getReportsPage(_page: number, _size: number): Promise<RideHistoryItem[]> { return this.notImpl("getReportsPage"); }
  listDriverRoster(): Promise<DriverRosterRow[]> { return this.notImpl("listDriverRoster"); }
  /**
   * Give a caller the name the operator learned on the phone.
   *
   * Never creates a customer: an unknown number is not one yet, and a row
   * invented here would show up in every count as a passenger who has never
   * ridden.
   */
  async setClientName(phone: string, fullName: string): Promise<{ ok: boolean; status?: number }> {
    try {
      const res = await this.request<{ ok: boolean }>("PATCH", "/orders/by-phone/name", {
        body: { phone, fullName },
      });
      return { ok: res?.ok === true, status: res?.ok ? 200 : 404 };
    } catch {
      return { ok: false, status: 500 };
    }
  }
  addDriverPayment(_driverId: number, _carNumber: string, _amount: number, _comment?: string, _debt?: boolean): Promise<{ ok: boolean; balance: number | null; status: number }> { return this.notImpl("addDriverPayment"); }
  getDriverAccount(_carNumber: string): Promise<DriverAccount | null> { return this.notImpl("getDriverAccount"); }
  getTariff(): Promise<ClientTariff> { return this.notImpl("getTariff"); }
  getCompanyInfo(): Promise<CompanyInfo> { return this.notImpl("getCompanyInfo"); }
  getServiceArea(): Promise<GeoPoint[]> { return this.notImpl("getServiceArea"); }
  getMainReport(): Promise<KasMainReport> { return this.notImpl("getMainReport"); }

  // ── 5c: tanga methods — resolve inside A, not over HTTP ───────────────────
  //
  // These three are the exception to the whole design of this class. Everything
  // else here maps a kas call onto the taxi core (B); the passenger's balance
  // does not live in B and never will. In kas it is cashback in so'm; here it is
  // tanga, in A's own ledger, which the owner settled on 2026-09-12: "BirJoy'da
  // bor-ku, ikkalasi bitta deb bil."
  //
  // So they resolve against coinService, and the ledger rules hold: no raw
  // balance write, ever. Every movement is a CoinTxn with a reason, because a
  // balance that changed with no row behind it is the one thing nobody can
  // audit afterwards (CLAUDE.md).
  //
  // Imported lazily so this file stays inert while KAS_MODE !== "birjoy" — the
  // same reason the class is never constructed.

  /** Phone → member, the way A matches everywhere else: last 9 digits. */
  private async memberByPhone(phone: string) {
    const { prisma } = await import("../db");
    const last9 = String(phone ?? "").replace(/\D/g, "").slice(-9);
    if (last9.length !== 9) return null;
    return prisma.member.findFirst({
      where: { phone: { endsWith: last9 } },
      select: { id: true, fullName: true, coins: true },
    });
  }

  /**
   * Set a passenger's balance to an absolute figure.
   *
   * kas writes the number straight in. We compute the difference and move it
   * through the ledger, which has a property worth having: setting the same
   * figure twice is a no-op, because the second delta is zero. A retry after a
   * timeout cannot double-credit anybody.
   */
  async setClientBonus(phone: string, newBonus: number): Promise<{ ok: boolean; oldBonus: number; name?: string; status?: number }> {
    const m = await this.memberByPhone(phone);
    if (!m) return { ok: false, oldBonus: 0, status: 404 };

    const target = Math.floor(Number(newBonus));
    if (!Number.isFinite(target) || target < 0) return { ok: false, oldBonus: m.coins, name: m.fullName, status: 400 };

    const delta = target - m.coins;
    if (delta === 0) return { ok: true, oldBonus: m.coins, name: m.fullName };

    const { grantCoins, spendCoins } = await import("../services/coinService");
    const res = delta > 0
      ? await grantCoins(m.id, delta, "bridge_set", `kas setClientBonus → ${target}`)
      : await spendCoins(m.id, -delta, "bridge_set", `kas setClientBonus → ${target}`);

    return { ok: res.ok, oldBonus: m.coins, name: m.fullName, status: res.ok ? 200 : 409 };
  }

  /**
   * Move a passenger's balance by a delta.
   *
   * Not idempotent, and kas's is not either: two calls add twice, by design.
   * The caller owns the retry question.
   */
  async addClientBonus(phone: string, delta: number): Promise<{ ok: boolean; oldBonus: number; newBonus: number; status?: number }> {
    const m = await this.memberByPhone(phone);
    if (!m) return { ok: false, oldBonus: 0, newBonus: 0, status: 404 };

    const amount = Math.floor(Number(delta));
    if (!Number.isFinite(amount) || amount === 0) {
      return { ok: false, oldBonus: m.coins, newBonus: m.coins, status: 400 };
    }

    const { grantCoins, spendCoins } = await import("../services/coinService");
    const res = amount > 0
      ? await grantCoins(m.id, amount, "bridge_add", "kas addClientBonus")
      : await spendCoins(m.id, -amount, "bridge_add", "kas addClientBonus");

    return { ok: res.ok, oldBonus: m.coins, newBonus: res.balance, status: res.ok ? 200 : 409 };
  }

  /**
   * The cashback rules, in kas's shape, from A's own economy knobs.
   *
   * Two fields are answered honestly rather than invented:
   *
   *   call vs app — kas pays a different rate for a booking made in the app
   *     than for one made by phone, and that difference is one of its real
   *     levers on the 10.6% app share. We do not have it: one rate, both
   *     channels. Returning two different numbers here would be a number
   *     nothing in our code honours.
   *   minimalDistance — kas refuses cashback below a distance. We have no such
   *     rule, so this is 0, which is what our engine actually does.
   */
  async getBonusRules(): Promise<BonusRules> {
    const { getBonusEcon } = await import("../services/bonusConfig");
    const econ = await getBonusEcon();
    const perRide = Number(econ.rideBase ?? 0);
    return {
      enabled: perRide > 0,
      clientBonusCall: perRide,
      clientBonusApp: perRide,          // no channel split exists yet — see above
      clientBonusCallFirstTime: Number(econ.firstRide ?? 0),
      clientBonusAppFirstTime: Number(econ.firstRide ?? 0),
      clientBonusMinimalDistance: 0,    // no minimum distance rule in our engine
    };
  }
}
