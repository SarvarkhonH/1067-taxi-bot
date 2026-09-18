import type { MemberType } from "@t1067/shared";
import {
  toBridgeId,
  fromBridgeId,
  coreStatusToBooking,
  coreUzPhone,
  coreKmToMeters,
  coreCoord,
  CoreHttpError,
  coreOutcomeUnknown,
  coreRiderMessage,
} from "@t1067/shared";
import { recordCore } from "../services/taxiHealth";
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
  NearbyFreeCars,
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
  /** Base URL of the 1067-taxi API, e.g. http://127.0.0.1:4000/api/v1 */
  baseUrl: string;
  /** Shared secret sent as x-service-token (the core's ServiceTokenGuard). */
  serviceToken: string;
  /** Injectable for tests; defaults to global fetch. */
  fetchFn?: typeof fetch;
  /** Per-call ceiling. Default 8 s — below Telegram's 10 s webhook limit. */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 8_000;
const MAIN_REPORT_TTL_MS = 60_000;
// "Does this passenger have a ride?" is asked on almost every screen (/api/me, the booking page,
// every dispatch guard). Three seconds absorbs a burst without letting a real change go unseen for
// long; creating or cancelling an order clears that phone's entry at once.
const ACTIVE_TTL_MS = 3_000;

// A status word the table in @t1067/shared/taxiCore has never seen is the exact shape of the
// failure that would pay nobody for a finished ride. Say it once per word, loudly.
const seenUnknownStatus = new Set<string>();
function bookingStatus(raw: unknown): string {
  const { status, unknown } = coreStatusToBooking(String(raw ?? ""));
  if (unknown && !seenUnknownStatus.has(status) && seenUnknownStatus.size < 50) {
    seenUnknownStatus.add(status);
    console.warn(`[taxi-core] UNKNOWN order status "${status}" — ride rewards for it will not pay`);
    void import("../services/economyService")
      .then(({ alertAdmins }) =>
        alertAdmins(
          `⚠️ <b>taksi tizimi:</b> notanish safar holati «<code>${status}</code>» keldi. ` +
            `Bu holatdagi safarlar uchun tanga to'lanmaydi — <code>packages/shared/src/taxiCore.ts</code> ga qo'shing.`,
        ),
      )
      .catch(() => undefined);
  }
  return status;
}

/**
 * The bot's connection to the taxi dispatch core (1067-taxi) — the only one it has.
 *
 * Everything the bot knows about a ride, a driver or a place comes through here
 * over HTTP on the same machine, authenticated by a shared service token. This
 * class is also where the core's vocabulary is turned into the bot's: order
 * statuses, kilometres into metres, a missing position into `undefined` rather
 * than zero, and every phone into the one format the core stores. Those four
 * translations are each a way the switch from kas1067 would have gone wrong
 * silently, so they live in one place and in `@t1067/shared/taxiCore`, where the
 * CI shield tests them.
 */
export class BirJoySource implements KasDataSource {
  readonly name = "birjoy" as const;

  private mainReport: { at: number; value: KasMainReport } | null = null;
  private activeByPhone = new Map<string, { at: number; value: ActiveBooking | null }>();
  // Bumped whenever an order is created or cancelled: a read that STARTED before the change must not
  // store its (now stale) answer after it — that cached "no ride" right after a booking.
  private activeEpoch = 0;

  constructor(private readonly config: BirJoyConfig) {
    if (!config.serviceToken) {
      // The core fails closed: with no token every call is a 401, and the bot
      // would look up and running while no passenger could order anything.
      throw new Error("BirJoySource: KAS_SERVICE_TOKEN is empty — every call to the taxi core would be refused");
    }
  }

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
    let res: Response;
    try {
      res = await f(url, {
        method,
        headers: {
          "content-type": "application/json",
          "x-service-token": this.config.serviceToken,
        },
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: AbortSignal.timeout(this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      });
    } catch (e) {
      const name = e instanceof Error ? e.name : "";
      recordCore(false, name === "TimeoutError" || name === "AbortError" ? "timeout" : "network");
      throw e;
    }

    let text: string;
    try {
      text = await res.text();
    } catch (e) {
      // Headers arrived, the body did not. Not "an empty answer": for a list that would read as
      // "no active rides" and close every live ride card; for an order it may have been created.
      recordCore(false, "network");
      throw e;
    }
    if (!res.ok) {
      // 4xx is the core refusing on purpose (unknown phone, bad address) — healthy. A refused TOKEN is
      // not: every order would fail while the bot looks fine.
      const kind = res.status === 429 ? "429" : res.status === 401 || res.status === 403 ? "auth" : res.status >= 500 ? "5xx" : undefined;
      recordCore(kind === undefined, kind);
      let detail = "";
      try {
        const j = JSON.parse(text) as { message?: unknown };
        detail = Array.isArray(j?.message) ? j.message.join("; ") : String(j?.message ?? "");
      } catch {
        detail = text.slice(0, 120);
      }
      throw new CoreHttpError(method, path, res.status, detail);
    }
    recordCore(true);
    // Nest sends an empty body for a `null` result ("no active order").
    if (!text) return null as T;
    return JSON.parse(text) as T;
  }

  /** The core's phone format, or null for something that is not a phone. */
  private phone(p: string): string | null {
    return coreUzPhone(p);
  }

  // Id namespacing lives in @t1067/shared (bridgeIds): B's order ids start at 1
  // and would collide with historical kas booking ids inside CoinTxn and
  // RideReward idempotency keys.
  private toOuterId(id: number): number { return toBridgeId(id); }
  private toInnerId(id: number): number { return fromBridgeId(id); }

  // ── places ────────────────────────────────────────────────────────────────

  private static toSavedAddress(r: {
    id: number; name: string;
    lat?: string | number | null; lng?: string | number | null;
    additionalPayment?: number | null; additionalPaymentUzs?: number | null;
  }): SavedAddress {
    return {
      id: r.id,
      name: r.name,
      lat: coreCoord(r.lat),
      lng: coreCoord(r.lng),
      surcharge: r.additionalPayment ?? r.additionalPaymentUzs ?? 0,
    };
  }

  async searchAddresses(text: string): Promise<SavedAddress[]> {
    const rows = await this.request<Parameters<typeof BirJoySource.toSavedAddress>[0][]>(
      "GET", "/addresses/search", { query: { q: text } },
    );
    return (rows ?? []).map(BirJoySource.toSavedAddress);
  }

  async getAllAddresses(): Promise<SavedAddress[]> {
    // The core pages at 500 by default. Koson has ~150 named places; ask for the
    // route's ceiling (1000) so a growing catalogue is never silently cut off.
    const rows = await this.request<Parameters<typeof BirJoySource.toSavedAddress>[0][]>(
      "GET", "/addresses", { query: { limit: 1000 } },
    );
    return (rows ?? []).map(BirJoySource.toSavedAddress);
  }

  async getBookingAddons(): Promise<KasAddon[]> {
    const rows = await this.request<Array<{ id: number; name: string; priceUzs?: number; price?: number }>>(
      "GET", "/order-requirements",
    );
    return (rows ?? []).map((r) => ({ id: r.id, name: r.name, price: r.priceUzs ?? r.price ?? 0 }));
  }

  // ── orders ────────────────────────────────────────────────────────────────

  async createBooking(req: BookingRequest): Promise<BookingResult> {
    const phone = this.phone(req.phoneNumber);
    if (!phone) return { ok: false, message: "Telefon raqami noto'g'ri" };
    // A positive id is a catalogue place; a passenger's own saved place arrives
    // negative (see checkClient) and travels by its coordinates only. For a positive id the core
    // uses its OWN catalogue coordinates, whatever is sent — which is why remembered kas-era ids are
    // rewritten once at cutover (scripts/cutoverPickupIds.ts) and must never be sent before that.
    this.forgetActive(phone);
    try {
      await this.request("POST", "/orders", {
        body: {
          phone,
          pickupAddress: req.addressName,
          addressId: req.addressId > 0 ? req.addressId : undefined,
          pickupLat: req.addressLatitude,
          pickupLng: req.addressLongitude,
          additionalPaymentUzs: req.additionalPayment > 0 ? Math.round(req.additionalPayment) : undefined,
          requirementIds: req.requirementIds?.length ? req.requirementIds : undefined,
          clientName: req.clientName || undefined,
        },
      });
      this.forgetActive(phone); // a read during the POST may have cached "no ride"
      return { ok: true };
    } catch (e) {
      this.forgetActive(phone);
      return {
        ok: false,
        unknown: coreOutcomeUnknown(e),
        // what the passenger reads; the raw reason goes to the log
        message: coreRiderMessage(e),
        detail: e instanceof Error ? e.message : String(e),
      };
    }
  }

  async cancelBooking(bookingId: number): Promise<BookingResult> {
    this.forgetActive(); // the id does not name the phone; a cancel is rare, forget all
    try {
      await this.request("PATCH", `/orders/${this.toInnerId(bookingId)}/cancel-service`, {
        body: { reason: "mijoz bekor qildi (bot)" },
      });
      this.forgetActive();
      return { ok: true };
    } catch (e) {
      this.forgetActive();
      return { ok: false, unknown: coreOutcomeUnknown(e), message: e instanceof Error ? e.message : String(e) };
    }
  }

  async getActiveBooking(phone: string): Promise<ActiveBooking | null> {
    const p = this.phone(phone);
    if (!p) return null;
    const hit = this.activeByPhone.get(p);
    if (hit && Date.now() - hit.at < ACTIVE_TTL_MS) return hit.value;
    const epoch = this.activeEpoch;
    const startedAt = Date.now();
    const value = await this.fetchActiveBooking(p);
    if (epoch === this.activeEpoch) {
      if (this.activeByPhone.size > 5000) this.activeByPhone.clear(); // bound memory
      this.activeByPhone.set(p, { at: startedAt, value }); // aged from when the read began
    }
    return value;
  }

  /** Forget cached "does this phone have a ride" answers — one phone, or all of them. */
  private forgetActive(phone?: string): void {
    this.activeEpoch++;
    if (phone) this.activeByPhone.delete(phone);
    else this.activeByPhone.clear();
  }

  private async fetchActiveBooking(p: string): Promise<ActiveBooking | null> {
    const order = await this.request<any>("GET", "/orders/by-phone/active", { query: { phone: p } });
    return this.toActiveBooking(order);
  }

  /**
   * P0-2: the taxi screen's first paint in ONE core request (`/orders/by-phone/bootstrap`) — what
   * checkClient and getActiveBooking answer, mapped by the very same code. The live-ride answer also
   * warms getActiveBooking's cache, so the screen's next question does not go to the core again.
   * A core without the route answers 404 (CoreHttpError): the caller falls back to the two calls.
   */
  async getBookingBootstrap(phone: string): Promise<{ client: ClientBookingInfo | null; active: ActiveBooking | null }> {
    const p = this.phone(phone);
    if (!p) return { client: null, active: null };
    const epoch = this.activeEpoch;
    const startedAt = Date.now();
    const r = await this.request<any>("GET", "/orders/by-phone/bootstrap", { query: { phone: p } });
    const active = this.toActiveBooking(r?.active);
    if (epoch === this.activeEpoch) {
      if (this.activeByPhone.size > 5000) this.activeByPhone.clear();
      this.activeByPhone.set(p, { at: startedAt, value: active });
    }
    return { client: this.toClientInfo(r?.client, p), active };
  }

  /**
   * P0-8 (typedfast): what the passenger typed, decided by the core the way an order's own label is
   * (`/addresses/resolve`: a curated alias or exactly one strict match). Not confident → the list.
   */
  async resolveAddress(q: string): Promise<{ confident: boolean; address: SavedAddress | null; suggestions: SavedAddress[] }> {
    const r = await this.request<any>("GET", "/addresses/resolve", { query: { q } });
    const address = r?.confident && r?.address ? BirJoySource.toSavedAddress(r.address) : null;
    return {
      confident: !!address,
      address,
      suggestions: Array.isArray(r?.suggestions) ? r.suggestions.map(BirJoySource.toSavedAddress) : [],
    };
  }

  private toActiveBooking(order: any): ActiveBooking | null {
    if (!order) return null;
    return {
      id: this.toOuterId(order.id),
      status: bookingStatus(order.status),
      addressName: order.pickupAddress ?? "",
      lat: coreCoord(order.pickupLat),
      lng: coreCoord(order.pickupLng),
      // Tanga lives in the bot's own ledger, not on a ride row in the core.
      clientBonus: 0,
      priceTier: "standard",
      createdDate: String(order.createdAt ?? ""),
      additionalPaymentAddress: Number(order.additionalPaymentUzs ?? 0),
      additionalPaymentClient: 0,
      additionalPaymentCompany: 0,
      driver: order.driver ? BirJoySource.toDriver(order.driver) : null,
      waitMin: BirJoySource.toWait(order.wait),
    };
  }

  /** P0-6: two whole minutes, lo < hi, both sane — anything else is "no number". */
  private static toWait(w: any): { lo: number; hi: number } | null {
    const lo = Number(w?.lo);
    const hi = Number(w?.hi);
    if (!Number.isInteger(lo) || !Number.isInteger(hi) || lo < 1 || hi <= lo || hi > 120) return null;
    return { lo, hi };
  }

  private static toDriver(d: any, plate?: string): BookingDriver {
    const bearing = Number(d?.bearing);
    return {
      fullName: d?.fullName ?? "",
      phone: d?.phone ?? "",
      carModel: d?.carModel ?? "",
      carNumber: d?.carNumber ?? plate ?? "",
      rating: Number(d?.avgRating ?? d?.rating ?? 0),
      lat: coreCoord(d?.lat),
      lng: coreCoord(d?.lng),
      bearing: Number.isFinite(bearing) ? bearing : undefined,
    };
  }

  /**
   * Every live order at once — what the status sweep runs on. One call, not one
   * per passenger. `clientBonus` is 0: tanga is read from the bot's ledger.
   */
  async listActiveBookings(): Promise<ActiveBookingLite[]> {
    const rows = await this.request<any[]>("GET", "/orders/active-lite");
    // An empty list here closes every live ride card as "finished". Only a real list may say so.
    if (!Array.isArray(rows)) throw new Error("taxi core active-lite: expected a list");
    return rows.map((r) => ({
      id:          this.toOuterId(r.id),
      phoneNorm:   String(r.phoneNorm ?? "").replace(/\D/g, "").slice(-9),
      status:      bookingStatus(r.status),
      carNumber:   r.carNumber ?? "",
      addressName: r.addressName ?? "",
      clientBonus: 0,
      lat:         coreCoord(r.lat),
      lng:         coreCoord(r.lng),
      additionalPaymentAddress: Number(r.additionalPayment ?? 0),
      additionalPaymentClient:  0,
      additionalPaymentCompany: 0,
    }));
  }

  async getRideHistory(phone: string, size = 20, page = 0): Promise<RideHistoryItem[]> {
    const p = this.phone(phone);
    if (!p) return [];
    const limit = Math.max(1, Math.min(100, size));
    const rows = await this.request<any[]>("GET", "/orders/by-phone/history", {
      query: { phone: p, limit, offset: Math.max(0, page) * limit },
    });
    return (rows ?? []).map((r) => ({
      id: this.toOuterId(r.id),
      addressName: r.pickupAddress ?? "",
      status: bookingStatus(r.status),
      carNumber: r.carNumber ?? "",
      carModel: r.carModel ?? "",
      payment: Number(r.finalFareUzs ?? 0),
      cashback: 0,
      distance: coreKmToMeters(r.distanceKm),
      at: String(r.completedAt ?? r.createdAt ?? ""),
    }));
  }

  /** What a plate has been doing — the driver-side history. */
  async getRidesByCar(carNumber: string, size?: number): Promise<RideHistoryItem[]> {
    const rows = await this.request<any[]>(
      "GET", `/drivers/rides-by-car/${encodeURIComponent(carNumber)}`, { query: { limit: size } },
    );
    return (rows ?? []).map((r) => ({
      id:          this.toOuterId(r.id),
      addressName: r.addressName ?? "",
      status:      bookingStatus(r.status),
      carNumber:   r.carNumber ?? carNumber,
      carModel:    r.carModel ?? "",
      payment:     Number(r.payment ?? 0),
      cashback:    0,
      distance:    coreKmToMeters(r.distance),
      at:          String(r.at ?? ""),
      additionalPaymentCompany: Number(r.additionalPaymentCompany ?? 0),
    }));
  }

  // ── drivers ───────────────────────────────────────────────────────────────

  /**
   * Live cars for a passenger's map: a point, a heading and busy/free — nothing
   * that identifies a person. The core strips it at the source; this takes only
   * those four fields even so.
   */
  async getDriverPins(): Promise<DriverPin[]> {
    const pins = await this.request<any[]>("GET", "/drivers/pins");
    return (pins ?? [])
      .map((p) => ({
        lat: Number(p?.lat),
        lng: Number(p?.lng),
        bearing: Number(p?.bearing ?? 0),
        busy: p?.busy === true,
      }))
      .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng) && p.lat !== 0 && p.lng !== 0);
  }

  /**
   * Free cars around a pickup point. The core already hides who and where (a label that rotates every
   * ten minutes, a point snapped to a 250 m cell, a heading rounded to 45°); this still keeps only
   * those four fields, so a field added to the core later cannot ride through to a passenger.
   */
  async getNearbyFreeCars(lat: number, lng: number): Promise<NearbyFreeCars> {
    const r = await this.request<any>("GET", "/drivers/nearby-free", { query: { lat, lng } });
    const count = r?.freeCount;
    const cars = (Array.isArray(r?.cars) ? r.cars : [])
      .map((c: any) => ({ id: String(c?.id ?? ""), lat: Number(c?.lat), lng: Number(c?.lng), bearing: Number(c?.bearing ?? 0) }))
      .filter((c: { id: string; lat: number; lng: number }) => c.id && Number.isFinite(c.lat) && Number.isFinite(c.lng) && !(c.lat === 0 && c.lng === 0));
    return {
      freeCount: typeof count === "number" && Number.isFinite(count) && count >= 0 ? Math.round(count) : null,
      cars,
    };
  }

  async getDriverByCar(carNumber: string): Promise<BookingDriver | null> {
    const d = await this.request<any>("GET", `/drivers/by-car/${encodeURIComponent(carNumber)}`);
    return d ? BirJoySource.toDriver(d, carNumber) : null;
  }

  /** A page of finished rides, newest first — the analytics pull. */
  async getReportsPage(page: number, size: number): Promise<RideHistoryItem[]> {
    const rows = await this.request<any[]>("GET", "/public-config/reports", { query: { page, size } });
    return (rows ?? []).map((r) => ({
      id:          this.toOuterId(r.id),
      addressName: r.addressName ?? "",
      status:      bookingStatus(r.status),
      carNumber:   r.carNumber ?? "",
      carModel:    r.carModel ?? "",
      payment:     Number(r.payment ?? 0),
      cashback:    0,
      distance:    coreKmToMeters(r.distance),
      at:          String(r.at ?? ""),
      additionalPaymentCompany: Number(r.additionalPaymentCompany ?? 0),
    }));
  }

  /**
   * The whole driver list, for the call panel. `address` and `licenseTerm` are
   * null rather than guessed; `lastRideAt` carries the core's last-online time.
   */
  async listDriverRoster(): Promise<DriverRosterRow[]> {
    const rows = await this.request<any[]>("GET", "/drivers/roster");
    return (rows ?? []).map((d) => ({
      kasId:      this.toOuterId(d.driverId),
      fullName:   d.fullName ?? "",
      phone:      d.phone ?? null,
      carNumber:  d.carNumber ?? null,
      carModel:   d.carModel ?? null,
      address:    null,
      balance:    Number(d.balance ?? 0),
      debt:       Number(d.debt ?? 0),
      trips:      Number(d.trips ?? 0),
      cancels:    Number(d.cancels ?? 0),
      rating:     Number(d.rating ?? 0),
      active:     d.active === true,
      lastRideAt: d.lastOnlineAt ?? null,
      licenseTerm: null,
    }));
  }

  /**
   * Money onto a driver's balance — tanga turned into so'm, or a debt repaid.
   *
   * The plate is the identifier: the bot's member rows still carry kas-era ids
   * for drivers the cutover has not adopted, and an id from that space would
   * name a different driver in the core. `requestId` makes a retry safe.
   *
   * Three outcomes, kept apart: applied · refused (nothing moved, refund is
   * right) · unknown (no answer — the money may have moved, a refund would pay
   * twice).
   */
  async addDriverPayment(
    carNumber: string,
    amount: number,
    requestId: string,
    comment?: string,
    coreDriverId?: number,
  ): Promise<{ ok: boolean; balance: number | null; status: number; unknown?: boolean }> {
    if (!carNumber) return { ok: false, balance: null, status: 400 };
    try {
      const res = await this.request<{ ok: boolean; balance: number | null; reason?: string }>(
        "POST", "/drivers/payment",
        { body: { carNumber, amountUzs: amount, requestId, note: comment, driverId: coreDriverId } },
      );
      if (res?.ok !== true) console.warn(`[taxi-core] driver payment refused for ${carNumber}: ${res?.reason ?? "?"}`);
      return { ok: res?.ok === true, balance: res?.balance ?? null, status: res?.ok ? 200 : 400 };
    } catch (e) {
      if (coreOutcomeUnknown(e)) return { ok: false, balance: null, status: 0, unknown: true };
      return { ok: false, balance: null, status: e instanceof CoreHttpError ? e.status : 400 };
    }
  }

  /** A driver's account by plate. `debt` is the negative half of the balance. */
  async getDriverAccount(carNumber: string): Promise<DriverAccount | null> {
    const a = await this.request<any>("GET", `/drivers/account/${encodeURIComponent(carNumber)}`);
    if (!a) return null;
    return {
      kasId:       this.toOuterId(a.driverId),
      carNumber:   a.carNumber ?? carNumber,
      balance:     Number(a.balance ?? 0),
      debt:        Number(a.debt ?? 0),
      rating:      Number(a.rating ?? 0),
      takeCount:   Number(a.takeCount ?? 0),
      cancelCount: Number(a.cancelCount ?? 0),
      active:      a.active === true,
    };
  }

  // ── people ────────────────────────────────────────────────────────────────

  async fetchMembers(): Promise<KasMember[]> {
    return this.fetchMembersFrom();
  }

  /**
   * Members, in the bot's vocabulary. Ids come back prefixed `bj_`, and that
   * prefix is what tells the member matcher this is the same human arriving
   * from the core — so an existing customer's row is adopted, tanga included,
   * instead of a second account being made next to it.
   */
  private async fetchMembersFrom(query?: Record<string, string | number | undefined>): Promise<KasMember[]> {
    const rows = await this.request<any[]>("GET", "/public-config/members", { query });
    return (rows ?? []).map((m) => ({
      type:      m.type === "driver" ? ("driver" as MemberType) : ("client" as MemberType),
      kasId:     String(m.kasId ?? ""),
      fullName:  m.fullName ?? "",
      phone:     m.phone ?? undefined,
      carNumber: m.carNumber ?? undefined,
      points:    Number(m.points ?? 0),
      trips:     Number(m.trips ?? 0),
      rating:    Number(m.rating ?? 0),
    }));
  }

  async fetchByPhone(phone: string, only?: MemberType): Promise<KasMember[]> {
    const p = this.phone(phone);
    if (!p) return [];
    const all = await this.fetchMembersFrom({ phone: p });
    return only ? all.filter((m) => m.type === only) : all;
  }

  /**
   * Who is calling — name, the places they use, and whether a car is already
   * coming. `null` for an unknown number.
   *
   * A passenger's own saved places are NOT catalogue places: their ids come from
   * a different table in the core. They are handed out negative, so nothing
   * downstream can send one as a catalogue id — the order travels by the saved
   * coordinates instead.
   */
  async checkClient(phone: string): Promise<ClientBookingInfo | null> {
    const p = this.phone(phone);
    if (!p) return null;
    const info = await this.request<any>("GET", "/orders/by-phone/booking-info", { query: { phone: p } });
    return this.toClientInfo(info, p);
  }

  private toClientInfo(info: any, p: string): ClientBookingInfo | null {
    if (!info) return null;
    return {
      clientName:  info.clientName ?? "",
      phoneNumber: info.phoneNumber ?? p,
      addresses:   (info.addresses ?? []).map((a: any) => ({
        ...BirJoySource.toSavedAddress(a),
        id: -Math.abs(Number(a.id) || 0),
      })),
      activeBooking: info.activeBooking
        ? {
            addressName: info.activeBooking.addressName ?? "",
            createdDate: String(info.activeBooking.createdDate ?? ""),
          }
        : null,
    };
  }

  /** Give a caller the name they chose. Never creates a customer. */
  async setClientName(phone: string, fullName: string): Promise<{ ok: boolean; status?: number }> {
    const p = this.phone(phone);
    if (!p) return { ok: false, status: 400 };
    try {
      const res = await this.request<{ ok: boolean }>("PATCH", "/orders/by-phone/name", {
        body: { phone: p, fullName },
      });
      return { ok: res?.ok === true, status: res?.ok ? 200 : 404 };
    } catch (e) {
      return { ok: false, status: e instanceof CoreHttpError ? e.status : 0 };
    }
  }

  // ── reference data ────────────────────────────────────────────────────────

  /** The tariff straight from the snapshot the fare engine uses this second. */
  async getTariff(): Promise<ClientTariff> {
    const t = await this.request<any>("GET", "/public-config/tariff");
    // The core charges a base fare on every ride plus distance and time; its separate "minimum
    // fare" setting is 0 live (checked 2026-09-17). What a passenger pays at the very least is the
    // larger of the two — quoting the 0 would promise a free first kilometre.
    const minimalPayment = Math.max(Number(t?.minimalPayment ?? 0), Number(t?.baseFare ?? 0));
    return {
      minimalDistance:               Number(t?.minimalDistance ?? 0),
      minimalPayment,
      firstKilometerPaymentInCity:   Number(t?.firstKilometerPaymentInCity ?? 0),
      secondKilometerPaymentInCity:  Number(t?.secondKilometerPaymentInCity ?? 0),
      distancePaymentInCity:         Number(t?.distancePaymentInCity ?? 0),
      firstKilometerPaymentInRegion: Number(t?.firstKilometerPaymentInRegion ?? 0),
      secondKilometerPaymentInRegion:Number(t?.secondKilometerPaymentInRegion ?? 0),
      distancePaymentInRegion:       Number(t?.distancePaymentInRegion ?? 0),
      timePayment:                   Number(t?.timePayment ?? 0),
    };
  }

  async getCarModels(): Promise<CarModel[]> {
    const rows = await this.request<Array<{ id: number; name: string; category?: number | string; rating?: number | string }>>(
      "GET",
      "/car-models",
    );
    return (rows ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      category: String(r.category ?? ""),
      rating: Number(r.rating ?? 0),
    }));
  }

  /** Who we are and which number a passenger rings. Editable in the core's settings. */
  async getCompanyInfo(): Promise<CompanyInfo> {
    const c = await this.request<any>("GET", "/public-config/company");
    return {
      companyName:      c?.companyName ?? "BirJoy Taxi",
      dispatcherPhones: Array.isArray(c?.dispatcherPhones) ? c.dispatcherPhones : [],
      lat:              Number(c?.lat ?? 0),
      lng:              Number(c?.lng ?? 0),
    };
  }

  /** The widest zone an operator drew — an EMPTY list when none exists. */
  async getServiceArea(): Promise<GeoPoint[]> {
    const ring = await this.request<any[]>("GET", "/public-config/service-area");
    return (ring ?? [])
      .map((p) => ({ lat: Number(p?.lat), lng: Number(p?.lng) }))
      .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  }

  /**
   * Yesterday in five numbers, plus how many cars are on right now.
   *
   * Cached for a minute: the booking sweep asks on every tick — every 5 s while
   * a passenger waits — and each answer is two aggregate queries in the core.
   * "How many drivers are online" does not change meaningfully within a minute.
   */
  async getMainReport(): Promise<KasMainReport> {
    const now = Date.now();
    if (this.mainReport && now - this.mainReport.at < MAIN_REPORT_TTL_MS) return this.mainReport.value;
    const r = await this.request<any>("GET", "/public-config/main-report");
    const value = {
      completedYesterday: Number(r?.completedYesterday ?? 0),
      bookingsYesterday:  Number(r?.bookingsYesterday ?? 0),
      onlineDrivers:      Number(r?.onlineDrivers ?? 0),
      activeDrivers:      Number(r?.activeDrivers ?? 0),
      serviceCost:        Number(r?.serviceCost ?? 0),
    };
    this.mainReport = { at: now, value };
    return value;
  }

  /**
   * The cashback rules, in the old shape, from the bot's own economy knobs.
   * One rate for both channels — a split nothing honours would be invented.
   */
  async getBonusRules(): Promise<BonusRules> {
    const { getBonusEcon } = await import("../services/bonusConfig");
    const econ = await getBonusEcon();
    const perRide = Number(econ.rideBase ?? 0);
    return {
      enabled: perRide > 0,
      clientBonusCall: perRide,
      clientBonusApp: perRide,
      clientBonusCallFirstTime: Number(econ.firstRide ?? 0),
      clientBonusAppFirstTime: Number(econ.firstRide ?? 0),
      clientBonusMinimalDistance: 0,
    };
  }
}
