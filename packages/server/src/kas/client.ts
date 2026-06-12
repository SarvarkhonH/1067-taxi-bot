import http from "node:http";
import https from "node:https";
import { env } from "../env";
import type {
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

  constructor(private opts: KasClientOptions) {
    this.pageSize = opts.pageSize ?? 200;
    this.maxPages = opts.maxPages ?? 50;
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
    // kas1067 rate-limits login (429); back off and retry a few times.
    for (let attempt = 0; ; attempt++) {
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
        throw new Error(
          `kas1067 login failed (status ${res.status}, redirect "${loc}"). Check KAS_USERNAME / KAS_PASSWORD.`,
        );
      }
      this.loggedIn = true;
      return;
    }
  }

  async getText(path: string, accept = "application/json, text/plain, */*"): Promise<RawResponse> {
    if (!this.loggedIn) await this.login();
    let res = await rawRequest(this.url(path), { headers: { ...this.baseHeaders(), Accept: accept } });
    if (res.status >= 300 && res.status < 400 && /\/login/.test((res.headers.location as string) ?? "")) {
      this.loggedIn = false;
      await this.login();
      res = await rawRequest(this.url(path), { headers: { ...this.baseHeaders(), Accept: accept } });
    }
    return res;
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
  async fetchByPhone(phone: string): Promise<KasMember[]> {
    const norm = phone.replace(/\D/g, "").slice(-9);
    if (!norm) return [];
    const q = encodeURIComponent(norm);
    const out: KasMember[] = [];
    const exact = (m: KasMember) => m.phone && m.phone.replace(/\D/g, "").slice(-9) === norm;

    try {
      const data = await this.getJson(`api/clients/byFilter?searchText=${q}&sort=bonus&page=0&size=20`);
      for (const c of (data.clientDtoList as Record<string, unknown>[]) ?? []) {
        const m = mapClient(c);
        if (exact(m)) out.push(m);
      }
    } catch (e) {
      console.error("[kas] client lookup failed:", e instanceof Error ? e.message : e);
    }
    try {
      const data = await this.getJson(`api/drivers/byFilter?searchText=${q}&sort=id&page=0&size=20&date=01.01.2015`);
      for (const d of (data.driverDtoList as Record<string, unknown>[]) ?? []) {
        const m = mapDriver(d);
        if (exact(m)) out.push(m);
      }
    } catch (e) {
      console.error("[kas] driver lookup failed:", e instanceof Error ? e.message : e);
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

  private async postJson(path: string, body: unknown): Promise<RawResponse> {
    if (!this.loggedIn) await this.login();
    // Match the SPA: strings go raw, objects as JSON (both with application/json).
    const payload = typeof body === "string" ? body : JSON.stringify(body);
    const doReq = () =>
      rawRequest(this.url(path), {
        method: "POST",
        headers: { ...this.baseHeaders(), "Content-Type": "application/json", Accept: "application/json, text/plain, */*" },
        body: payload,
      });
    let res = await doReq();
    if (res.status >= 300 && res.status < 400 && /\/login/.test((res.headers.location as string) ?? "")) {
      this.loggedIn = false;
      await this.login();
      res = await doReq();
    }
    return res;
  }

  private async putJson(path: string, body: unknown): Promise<RawResponse> {
    if (!this.loggedIn) await this.login();
    const doReq = () =>
      rawRequest(this.url(path), {
        method: "PUT",
        headers: { ...this.baseHeaders(), "Content-Type": "application/json", Accept: "application/json, text/plain, */*" },
        body: JSON.stringify(body),
      });
    let res = await doReq();
    if (res.status >= 300 && res.status < 400 && /\/login/.test((res.headers.location as string) ?? "")) {
      this.loggedIn = false;
      await this.login();
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

  /** Add a delta to a client's cashback bonus (read current + set new total). */
  async addClientBonus(phone: string, delta: number): Promise<{ ok: boolean; oldBonus: number; newBonus: number; status?: number }> {
    const cur = (await this.fetchByPhone(phone)).find((m) => m.type === "client")?.points ?? null;
    if (cur === null) return { ok: false, oldBonus: 0, newBonus: 0 };
    const res = await this.setClientBonus(phone, cur + delta);
    return { ok: res.ok, oldBonus: cur, newBonus: cur + delta, status: res.status };
  }

  // ─── booking ────────────────────────────────────────────────────────────────
  async checkClient(phone: string): Promise<ClientBookingInfo | null> {
    const clean = phone.replace(/\s/g, "");
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

  async createBooking(req: BookingRequest): Promise<BookingResult> {
    const res = await this.postJson("api/bookings/throughWeb", req);
    return { ok: res.status >= 200 && res.status < 300, message: res.body.slice(0, 200) };
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
    return { ok: res.status >= 200 && res.status < 300, message: res.body.slice(0, 200) };
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
      };
    } catch {
      return null;
    }
  }

  async getActiveBooking(phone: string): Promise<ActiveBooking | null> {
    const norm = phone.replace(/\D/g, "").slice(-9);
    if (!norm) return null;
    let list: Record<string, unknown>[] = [];
    try {
      const j = JSON.parse((await this.getText("api/bookings")).body);
      if (Array.isArray(j)) list = j;
    } catch {
      return null;
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
        };
      } catch {
        /* driver lookup is best-effort */
      }
    }
    return {
      id: Number(b.id ?? 0),
      status: String(b.status ?? ""),
      addressName: String(b.addressName ?? ""),
      lat: num(b.addressLatitude) || undefined,
      lng: num(b.addressLongitude) || undefined,
      clientBonus: num(b.clientBonus),
      priceTier: String(b.bookingPrice ?? ""),
      createdDate: String(b.createdDate ?? ""),
      driver,
    };
  }

  async listActiveBookings(): Promise<ActiveBookingLite[]> {
    let list: Record<string, unknown>[] = [];
    try {
      const j = JSON.parse((await this.getText("api/bookings")).body);
      if (Array.isArray(j)) list = j;
    } catch {
      return [];
    }
    return list.map((b) => ({
      id: Number(b.id ?? 0),
      phoneNorm: String(b.phoneNumber ?? "").replace(/\D/g, "").slice(-9),
      status: String(b.status ?? ""),
      carNumber: String(b.carNumber ?? ""),
      addressName: String(b.addressName ?? ""),
      clientBonus: num(b.clientBonus),
      lat: num(b.addressLatitude) || undefined,
      lng: num(b.addressLongitude) || undefined,
    }));
  }

  /** Ride history (bookingReports — needs the full param set or kas 405s). */
  async getRideHistory(phone: string, size = 10): Promise<RideHistoryItem[]> {
    try {
      const d = await this.getJson(`api/bookingReports?searchText=${encodeURIComponent(phone)}&sort=id&page=0&size=${size}`);
      const list = (d.bookingReportDtoList as Record<string, unknown>[]) ?? [];
      return list.map((b) => ({
        id: Number(b.id ?? 0),
        addressName: String(b.addressName ?? ""),
        status: String(b.status ?? ""),
        carNumber: String(b.carNumber ?? ""),
        carModel: String(b.carModel ?? ""),
        payment: num(b.payment),
        cashback: num(b.clientBonus),
        at: String(b.date ?? ""),
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
