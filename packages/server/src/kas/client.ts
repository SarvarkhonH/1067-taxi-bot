import http from "node:http";
import https from "node:https";
import { env } from "../env";
import type {
  DriverPin,
  DriverRosterRow,
  DriverAccount,
  ActiveBooking,
  ActiveBookingLite,
  BonusRules,
  BookingDriver,
  BookingRequest,
  BookingResult,
  KasAddon,
  CarModel,
  ClientBookingInfo,
  ClientTariff,
  CompanyInfo,
  GeoPoint,
  KasDataSource,
  KasMainReport,
  KasMember,
  RideHistoryItem,
  SavedAddress,
} from "./types";
import type { MemberType } from "@t1067/shared";
import { recordKas, classifyKasError } from "../services/kasHealth";

// ─── kas booking status normalization ────────────────────────────────────────
// kas booking lifecycle: new → take → in_place → delivered. There is NO "started"/"arrived".
// "in_place" = the driver is in place at the pickup AND the taximeter is running — the trip is
// underway. Map it to the canonical "started" the bot sweep + Mini App expect, so rideStartedAt
// is set and the ride is rewarded on finish (baraban / cashback / fare). Without this EVERY real
// ride looked like a phantom (no rideStartedAt) and paid nothing. Other kas statuses already map:
// new/searching → SEARCHING, take/on_the_way → en-route, cancel_*/take_back → cancel.
// Canary (audit P1): the ENTIRE reward decision hinges on this exact vocabulary. If kas renames a
// token (it renamed nothing yet, but "in_place" once broke ALL payouts before this map existed),
// a completed ride would silently look like a phantom/cancel and pay nothing, fleet-wide, with NO
// error. So any status token we've never seen is logged + alerted ONCE (throttled) — the earliest
// possible signal of a kas breaking change, days before anyone notices missing tanga.
const KNOWN_KAS_STATUSES = new Set([
  "new", "searching", "take", "on_the_way", "called", "in_place", "started", "arrived",
  "delivered", "completed", "finished", "cancel", "cancel_by_operator", "cancel_by_server",
  "cancel_by_driver", "cancel_by_client", "take_back", "no_booking", "",
]);
const seenUnknownStatus = new Set<string>();
export function normBookingStatus(s: string): string {
  if (!KNOWN_KAS_STATUSES.has(s) && !seenUnknownStatus.has(s)) {
    seenUnknownStatus.add(s);
    if (seenUnknownStatus.size < 50) {
      console.warn(`[kas-canary] UNKNOWN booking status "${s}" — kas may have changed its vocabulary (reward attribution at risk)`);
      void import("../services/economyService")
        .then(({ alertAdmins }) => alertAdmins(`⚠️ <b>kas-canary:</b> notanish safar-status «<code>${s}</code>» keldi. Kas so'zlarini o'zgartirgan bo'lishi mumkin — to'lov-atributsiyasi xavf ostida. Tekshiring.`))
        .catch(() => undefined);
    }
  }
  return s === "in_place" ? "started" : s;
}

// ─── low-level HTTP (raw, so we fully control cookies + redirects) ───────────
interface RawResponse {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: string;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function rawRequest(
  urlStr: string,
  opts: { method?: string; headers?: Record<string, string>; body?: string } = {},
): Promise<RawResponse> {
  const url = new URL(urlStr);
  const mod = url.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const req = mod.request(
      url,
      { method: opts.method ?? "GET", headers: opts.headers },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c as Buffer));
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: Buffer.concat(chunks).toString("utf8"),
          }),
        );
      },
    );
    req.on("error", reject);
    req.setTimeout(25000, () => req.destroy(new Error("kas1067 request timeout")));
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

class CookieJar {
  private jar = new Map<string, string>();
  setFrom(headers: http.IncomingHttpHeaders): void {
    const sc = headers["set-cookie"];
    if (!sc) return;
    for (const line of sc) {
      const pair = line.split(";")[0] ?? "";
      const idx = pair.indexOf("=");
      if (idx > 0) this.jar.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
    }
  }
  header(): string {
    return [...this.jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }
  clear(): void {
    this.jar.clear();
  }
}

function extractCsrf(html: string): { name: string; value: string } | null {
  const m =
    html.match(/name="(_csrf|csrf[-_]?token)"[^>]*value="([^"]*)"/i) ??
    html.match(/value="([^"]*)"[^>]*name="(_csrf|csrf[-_]?token)"/i);
  if (!m) return null;
  return m[1]?.toLowerCase().includes("csrf") ? { name: m[1]!, value: m[2]! } : { name: m[2]!, value: m[1]! };
}

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

// ─── kas1067 client ──────────────────────────────────────────────────────────
export interface KasClientOptions {
  baseUrl: string;
  username: string;
  password: string;
  pageSize?: number;
  maxPages?: number;
}

export class KasLiveSource implements KasDataSource {
  readonly name = "live" as const;
  private jar = new CookieJar();
  private loggedIn = false;
  private pageSize: number;
  private maxPages: number;
  // 🚦 kas rate-limit shield (V-NEXT #1). Measured live: ~1 req/s is safe, ~7 req/s → ~70% 429 →
  // broken login → dead bookings. Before this queue, parallel callers (getBookingInfo fan-out × N
  // simultaneous app-opens + the sweep + bot handlers) hit kas at once and 429-cascaded. Now EVERY
  // kas request flows through ONE serial queue with a minimum start-to-start gap.
  private queueTail: Promise<void> = Promise.resolve();
  private lastReqAt = 0;
  private static readonly MIN_GAP_MS = Math.max(0, Number(process.env.KAS_MIN_GAP_MS) || 600);
  // 🔐 single-flight login: when the shared session dies under concurrent load, every in-flight
  // request used to call login() in PARALLEL — each clears the shared cookie jar (corrupting the
  // others) and kas rate-limits login itself. Now the first caller logs in; the rest await the SAME
  // promise. A rejected login clears the slot so the next call retries fresh.
  private loginInFlight: Promise<void> | null = null;

  constructor(private opts: KasClientOptions) {
    this.pageSize = opts.pageSize ?? 200;
    this.maxPages = opts.maxPages ?? 50;
  }

  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queueTail.then(async () => {
      const wait = this.lastReqAt + KasLiveSource.MIN_GAP_MS - Date.now();
      if (wait > 0) await sleep(wait);
      this.lastReqAt = Date.now(); // start-to-start spacing (long responses don't add extra delay)
      return fn();
    });
    this.queueTail = run.then(
      () => undefined,
      () => undefined, // a failed request must never wedge the queue
    );
    return run;
  }

  private async ensureLogin(): Promise<void> {
    if (this.loggedIn) return;
    if (!this.loginInFlight) {
      this.loginInFlight = this.login().finally(() => {
        this.loginInFlight = null;
      });
    }
    await this.loginInFlight;
  }

  private url(path: string): string {
    if (path.startsWith("http")) return path;
    const u = new URL(this.opts.baseUrl);
    if (path.startsWith("/")) return `${u.protocol}//${u.host}${path}`; // host-absolute
    return `${this.opts.baseUrl.replace(/\/$/, "")}/${path}`; // context-relative
  }

  private baseHeaders(): Record<string, string> {
    return { "User-Agent": UA, "Accept-Language": "ru,en;q=0.8", Cookie: this.jar.header() };
  }

  async login(): Promise<void> {
    if (!this.opts.username || !this.opts.password) {
      throw new Error("kas1067 live mode needs KAS_USERNAME and KAS_PASSWORD in .env");
    }
    // kas1067 rate-limits login (429) AND a STALE session cookie makes a re-login return the login
    // page (200, no redirect) instead of a fresh CSRF form → "login failed". A long-running process
    // accumulates that stale JSESSIONID, so each login starts from a CLEARED jar (anonymous GET
    // /login → fresh CSRF), and a 200-failure is RETRIED with backoff (transient under load) before
    // giving up. A fresh client instance already logs in fine — this makes the long-lived one match.
    for (let attempt = 0; ; attempt++) {
      this.jar.clear();
      const page = await rawRequest(this.url("login"), { headers: this.baseHeaders() });
      if (page.status === 429 && attempt < 4) {
        await sleep(2000 * (attempt + 1));
        continue;
      }
      this.jar.setFrom(page.headers);
      const csrf = extractCsrf(page.body);

      const form = new URLSearchParams({ username: this.opts.username, password: this.opts.password });
      if (csrf) form.set(csrf.name, csrf.value);

      const res = await rawRequest(this.url("login"), {
        method: "POST",
        headers: { ...this.baseHeaders(), "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString(),
      });
      if (res.status === 429 && attempt < 4) {
        await sleep(2000 * (attempt + 1));
        continue;
      }
      this.jar.setFrom(res.headers);

      const loc = (res.headers.location as string) ?? "";
      const ok = res.status >= 300 && res.status < 400 && !/\/login/.test(loc) && !/error/i.test(loc);
      if (!ok) {
        if (attempt < 4) {
          await sleep(2000 * (attempt + 1)); // transient 200 / redirect-to-login → retry with a fresh jar
          continue;
        }
        throw new Error(
          `kas1067 login failed (status ${res.status}, redirect "${loc}"). Check KAS_USERNAME / KAS_PASSWORD.`,
        );
      }
      this.loggedIn = true;
      return;
    }
  }

  async getText(path: string, accept = "application/json, text/plain, */*"): Promise<RawResponse> {
    // Every kas HTTP read funnels through here — passively feed the early-warning health monitor so
    // a 429/login/timeout spike alerts the owner in seconds (no synthetic ping, zero extra kas load).
    try {
      await this.ensureLogin();
      let res = await this.enqueue(() => rawRequest(this.url(path), { headers: { ...this.baseHeaders(), Accept: accept } }));
      if (res.status >= 300 && res.status < 400 && /\/login/.test((res.headers.location as string) ?? "")) {
        this.loggedIn = false;
        await this.ensureLogin();
        res = await this.enqueue(() => rawRequest(this.url(path), { headers: { ...this.baseHeaders(), Accept: accept } }));
      }
      recordKas(res.status < 400, res.status === 429 ? "429" : res.status >= 400 ? "other" : undefined);
      return res;
    } catch (e) {
      recordKas(false, classifyKasError(e));
      throw e;
    }
  }

  async getJson(path: string): Promise<Record<string, unknown>> {
    const res = await this.getText(path);
    if (res.status >= 400) throw new Error(`kas1067 GET ${path} -> ${res.status}: ${res.body.slice(0, 120)}`);
    try {
      return JSON.parse(res.body) as Record<string, unknown>;
    } catch {
      throw new Error(`kas1067 GET ${path} did not return JSON (status ${res.status}).`);
    }
  }

  async fetchMembers(): Promise<KasMember[]> {
    const [clients, drivers] = await Promise.all([this.fetchClients(), this.fetchDrivers()]);
    return [...clients, ...drivers];
  }

  /** On-demand lookup by phone — one light query per type, no bulk scan. */
  async fetchByPhone(phone: string, only?: MemberType): Promise<KasMember[]> {
    const norm = phone.replace(/\D/g, "").slice(-9);
    if (!norm) return [];
    const q = encodeURIComponent(norm);
    const out: KasMember[] = [];
    const exact = (m: KasMember) => m.phone && m.phone.replace(/\D/g, "").slice(-9) === norm;

    // `only` lets the periodic refresh skip the endpoint it doesn't need (a client member never needs
    // the driver lookup and vice-versa). kas rate-limits hard (~1 req/s) so halving the calls matters.
    if (only !== "driver") {
      try {
        const data = await this.getJson(`api/clients/byFilter?searchText=${q}&sort=bonus&page=0&size=20`);
        for (const c of (data.clientDtoList as Record<string, unknown>[]) ?? []) {
          const m = mapClient(c);
          if (exact(m)) out.push(m);
        }
      } catch (e) {
        console.error("[kas] client lookup failed:", e instanceof Error ? e.message : e);
      }
    }
    if (only !== "client") {
      try {
        const data = await this.getJson(`api/drivers/byFilter?searchText=${q}&sort=id&page=0&size=20&date=01.01.2015`);
        for (const d of (data.driverDtoList as Record<string, unknown>[]) ?? []) {
          const m = mapDriver(d);
          if (exact(m)) out.push(m);
        }
      } catch (e) {
        console.error("[kas] driver lookup failed:", e instanceof Error ? e.message : e);
      }
    }
    return out;
  }

  private async fetchClients(): Promise<KasMember[]> {
    const out: KasMember[] = [];
    for (let page = 0; page < this.maxPages; page++) {
      const data = await this.getJson(
        `api/clients/byFilter?searchText=&sort=bonus&page=${page}&size=${this.pageSize}`,
      );
      const list = (data.clientDtoList as Record<string, unknown>[]) ?? [];
      if (!list.length) break;
      for (const c of list) out.push(mapClient(c));
      if (list.length < this.pageSize) break;
    }
    return out;
  }

  private async fetchDrivers(): Promise<KasMember[]> {
    const out: KasMember[] = [];
    for (let page = 0; page < this.maxPages; page++) {
      const data = await this.getJson(
        `api/drivers/byFilter?searchText=&sort=id&page=${page}&size=${this.pageSize}&date=01.01.2015`,
      );
      const list = (data.driverDtoList as Record<string, unknown>[]) ?? [];
      if (!list.length) break;
      for (const d of list) out.push(mapDriver(d));
      const all = data.allDriversCount;
      if (typeof all === "number" && out.length >= all) break;
      if (list.length < this.pageSize) break;
    }
    return out;
  }

  /** Obzvon: full driver roster with the recruiting-relevant fields kept (last-ride date, license,
   *  address, active). Same paginated byFilter as fetchDrivers, but returns the RAW-mapped row. */
  async listDriverRoster(): Promise<DriverRosterRow[]> {
    const out: DriverRosterRow[] = [];
    for (let page = 0; page < this.maxPages; page++) {
      const data = await this.getJson(
        `api/drivers/byFilter?searchText=&sort=id&page=${page}&size=${this.pageSize}&date=01.01.2015`,
      );
      const list = (data.driverDtoList as Record<string, unknown>[]) ?? [];
      if (!list.length) break;
      for (const d of list) out.push(mapRosterRow(d));
      const all = data.allDriversCount;
      if (typeof all === "number" && out.length >= all) break;
      if (list.length < this.pageSize) break;
    }
    return out;
  }

  private async postJson(path: string, body: unknown): Promise<RawResponse> {
    await this.ensureLogin();
    // Match the SPA: strings go raw, objects as JSON (both with application/json).
    const payload = typeof body === "string" ? body : JSON.stringify(body);
    const doReq = () =>
      this.enqueue(() =>
        rawRequest(this.url(path), {
          method: "POST",
          headers: { ...this.baseHeaders(), "Content-Type": "application/json", Accept: "application/json, text/plain, */*" },
          body: payload,
        }),
      );
    let res = await doReq();
    if (res.status >= 300 && res.status < 400 && /\/login/.test((res.headers.location as string) ?? "")) {
      this.loggedIn = false;
      await this.ensureLogin();
      res = await doReq();
    }
    return res;
  }

  private async putJson(path: string, body: unknown): Promise<RawResponse> {
    await this.ensureLogin();
    const doReq = () =>
      this.enqueue(() =>
        rawRequest(this.url(path), {
          method: "PUT",
          headers: { ...this.baseHeaders(), "Content-Type": "application/json", Accept: "application/json, text/plain, */*" },
          body: JSON.stringify(body),
        }),
      );
    let res = await doReq();
    if (res.status >= 300 && res.status < 400 && /\/login/.test((res.headers.location as string) ?? "")) {
      this.loggedIn = false;
      await this.ensureLogin();
      res = await doReq();
    }
    return res;
  }

  /** Grant/set a client's cashback bonus by phone (kas1067 admin edit, bonusSecretKey 1303). */
  async setClientBonus(phone: string, newBonus: number): Promise<{ ok: boolean; oldBonus: number; name?: string; status?: number }> {
    const norm = phone.replace(/\D/g, "").slice(-9);
    const data = await this.getJson(`api/clients/byFilter?searchText=${encodeURIComponent(norm)}&sort=bonus&page=0&size=20`);
    const list = (data.clientDtoList as Record<string, unknown>[]) ?? [];
    const client = list.find((c) => String(c.phoneNumber ?? "").replace(/\D/g, "").slice(-9) === norm);
    if (!client) return { ok: false, oldBonus: 0 };
    const oldBonus = Number(client.bonus) || 0;
    const res = await this.putJson("api/clients", { ...client, bonus: newBonus, bonusSecretKey: env.KAS_BONUS_SECRET_KEY });
    return { ok: res.status >= 200 && res.status < 300, oldBonus, name: String(client.fullName ?? client.id), status: res.status };
  }

  /** Update a CLIENT's name in kas1067. Same proven mechanism as setClientBonus: fetch the full
   *  client record, PUT it back with fullName changed (+ bonusSecretKey, which the PUT requires).
   *  NOTE: kas may or may not honor a fullName change on this endpoint — owner pilot confirms it. */
  async setClientName(phone: string, fullName: string): Promise<{ ok: boolean; status?: number }> {
    const norm = phone.replace(/\D/g, "").slice(-9);
    if (!norm || !fullName) return { ok: false };
    const data = await this.getJson(`api/clients/byFilter?searchText=${encodeURIComponent(norm)}&sort=bonus&page=0&size=20`);
    const list = (data.clientDtoList as Record<string, unknown>[]) ?? [];
    const client = list.find((c) => String(c.phoneNumber ?? "").replace(/\D/g, "").slice(-9) === norm);
    if (!client) return { ok: false };
    const res = await this.putJson("api/clients", { ...client, fullName, bonusSecretKey: env.KAS_BONUS_SECRET_KEY });
    return { ok: res.status >= 200 && res.status < 300, status: res.status };
  }

  /** Add a delta to a client's cashback bonus (read current + set new total). */
  async addClientBonus(phone: string, delta: number): Promise<{ ok: boolean; oldBonus: number; newBonus: number; status?: number }> {
    const cur = (await this.fetchByPhone(phone)).find((m) => m.type === "client")?.points ?? null;
    if (cur === null) return { ok: false, oldBonus: 0, newBonus: 0 };
    const res = await this.setClientBonus(phone, cur + delta);
    return { ok: res.ok, oldBonus: cur, newBonus: cur + delta, status: res.status };
  }

  // ─── booking ────────────────────────────────────────────────────────────────
  async checkClient(phone: string): Promise<ClientBookingInfo | null> {
    const clean = kasPhone(phone); // normalize to +998<last9> — kas rejects other shapes
    const data = await this.getJson(`api/bookings/checkClientPhoneNumber/${encodeURIComponent(clean)}`);
    const bd = data.bookingDto as Record<string, unknown> | null | undefined;
    return {
      clientName: (data.clientName as string) || "Mijoz",
      phoneNumber: clean,
      addresses: mapAddresses(data.addressDtoList),
      activeBooking: bd
        ? { addressName: String(bd.addressName ?? ""), createdDate: String(bd.createdDate ?? "") }
        : null,
    };
  }

  async searchAddresses(text: string): Promise<SavedAddress[]> {
    // The SPA posts the raw search term (JSON string) to addresses/byName/.
    const res = await this.postJson("api/addresses/byName/", text);
    if (res.status >= 400) return [];
    try {
      return mapAddresses(JSON.parse(res.body)).slice(0, 6);
    } catch {
      return [];
    }
  }

  // Full company address catalog (GET api/addresses/ → ~111 named places with lat/lng), the same
  // list the official rider app gets via clientAppV1/checkClient. Static city data → cached 6h so a
  // map-pin reverse-snap (nearestAddressFor) doesn't re-fetch on every drag.
  private allAddrCache: { at: number; rows: SavedAddress[] } | null = null;
  async getAllAddresses(): Promise<SavedAddress[]> {
    const SIX_H = 6 * 60 * 60 * 1000;
    if (this.allAddrCache && Date.now() - this.allAddrCache.at < SIX_H) return this.allAddrCache.rows;
    try {
      const data = await this.getJson("api/addresses/");
      const rows = mapAddresses(data);
      if (rows.length) this.allAddrCache = { at: Date.now(), rows };
      return rows;
    } catch {
      return this.allAddrCache?.rows ?? []; // serve stale on a transient error rather than nothing
    }
  }

  /** Add a payment to a DRIVER's kas BALANCE (the SPA's POST api/drivers/payment). The owner's
   *  captured body: { driverId, carNumber, payViaCash:"<sum>", payViaOnline:<sum>, comment, debt }.
   *  This is how a driver tops up their kas1067 driver balance — NOT addClientBonus (that's the
   *  client bonus). Returns the raw response so the caller can confirm. */
  async addDriverPayment(driverId: number, carNumber: string, amount: number, comment = "", debt = false): Promise<{ ok: boolean; balance: number | null; status: number }> {
    // kas drivers/payment has 3 methods: наличный (cash) / пластик (payViaOnline, debt=FALSE) / долг
    // (debt=TRUE). debt=FALSE = пластик REDUCES the driver's debt (proven 70A111AA: 60000→55000).
    // debt=TRUE = долг = the driver BORROWS (debt goes UP) — never use it for repayment (the bug the
    // owner caught). So /qarz repayment passes debt=FALSE.
    const res = await this.postJson("api/drivers/payment", { driverId, carNumber, payViaCash: "0", payViaOnline: Math.floor(amount), comment, debt });
    let balance: number | null = null;
    try {
      balance = (JSON.parse(res.body) as { balance?: number })?.balance ?? null;
    } catch {
      /* non-JSON */
    }
    return { ok: res.status >= 200 && res.status < 300, balance, status: res.status };
  }

  /** Bosqich 3: a driver's financial snapshot by car number (kas drivers/byCarNumber returns the
   *  full driver record incl. balance + debt). Returns null on lookup failure (best-effort). */
  async getDriverAccount(carNumber: string): Promise<DriverAccount | null> {
    const car = carNumber.replace(/\s/g, "").toUpperCase();
    if (car.length < 4) return null;
    try {
      const d = await this.getJson(`api/drivers/byCarNumber/${encodeURIComponent(car)}`);
      const kasId = Number(d.id ?? 0);
      if (!kasId) return null;
      return {
        kasId,
        carNumber: String(d.carNumber ?? car),
        balance: num(d.balance),
        debt: num(d.debt),
        rating: num(d.bookingRating) || num(d.companyRating) || undefined,
        takeCount: Math.round(num(d.takeBookingCount)) || undefined,
        cancelCount: Math.round(num(d.cancelBookingCount)) || undefined,
        active: typeof d.active === "boolean" ? d.active : undefined,
      };
    } catch {
      return null;
    }
  }

  // GPS orders (addressId 0 + coords — bot location-share / Mini App pin) are LABELLED here at the
  // single dispatch chokepoint so the driver app shows a real "<place> lokatsiyalik" order they can
  // tap-to-navigate (kas's native location-order behaviour), never a bare "-". Saved-address orders
  // (with a real addressId, no coords) are untouched → dispatch unchanged. Only the display label
  // changes; the lat/lng that actually route the driver are passed through as-is.
  private async nearestCatalogAddress(lat: number, lng: number): Promise<SavedAddress | null> {
    const cat = await this.getAllAddresses().catch(() => [] as SavedAddress[]);
    const coslat = Math.cos((lat * Math.PI) / 180);
    let best: SavedAddress | null = null;
    let bestD = Infinity;
    for (const a of cat) {
      if (a.lat == null || a.lng == null) continue;
      const dx = (a.lng - lng) * coslat;
      const dy = a.lat - lat;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = a;
      }
    }
    // ~8 km cap in squared-degrees (0.072° ≈ 8 km). A pin truly outside the service area still
    // falls back to addressId 0; everything inside Koson snaps to a real catalog address.
    return bestD <= 5.2e-3 ? best : null;
  }

  async createBooking(req: BookingRequest): Promise<BookingResult> {
    let addressName = req.addressName;
    const hasGps = Number.isFinite(req.addressLatitude) && Number.isFinite(req.addressLongitude);
    if (hasGps) {
      // GPS pin → KEEP addressId 0 so the rider's exact lat/lng route the driver to the PRECISE pin.
      // (Earlier we snapped to the nearest catalog addressId to get «new» dispatch, but kas throughWeb
      // prefers the addressId's STORED coords over the separate lat/lng → the driver was sent to the
      // snapped place itself, e.g. «2-maktab», not the rider, ~50-100 m off. Owner: fix the location.)
      // We still look up the nearest place for a friendly «<place> yaqinida» label only — no addressId.
      const near = await this.nearestCatalogAddress(req.addressLatitude!, req.addressLongitude!).catch(() => null);
      let base = (addressName || "").replace(/\s*(yaqini(da)?|lokatsiyalik)\s*$/i, "").trim();
      if (!base || base === "-" || /belgilangan/i.test(base)) base = near?.name || "Belgilangan joy";
      addressName = `${base} yaqinida`;
    }
    // 🎯 CLIENT-APP path: for GPS orders, create a REAL client order (status «new» + EXACT pin + a «℗»
    // place name) using the rider's OWN kas secretKey — resolved operator-side, so NO rider OTP. Gated
    // DARK by «clientbooking»; any miss falls through to the operator throughWeb path below.
    if (hasGps) {
      try {
        const { featureOn } = await import("../services/featureFlags");
        if (await featureOn("clientbooking")) {
          const key = await this.clientSecretFor(req.phoneNumber);
          if (key) {
            const cr = await this.clientCreateBooking({
              secretKey: key,
              phone: req.phoneNumber,
              lat: req.addressLatitude!,
              lng: req.addressLongitude!,
              // kas names client orders «℗ <carModel>, <place>» and resolves <place> itself server-side
              // from lat/lng (this DTO has no addressName field of its own, unlike throughWeb below).
              // 2026-07-23: tried baking our own guarded `addressName` into carModel too as a fallback —
              // REVERTED same day: kas's own resolution normally succeeds (confirmed live: order b62506
              // got a real place name), so the extra text just produced a confusing DOUBLED label
              // («Farangiz yaqinida, Farangiz») that likely caused an operator to reject a fine order.
              // Leave carModel plain; revisit with a real reproduction of kas's resolution failing
              // before adding any fallback text here again.
              carModel: "Lokatsiyalik",
              additionalPayment: req.additionalPayment ?? 0,
            });
            if (cr.status >= 200 && cr.status < 300 && /"status"\s*:\s*"new"/.test(cr.body)) {
              this.bustActiveCache(); // our own new booking must be visible to the next guard read immediately
              return { ok: true, message: cr.body.slice(0, 200) };
            }
          }
        }
      } catch {
        /* client path unavailable → fall through to the operator throughWeb path */
      }
    }
    const body = { ...req, addressName, phoneNumber: kasPhone(req.phoneNumber) }; // addressId stays as sent (0 for GPS); kas-standard phone
    // A LIVE session returns the created booking JSON (always a numeric "id"). A DEAD session
    // (another login on the shared kas account killed ours) makes kas serve the LOGIN PAGE with
    // HTTP 200 — postJson's 302-check misses it, so the old code read that as success → a PHANTOM
    // booking that never reached kas (rider stuck on "qidirilyapti", no driver, no notifications).
    // So REQUIRE a booking-shaped body; if missing, force a fresh login and retry once.
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await this.postJson("api/bookings/throughWeb", body);
      if (res.status >= 200 && res.status < 300 && /"id"\s*:\s*\d/.test(res.body)) {
        this.bustActiveCache(); // our own new booking must be visible to the next guard read immediately
        return { ok: true, message: res.body.slice(0, 200) };
      }
      if (attempt === 0) {
        this.loggedIn = false; // dead/garbage response → drop session, re-login fresh, retry
        continue;
      }
      return { ok: false, message: res.body.slice(0, 200) || `kas status ${res.status}` };
    }
    return { ok: false, message: "createBooking: kas did not return a booking" };
  }

  // ── kas CLIENT endpoints (api/clientAppV1/*) — create REAL client orders («new» + EXACT pin +
  // server-snapped name), unlike the operator throughWeb path. Auth = phoneNumber + secretKey IN THE
  // BODY (no session/cookie), exactly like the decompiled client app. secretKey is issued once via
  // clientLogin → clientConfirmSms (a 4-digit OTP texted to the rider). These DON'T use operator login. ──
  private clientHeaders(): Record<string, string> {
    return { "User-Agent": UA, "Content-Type": "application/json", Accept: "application/json, text/plain, */*", "Accept-Language": "ru,en;q=0.8" };
  }
  /** Step 1: send the rider phone → kas texts a 4-digit OTP. */
  async clientLogin(phone: string): Promise<RawResponse> {
    return this.enqueue(() => rawRequest(this.url("api/clientAppV1/login/"), {
      method: "POST", headers: this.clientHeaders(),
      body: JSON.stringify({ appVersion: "4.8", language: "uz", phoneNumber: kasPhone(phone) }),
    }));
  }
  /** Step 2: confirm the OTP → response carries clientDto.secretKey (the long-lived session key). */
  async clientConfirmSms(phone: string, smsCode: string): Promise<RawResponse> {
    return this.enqueue(() => rawRequest(this.url("api/clientAppV1/confirmSms/"), {
      method: "POST", headers: this.clientHeaders(),
      body: JSON.stringify({ language: "uz", phoneNumber: kasPhone(phone), smsCode }),
    }));
  }
  /** Step 3: create a «new» order at the EXACT pin (server snaps a nearby name). Needs the secretKey. */
  async clientCreateBooking(p: { secretKey: string; phone: string; lat: number; lng: number; carModel: string; additionalPayment?: number }): Promise<RawResponse> {
    return this.enqueue(() => rawRequest(this.url("api/clientAppV1/createBooking/"), {
      method: "POST", headers: this.clientHeaders(),
      body: JSON.stringify({ language: "uz", phoneNumber: kasPhone(p.phone), secretKey: p.secretKey, addressLatitude: p.lat, addressLongitude: p.lng, additionalPayment: p.additionalPayment ?? 0, carModel: p.carModel }),
    }));
  }
  /** Validate a secretKey WITHOUT creating a booking (operator can read the key off the client record;
   * checkClient confirms it's live). Returns 200 + client bootstrap when the key is valid. */
  async clientCheckClient(phone: string, secretKey: string): Promise<RawResponse> {
    return this.enqueue(() => rawRequest(this.url("api/clientAppV1/checkClient/"), {
      method: "POST", headers: this.clientHeaders(),
      body: JSON.stringify({ appVersion: "4.8", language: "uz", phoneNumber: kasPhone(phone), secretKey }),
    }));
  }
  /** Read a client's kas secretKey + pending loginSmsCode straight off the operator clients API (the
   * bot IS the operator, both are stored on the client record — so NO rider-entered OTP is needed). */
  async readClientAuth(phone: string): Promise<{ secretKey: string | null; loginSmsCode: string | null }> {
    const last9 = phone.replace(/\D/g, "").slice(-9);
    try {
      const r = await this.getText(`api/clients/byFilter?searchText=${encodeURIComponent(last9)}&sort=id&page=0&size=5`);
      const data = JSON.parse(r.body) as Record<string, unknown>;
      const list = (data.clientDtoList as Record<string, unknown>[]) ?? (data.content as Record<string, unknown>[]) ?? [];
      const c = list.find((x) => String(x.phoneNumber ?? "").replace(/\D/g, "").slice(-9) === last9) ?? list[0];
      return {
        secretKey: c?.secretKey ? String(c.secretKey) : null,
        loginSmsCode: c?.loginSmsCode ? String(c.loginSmsCode) : null,
      };
    } catch {
      return { secretKey: null, loginSmsCode: null };
    }
  }

  // in-process cache: a client's secretKey is stable, so we resolve it once per hour, not per booking
  private clientKeyCache = new Map<string, { key: string; at: number }>();
  /** Resolve a usable kas client secretKey FULLY AUTOMATICALLY (no rider OTP): read it off the client
   * record; if absent, trigger login (kas writes a loginSmsCode the operator can read) and confirm it
   * for them. Returns null only if the phone isn't a kas client at all. */
  async clientSecretFor(phone: string): Promise<string | null> {
    const last9 = phone.replace(/\D/g, "").slice(-9);
    const hit = this.clientKeyCache.get(last9);
    if (hit && Date.now() - hit.at < 3_600_000) return hit.key;
    // HOT PATH (runs per booking): ONE read off the operator clients API. We deliberately DON'T do the
    // login+confirmSms auto-provision here — that's 3 extra kas calls + latency per booking and was
    // contributing to kas 429s and >10s booking handlers (webhook timeouts). A client who has never
    // used the kas app (no secretKey on record) simply falls through to the throughWeb path (still
    // exact-pin, just «hamma uchun»). clientLogin/clientConfirmSms remain for a future background warm.
    const { secretKey } = await this.readClientAuth(phone);
    if (secretKey) this.clientKeyCache.set(last9, { key: secretKey, at: Date.now() });
    return secretKey || null;
  }

  /** Cancel a client order (used to clean up a test booking so no real taxi is dispatched). */
  async clientCancelBooking(phone: string, secretKey: string): Promise<RawResponse> {
    return rawRequest(this.url("api/clientAppV1/cancelBooking/"), {
      method: "POST", headers: this.clientHeaders(),
      body: JSON.stringify({ language: "uz", phoneNumber: kasPhone(phone), secretKey }),
    });
  }

  async getBookingAddons(): Promise<KasAddon[]> {
    return this.cached("addons", 600_000, async () => {
      const data = await this.getJson("api/bookings/additionalParameters");
      const list = (data.bookingAdditionalRequirementDtoList as Record<string, unknown>[]) ?? [];
      return list.map((a) => ({ id: num(a.id), name: String(a.name ?? ""), price: num(a.price) }));
    });
  }

  async cancelBooking(bookingId: number): Promise<BookingResult> {
    if (!this.loggedIn) await this.login();
    const doReq = () =>
      rawRequest(this.url(`api/bookings/${bookingId}`), {
        method: "DELETE",
        headers: { ...this.baseHeaders(), Accept: "application/json, text/plain, */*" },
      });
    let res = await doReq();
    if (res.status >= 300 && res.status < 400 && /\/login/.test((res.headers.location as string) ?? "")) {
      this.loggedIn = false;
      await this.login();
      res = await doReq();
    }
    const ok = res.status >= 200 && res.status < 300;
    if (ok) this.bustActiveCache(); // cancelled ride must drop from the guard's view immediately
    return { ok, message: res.body.slice(0, 200) };
  }

  async getDriverPins(): Promise<DriverPin[]> {
    // one light page of drivers; only those broadcasting live coordinates
    try {
      const data = await this.getJson(`api/drivers/byFilter?searchText=&sort=id&page=0&size=50&date=01.01.2015`);
      const list = (data as { driverDtoList?: Record<string, unknown>[] })?.driverDtoList ?? [];
      return list
        .map((d) => ({
          lat: Number(d.latitude ?? 0),
          lng: Number(d.longitude ?? 0),
          bearing: Number(d.bearing ?? 0),
          busy: Number(d.taximeterPayment ?? 0) > 0,
        }))
        .filter((pin) => pin.lat !== 0 && pin.lng !== 0)
        .slice(0, 30);
    } catch {
      return [];
    }
  }

  async getDriverByCar(carNumber: string): Promise<BookingDriver | null> {
    if (!carNumber) return null;
    try {
      const d = await this.getJson(`api/drivers/byCarNumber/${encodeURIComponent(carNumber)}`);
      return {
        fullName: String(d.fullName ?? "Haydovchi"),
        phone: String(d.phoneNumber ?? ""),
        carModel: String(d.carModel ?? ""),
        carNumber,
        rating: num(d.bookingRating) || num(d.companyRating),
        lat: num(d.latitude),
        lng: num(d.longitude),
        bearing: num(d.bearing),
        meterPayment: num(d.taximeterPayment),
        meterDistance: num(d.taximeterDistance),
      };
    } catch {
      return null;
    }
  }

  // ─── shared active-booking list (perf audit P1-1/P1-2) ─────────────────────────
  // The FULL active list (api/bookings) was fetched redundantly: the sweep's listActiveBookings,
  // every rider's /booking/active 5s poll, and each Mini App open — all the SAME data, each a
  // queued kas read competing on the 1.66 req/s lane. One short-TTL cache collapses them: within
  // KAS_ACTIVE_TTL_MS (default 2.5s, well under the 5s sweep/poll cadence) they share ONE read.
  private activeRaw: { at: number; list: Record<string, unknown>[] } | null = null;
  private static readonly ACTIVE_TTL_MS = Math.max(0, Number(process.env.KAS_ACTIVE_TTL_MS) || 2500);
  /** Bust the cache right after WE mutate the active list (create/cancel) so the guard sees it. */
  bustActiveCache(): void {
    this.activeRaw = null;
  }
  /** Hardened fetch of the raw active-booking array (dead-session re-login retry preserved),
   *  memoized for ACTIVE_TTL_MS. THROWS on a persistent non-array so the sweep's catch skips the
   *  tick and preserves ride state (never returns [] on a dead session). */
  private async fetchActiveBookingsRaw(): Promise<Record<string, unknown>[]> {
    const c = this.activeRaw;
    if (c && Date.now() - c.at < KasLiveSource.ACTIVE_TTL_MS) return c.list;
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await this.getText("api/bookings");
      let j: unknown = null;
      try {
        j = JSON.parse(res.body);
      } catch {
        /* non-JSON (login page) → handled below */
      }
      if (Array.isArray(j)) {
        const list = j as Record<string, unknown>[];
        this.activeRaw = { at: Date.now(), list };
        return list;
      }
      if (attempt === 0) {
        this.loggedIn = false; // dead session → drop it; getText re-logins fresh on retry
        continue;
      }
      throw new Error(`kas1067 api/bookings: no booking array after re-login (status ${res.status})`);
    }
    throw new Error("kas1067 api/bookings failed");
  }

  async getActiveBooking(phone: string): Promise<ActiveBooking | null> {
    const norm = phone.replace(/\D/g, "").slice(-9);
    if (!norm) return null;
    let list: Record<string, unknown>[] = [];
    try {
      list = await this.fetchActiveBookingsRaw();
    } catch {
      return null; // per-rider view degrades to "no active" on a dead session (the sweep still throws+skips)
    }
    const b = list.find((x) => String(x.phoneNumber ?? "").replace(/\D/g, "").slice(-9) === norm);
    if (!b) return null;

    let driver: BookingDriver | null = null;
    const carNumber = String(b.carNumber ?? "");
    if (carNumber) {
      try {
        const d = await this.getJson(`api/drivers/byCarNumber/${encodeURIComponent(carNumber)}`);
        driver = {
          fullName: String(d.fullName ?? "Haydovchi"),
          phone: String(d.phoneNumber ?? ""),
          carModel: String(d.carModel ?? ""),
          carNumber,
          rating: num(d.bookingRating) || num(d.companyRating),
          lat: num(d.latitude),
          lng: num(d.longitude),
          bearing: num(d.bearing),
          meterPayment: num(d.taximeterPayment),
          meterDistance: num(d.taximeterDistance),
        };
      } catch {
        /* driver lookup is best-effort */
      }
    }
    return {
      id: Number(b.id ?? 0),
      status: normBookingStatus(String(b.status ?? "")),
      addressName: String(b.addressName ?? ""),
      lat: num(b.addressLatitude) || undefined,
      lng: num(b.addressLongitude) || undefined,
      clientBonus: num(b.clientBonus),
      priceTier: String(b.bookingPrice ?? ""),
      createdDate: String(b.createdDate ?? ""),
      driver,
      notifiedCount: Array.isArray(b.carNumberList) ? b.carNumberList.length : 0,
      additionalPaymentAddress: num(b.additionalPaymentAddress) || undefined,
      additionalPaymentClient: num(b.additionalPaymentClient) || undefined,
      additionalPaymentCompany: num(b.additionalPaymentCompany) || undefined,
    };
  }

  async listActiveBookings(): Promise<ActiveBookingLite[]> {
    // Shares the ACTIVE_TTL_MS-cached raw list with getActiveBooking + the frontend poll (perf
    // audit P1-1). The dead-session re-login retry now lives in fetchActiveBookingsRaw, which THROWS
    // on a persistent non-array so the sweep's catch SKIPS the tick and preserves ride state (never
    // reads "no active rides" off a login page → the old mass-false-finish / "xarita yo'qoldi" bug).
    const list = await this.fetchActiveBookingsRaw();
    return list.map((b) => ({
      id: Number(b.id ?? 0),
      phoneNorm: String(b.phoneNumber ?? "").replace(/\D/g, "").slice(-9),
      status: normBookingStatus(String(b.status ?? "")),
      carNumber: String(b.carNumber ?? ""),
      addressName: String(b.addressName ?? ""),
      clientBonus: num(b.clientBonus),
      lat: num(b.addressLatitude) || undefined,
      lng: num(b.addressLongitude) || undefined,
      additionalPaymentAddress: num(b.additionalPaymentAddress) || undefined,
      additionalPaymentClient: num(b.additionalPaymentClient) || undefined,
      additionalPaymentCompany: num(b.additionalPaymentCompany) || undefined,
    }));
  }

  async getReportsPage(page: number, size: number): Promise<RideHistoryItem[]> {
    // THROWS on a kas error (e.g. 429) instead of swallowing to [] — recentReports'
    // retry wrapper must tell a rate-limited page (transient → retry) apart from a
    // genuinely-empty page (real end of data → stop). Conflating them truncated the
    // 2-week window to a today-heavy slice.
    const d = await this.getJson(`api/bookingReports?searchText=&sort=id&page=${page}&size=${size}`);
    const list = (d.bookingReportDtoList as Record<string, unknown>[]) ?? [];
    return list.map((b) => ({
      id: Number(b.id ?? 0),
      addressName: String(b.addressName ?? ""),
      status: String(b.status ?? ""),
      carNumber: String(b.carNumber ?? ""),
      carModel: String(b.carModel ?? ""),
      payment: num(b.payment),
      cashback: num(b.clientBonus),
      distance: num(b.distance) || undefined, // metres (kas) — UI divides by 1000 for km
      time: num(b.time) || undefined,
      at: String(b.date ?? ""),
      additionalPaymentAddress: num(b.additionalPaymentAddress) || undefined,
      additionalPaymentClient: num(b.additionalPaymentClient) || undefined,
      additionalPaymentCompany: num(b.additionalPaymentCompany) || undefined,
    }));
  }

  /** Rides DRIVEN by a car. bookingReports is indexed by the CLIENT phone, so a driver's own
   *  rides aren't reachable by phone — search by the plate and keep only this car's rows. */
  async getRidesByCar(carNumber: string, size = 15): Promise<RideHistoryItem[]> {
    try {
      const car = carNumber.replace(/\s/g, "").toUpperCase();
      if (car.length < 4) return [];
      const d = await this.getJson(`api/bookingReports?searchText=${encodeURIComponent(car)}&sort=id&page=0&size=${size}`);
      const list = (d.bookingReportDtoList as Record<string, unknown>[]) ?? [];
      return list
        .map((b) => ({
          id: Number(b.id ?? 0),
          addressName: String(b.addressName ?? ""),
          status: String(b.status ?? ""),
          carNumber: String(b.carNumber ?? ""),
          carModel: String(b.carModel ?? ""),
          payment: num(b.payment),
          cashback: num(b.clientBonus),
          distance: num(b.distance) || undefined, // metres (kas) — UI divides by 1000 for km
          time: num(b.time) || undefined,
          at: String(b.date ?? ""),
          additionalPaymentAddress: num(b.additionalPaymentAddress) || undefined,
          additionalPaymentClient: num(b.additionalPaymentClient) || undefined,
          additionalPaymentCompany: num(b.additionalPaymentCompany) || undefined,
        }))
        .filter((r) => r.carNumber.replace(/\s/g, "").toUpperCase() === car); // only THIS car's rides
    } catch {
      return [];
    }
  }

  /** Ride history (bookingReports — needs the full param set or kas 405s). */
  async getRideHistory(phone: string, size = 10, page = 0): Promise<RideHistoryItem[]> {
    try {
      const last9 = phone.replace(/\D/g, "").slice(-9); // searchText matches like byFilter (9-digit)
      const d = await this.getJson(`api/bookingReports?searchText=${encodeURIComponent(last9 || phone)}&sort=id&page=${page}&size=${size}`);
      const list = (d.bookingReportDtoList as Record<string, unknown>[]) ?? [];
      return list.map((b) => ({
        id: Number(b.id ?? 0),
        addressName: String(b.addressName ?? ""),
        status: String(b.status ?? ""),
        carNumber: String(b.carNumber ?? ""),
        carModel: String(b.carModel ?? ""),
        payment: num(b.payment),
        cashback: num(b.clientBonus),
        distance: num(b.distance),
        time: num(b.time),
        at: String(b.date ?? ""),
        additionalPaymentAddress: num(b.additionalPaymentAddress) || undefined,
        additionalPaymentClient: num(b.additionalPaymentClient) || undefined,
        additionalPaymentCompany: num(b.additionalPaymentCompany) || undefined,
      }));
    } catch {
      return [];
    }
  }

  // ─── client reference data (cached ~10 min — these change rarely) ─────────────
  private cache = new Map<string, { at: number; val: unknown }>();
  private async cached<T>(key: string, ttlMs: number, fetcher: () => Promise<T>): Promise<T> {
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < ttlMs) return hit.val as T;
    const val = await fetcher();
    this.cache.set(key, { at: Date.now(), val });
    return val;
  }

  async getTariff(): Promise<ClientTariff> {
    return this.cached("tariff", 600_000, async () => {
      const t = await this.getJson("api/clientTariffs");
      return {
        minimalDistance: num(t.minimalDistance),
        minimalPayment: num(t.minimalPayment),
        firstKilometerPaymentInCity: num(t.firstKilometerPaymentInCity),
        secondKilometerPaymentInCity: num(t.secondKilometerPaymentInCity),
        distancePaymentInCity: num(t.distancePaymentInCity),
        firstKilometerPaymentInRegion: num(t.firstKilometerPaymentInRegion),
        secondKilometerPaymentInRegion: num(t.secondKilometerPaymentInRegion),
        distancePaymentInRegion: num(t.distancePaymentInRegion),
        timePayment: num(t.timePayment),
      };
    });
  }

  async getBonusRules(): Promise<BonusRules> {
    return this.cached("bonusRules", 600_000, async () => {
      const b = await this.getJson("api/bonusProperties");
      return {
        enabled: b.enabled !== false,
        clientBonusCall: num(b.clientBonusCall),
        clientBonusApp: num(b.clientBonusApp),
        clientBonusCallFirstTime: num(b.clientBonusCallFirstTime),
        clientBonusAppFirstTime: num(b.clientBonusAppFirstTime),
        clientBonusMinimalDistance: num(b.clientBonusMinimalDistance),
      };
    });
  }

  async getCarModels(): Promise<CarModel[]> {
    return this.cached("carModels", 600_000, async () => {
      const res = await this.getText("api/carModels");
      const arr = JSON.parse(res.body) as Record<string, unknown>[];
      return (Array.isArray(arr) ? arr : []).map((c) => ({
        id: num(c.id),
        name: String(c.name ?? ""),
        category: String(c.category ?? ""),
        rating: num(c.rating),
      }));
    });
  }

  async getCompanyInfo(): Promise<CompanyInfo> {
    return this.cached("company", 600_000, async () => {
      const c = await this.getJson("api/companyInformation");
      const phones = [c.dispatcherPhoneNumber1, c.dispatcherPhoneNumber2, c.dispatcherPhoneNumber3, c.dispatcherPhoneNumber4, c.dispatcherPhoneNumber5]
        .map((p) => String(p ?? "").trim())
        .filter(Boolean);
      return { companyName: String(c.companyName ?? "1067 Taxi"), dispatcherPhones: phones, lat: num(c.latitude), lng: num(c.longitude) };
    });
  }

  async getServiceArea(): Promise<GeoPoint[]> {
    return this.cached("cityBorders", 600_000, async () => {
      const res = await this.getText("api/cityBorders");
      const arr = JSON.parse(res.body) as Record<string, unknown>[];
      return (Array.isArray(arr) ? arr : []).map((p) => ({ lat: num(p.latitude), lng: num(p.longitude) }));
    });
  }

  async getMainReport(): Promise<KasMainReport> {
    return this.cached("mainReport", 600_000, async () => {
      const d = await this.getJson("api/mainReports");
      const list = (d.bookingCountReportDtoList as Record<string, unknown>[]) ?? [];
      const latest = list[0] ?? {};
      const bookings = num(latest.callBookingCount) + num(latest.telegramBookingCount) + num(latest.clientAppBookingCount);
      const canceled = num(latest.canceledBookingsByCompanyCount) + num(latest.canceledBookingsByDriverCount);
      return {
        bookingsYesterday: bookings,
        completedYesterday: Math.max(0, bookings - canceled),
        onlineDrivers: num(d.onlineDriversCount),
        activeDrivers: num(d.activeDriversCount),
        serviceCost: num(d.serviceCost),
      };
    });
  }

  /** Log in, pull the SPA shell + its JS bundles, and harvest candidate API paths. */
  async discover(): Promise<{ scripts: string[]; endpoints: string[]; assets: { url: string; body: string }[] }> {
    await this.login();
    const shell = await this.getText("", "text/html,*/*");
    const scripts = [...shell.body.matchAll(/<script[^>]+src="([^"]+)"/gi)].map((m) => m[1]!);
    const endpoints = new Set<string>();
    const assets: { url: string; body: string }[] = [];

    harvestEndpoints(shell.body, endpoints);
    for (const src of scripts) {
      try {
        const res = await this.getText(src, "*/*");
        assets.push({ url: src, body: res.body });
        harvestEndpoints(res.body, endpoints);
      } catch {
        /* skip unreachable asset */
      }
    }
    return { scripts, endpoints: [...endpoints].sort(), assets };
  }
}

// ─── helpers ──────────────────────────────────────────────────────────────────
function harvestEndpoints(text: string, out: Set<string>): void {
  const asset = /\.(js|css|html|htm|png|jpe?g|gif|svg|woff2?|ttf|eot|map|apk|ico)$/i;
  const add = (v?: string) => {
    if (v && !asset.test(v) && v.length > 1) out.add(v);
  };
  for (const m of text.matchAll(/\$(?:http|resource)\s*\(\s*["'`]([^"'`]+)["'`]/g)) add(m[1]);
  for (const m of text.matchAll(/\.(?:get|post|put|delete)\s*\(\s*["'`]([^"'`]+)["'`]/g)) add(m[1]);
  for (const m of text.matchAll(/\burl\s*[:=]\s*["'`]([^"'`]+)["'`]/g)) add(m[1]);
  for (const m of text.matchAll(
    /["'`](\/?[A-Za-z0-9_\-./{}$]*(?:api|rest|bonus|driver|client|user|list|report|balance|order)[A-Za-z0-9_\-./{}$]*)["'`]/gi,
  )) {
    add(m[1]);
  }
}

function mapAddresses(raw: unknown): SavedAddress[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: SavedAddress[] = [];
  for (const a of raw) {
    const o = a as Record<string, unknown>;
    const name = String(o.name ?? o.value ?? o.addressName ?? o.address ?? "").trim();
    if (!name) continue;
    const id = Number(o.id ?? 0);
    const key = `${id}:${name}`; // kas returns duplicates — dedupe
    if (seen.has(key)) continue;
    seen.add(key);
    const lat = num(o.latitude ?? o.addressLatitude);
    const lng = num(o.longitude ?? o.addressLongitude);
    out.push({
      id,
      name,
      lat: lat || undefined,
      lng: lng || undefined,
      surcharge: num(o.additionalPayment) || undefined,
    });
  }
  return out;
}

function num(v: unknown): number {
  const n = typeof v === "string" ? parseFloat(v.replace(/\s/g, "").replace(",", ".")) : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** kas1067 phone STANDARD: "+998" + the local 9 digits. kas's checkClient/booking endpoints
 *  return empty/error for any other shape (no "+", bare 9 digits, etc.) — proven against the
 *  live API. Telegram contacts + self-register store mixed formats, so normalize here. */
export function kasPhone(phone: string): string {
  const last9 = phone.replace(/\D/g, "").slice(-9);
  return last9.length === 9 ? `+998${last9}` : phone;
}

function cleanName(name: unknown, id: unknown, prefix: string): string {
  const n = String(name ?? "").trim();
  if (n && n !== "-") return n;
  return `${prefix} ${String(id)}`; // never expose the phone as a display name
}

function mapClient(c: Record<string, unknown>): KasMember {
  return {
    type: "client",
    kasId: String(c.id),
    fullName: cleanName(c.fullName, c.id, "Mijoz"),
    phone: (c.phoneNumber as string) || undefined,
    points: num(c.bonus),
    trips: Math.round(num(c.bookingCount)),
    rating: 0,
  };
}

function mapDriver(d: Record<string, unknown>): KasMember {
  return {
    type: "driver",
    kasId: String(d.id),
    fullName: cleanName(d.fullName, d.id, "Haydovchi"),
    phone: (d.phoneNumber as string) || undefined,
    carNumber: (d.carNumber as string) || undefined,
    points: num(d.balance),
    trips: Math.round(num(d.takeBookingCount)),
    rating: num(d.bookingRating),
  };
}

/** kas dates come as "2026-07-01T19:00:00.000+0000" strings (or null). Normalize to a plain ISO
 *  string the DB/Date() accepts, or null when absent/unparseable. */
function isoDate(v: unknown): string | null {
  if (!v) return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function mapRosterRow(d: Record<string, unknown>): DriverRosterRow {
  return {
    kasId: Math.round(num(d.id)),
    fullName: cleanName(d.fullName, d.id, "Haydovchi"),
    phone: (d.phoneNumber as string) || null,
    carNumber: (d.carNumber as string) || null,
    carModel: (d.carModel as string) || null,
    address: (d.address as string) || null,
    balance: num(d.balance),
    debt: num(d.debt),
    trips: Math.round(num(d.takeBookingCount)),
    cancels: Math.round(num(d.cancelBookingCount)),
    rating: num(d.bookingRating) || num(d.companyRating),
    active: d.active !== false,
    lastRideAt: isoDate(d.lastTakeBookingDate),
    licenseTerm: isoDate(d.licenseTerm),
  };
}
