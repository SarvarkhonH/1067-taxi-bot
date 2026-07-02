// READ-ONLY kas1067 API catalog probe. Logs in ONCE, discovers the full endpoint
// surface from the SPA bundles, hits every READ endpoint and records its real
// response shape (PII redacted), and records WRITE endpoints from code WITHOUT
// firing them. Dumps kas_api_catalog.json (repo root) for the PDF doc build.
// Gentle on the throttle: one login, sequential, 500ms between calls.
// Run: dotenv -e ../../.env -- tsx src/scripts/kasApiCatalog.ts
import "../env";
import { env } from "../env";
import { KasLiveSource } from "../kas/client";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const kas = new KasLiveSource({ baseUrl: env.KAS_BASE_URL, username: env.KAS_USERNAME, password: env.KAS_PASSWORD });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ─── PII-safe shape extractor ────────────────────────────────────────────────
function redact(key: string, v: unknown): unknown {
  if (v == null) return v;
  if (typeof v === "string") {
    if (/phone|tel|login/i.test(key)) return v.replace(/\d/g, "X");
    if (/(full)?name|password|comment|address/i.test(key) && v.length > 0) return "‹redacted›";
  }
  return v;
}
function tn(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v;
}
function shapeOf(v: unknown, depth = 0): unknown {
  if (Array.isArray(v)) return { type: "array", length: v.length, element: v.length ? shapeOf(v[0], depth + 1) : null };
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (Array.isArray(val)) out[k] = { type: "array", length: val.length, example: val.length ? redact(k, val[0]) : null };
      else if (val && typeof val === "object" && depth < 1) out[k] = { type: "object", fields: shapeOf(val, depth + 1) };
      else out[k] = { type: tn(val), example: redact(k, val) };
    }
    return out;
  }
  return { type: tn(v), example: v };
}

interface Probe { group: string; name: string; method: string; path: string; note: string }

async function probeRead(p: Probe): Promise<Record<string, unknown>> {
  try {
    const res = await kas.getText(p.path);
    let parsed: unknown;
    let json = false;
    try { parsed = JSON.parse(res.body); json = true; } catch { /* non-json */ }
    return {
      ...p, kind: "read", status: res.status,
      contentType: String(res.headers["content-type"] ?? ""),
      shape: json ? shapeOf(parsed) : null,
      sampleRaw: json ? undefined : res.body.slice(0, 200),
    };
  } catch (e) {
    return { ...p, kind: "read", error: e instanceof Error ? e.message : String(e) };
  } finally {
    await sleep(500);
  }
}

async function main(): Promise<void> {
  const out: Record<string, unknown> = { generatedNote: "READ-ONLY probe; writes documented not executed", baseUrl: env.KAS_BASE_URL };

  console.error("login…");
  await kas.login();

  // 1) full surface discovery from the SPA + JS bundles
  console.error("discover…");
  const disc = await kas.discover();
  out.discovery = { scriptCount: disc.scripts.length, scripts: disc.scripts, endpointCount: disc.endpoints.length, endpoints: disc.endpoints };

  // 2) seed values for path-param endpoints (grab a real car from the live list, redact later)
  let sampleCar = "";
  try {
    const drv = await kas.getJson("api/drivers/byFilter?searchText=&sort=id&page=0&size=20&date=01.01.2015");
    const list = (drv.driverDtoList as Record<string, unknown>[]) ?? [];
    sampleCar = String(list.find((d) => String(d.carNumber ?? "").length >= 4)?.carNumber ?? list[0]?.carNumber ?? "");
  } catch { /* best effort */ }
  await sleep(500);

  // 3) READ endpoints — real responses
  const reads: Probe[] = [
    { group: "Reference", name: "Company info", method: "GET", path: "api/companyInformation", note: "Dispatcher phones, company geo. Cached 10m in bot." },
    { group: "Reference", name: "Client tariff", method: "GET", path: "api/clientTariffs", note: "Per-km / per-min rates for honest fare estimate." },
    { group: "Reference", name: "Bonus properties", method: "GET", path: "api/bonusProperties", note: "Cashback rules (call vs app, first-time, min distance)." },
    { group: "Reference", name: "Car models", method: "GET", path: "api/carModels", note: "Vehicle catalog + category + rating." },
    { group: "Reference", name: "City borders", method: "GET", path: "api/cityBorders", note: "Service-area polygon (lat/lng points)." },
    { group: "Reference", name: "Booking add-ons", method: "GET", path: "api/bookings/additionalParameters", note: "Extra booking requirements + price." },
    { group: "Reports", name: "Main report", method: "GET", path: "api/mainReports", note: "Online/active drivers, yesterday booking counts." },
    { group: "Members", name: "Clients (byFilter)", method: "GET", path: "api/clients/byFilter?searchText=&sort=bonus&page=0&size=5", note: "Paged client list. searchText = 9-digit phone to filter." },
    { group: "Members", name: "Drivers (byFilter)", method: "GET", path: "api/drivers/byFilter?searchText=&sort=id&page=0&size=5&date=01.01.2015", note: "Paged driver list; carries live lat/lng/bearing/taximeter. date param REQUIRED." },
    { group: "Bookings", name: "Live bookings queue", method: "GET", path: "api/bookings", note: "All active bookings (array). The sweep's listActiveBookings." },
    { group: "Reports", name: "Booking reports", method: "GET", path: "api/bookingReports?searchText=&sort=id&page=0&size=5", note: "Completed-ride history. searchText = phone OR car plate." },
    { group: "Bookings", name: "Check client phone", method: "GET", path: "api/bookings/checkClientPhoneNumber/%2B998900000000", note: "Lookup client + saved addresses + active booking by phone (probed with a non-existent number → empty shape)." },
  ];
  if (sampleCar) reads.push({ group: "Drivers", name: "Driver by car number", method: "GET", path: `api/drivers/byCarNumber/${encodeURIComponent(sampleCar)}`, note: "Single driver detail incl. live position + taximeter (probed with a real plate; fields redacted)." });

  const endpoints: Record<string, unknown>[] = [];
  for (const r of reads) {
    console.error("read", r.path);
    endpoints.push(await probeRead(r));
  }

  // 4) address search (POST, but read-like). Capture via the public helper + record raw request.
  try {
    console.error("read addresses/byName");
    const addrs = await kas.searchAddresses("vokzal");
    endpoints.push({
      group: "Bookings", name: "Address search", method: "POST", path: "api/addresses/byName/", kind: "read",
      note: "Body = the raw search term as a JSON string (e.g. \"vokzal\"), Content-Type application/json. Returns address DTO array.",
      status: 200, mappedSampleCount: addrs.length, mappedShape: addrs[0] ? shapeOf(addrs[0]) : null,
    });
  } catch (e) {
    endpoints.push({ group: "Bookings", name: "Address search", method: "POST", path: "api/addresses/byName/", kind: "read", error: e instanceof Error ? e.message : String(e) });
  }
  await sleep(500);

  // 5) WRITE endpoints — documented from code, NOT executed (live money/dispatch)
  const writes: Record<string, unknown>[] = [
    {
      group: "Bookings", name: "Create booking (dispatch)", method: "POST", path: "api/bookings/throughWeb", kind: "write", executed: false,
      note: "Dispatches a real taxi. Body = BookingRequest with phoneNumber normalized to +998<9>. 2xx = accepted.",
      requestBody: { phoneNumber: "+998XXXXXXXXX", addressName: "string", addressLatitude: "number", addressLongitude: "number", "…": "other BookingRequest fields" },
    },
    {
      group: "Bookings", name: "Cancel booking", method: "DELETE", path: "api/bookings/{bookingId}", kind: "write", executed: false,
      note: "Cancels an active booking by id. 2xx = cancelled.", requestBody: null,
    },
    {
      group: "Members", name: "Set client bonus", method: "PUT", path: "api/clients", kind: "write", executed: false,
      note: "Overwrites a client's cashback bonus. Body = the full client DTO with new bonus + bonusSecretKey (1303). Read current via byFilter first.",
      requestBody: { "…clientDto": "all fields from byFilter", bonus: "number (new total)", bonusSecretKey: "1303" },
    },
    {
      group: "Drivers", name: "Driver payment (balance top-up)", method: "POST", path: "api/drivers/payment", kind: "write", executed: false,
      note: "Adds to a driver's kas balance. payViaOnline carries the sum, payViaCash \"0\".",
      requestBody: { driverId: "number", carNumber: "string", payViaCash: "\"0\"", payViaOnline: "number", comment: "string", debt: false },
    },
  ];

  // 6) auth flow
  out.auth = {
    type: "Spring Security form login (no CSRF token, no cookie on GET)",
    loginPage: { method: "GET", path: "login", returns: "200 HTML sign-in form" },
    loginPost: { method: "POST", path: "login", contentType: "application/x-www-form-urlencoded", body: "username, password", success: "302 → /kas1067/ + Set-Cookie JSESSIONID", failure: "302 → /login?error" },
    sessionCookie: "JSESSIONID (Path=/kas1067, HttpOnly)",
    quirk: "Under burst, a throttle/transient can return 200+login-page instead of 302 — must be retried, not treated as bad credentials.",
    phoneNormalization: "kas endpoints want +998<last9>; other shapes return empty/error (kasPhone()).",
  };

  out.endpoints = [...endpoints, ...writes];
  const file = resolve(process.cwd(), "../../kas_api_catalog.json");
  writeFileSync(file, JSON.stringify(out, null, 2));
  console.error("WROTE", file, "endpoints:", (out.endpoints as unknown[]).length, "discovered:", disc.endpoints.length);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
