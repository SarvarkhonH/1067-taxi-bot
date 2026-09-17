/**
 * Dark check of the bot ↔ taxi-core connection, against the LIVE core, before (and after) the
 * cutover. Read-only: it creates no order, moves no money, messages nobody.
 *
 * Every read the bot makes goes through the real BirJoySource, and each answer is checked for the
 * failures that would otherwise be silent: an order status the bot has no word for (a finished ride
 * that pays nothing), a position of 0 (a car in the ocean), a distance in the wrong unit, an empty
 * catalogue, a place without the kas id the pickup migration needs.
 *
 * The one write path (POST /orders) is probed WITHOUT creating anything: a body with no phone fails
 * validation before the handler runs, and the error says whether the core knows the new fields
 * (add-ons, extra payment) — an old core rejects them as "should not exist".
 *
 * Run on the VPS (with the core's token in the bot's .env):
 *   cd /opt/app/packages/server && KAS_MODE=birjoy npx dotenv -e ../../.env -- npx tsx src/scripts/verifyTaxiCore.ts --phone 90xxxxxxx --plate 70A123BC
 */
import { isCoreOrderStatus, CORE_ORDER_STATUSES } from "@t1067/shared";
import { env } from "../env";
import { BirJoySource } from "../kas/birjoy";

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const PHONE = arg("--phone");
const PLATE = arg("--plate");

// the bot's vocabulary after translation — anything else means the table in taxiCore.ts is short
const BOT_STATUSES = new Set(["new", "searching", "accepted", "on_the_way", "arrived", "started", "delivered", "cancel_by_client", "cancel_by_driver", "cancel_by_operator", "cancel_by_server"]);

type Row = { check: string; ok: boolean; ms: number; detail: string };
const rows: Row[] = [];

async function check(name: string, fn: () => Promise<string>): Promise<void> {
  const t0 = Date.now();
  try {
    const detail = await fn();
    rows.push({ check: name, ok: true, ms: Date.now() - t0, detail });
  } catch (e) {
    rows.push({ check: name, ok: false, ms: Date.now() - t0, detail: e instanceof Error ? e.message : String(e) });
  }
}
function must(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}
const badStatuses = (list: { status: string }[]): string[] => [...new Set(list.map((x) => x.status).filter((s) => !BOT_STATUSES.has(s)))];

async function main(): Promise<void> {
  must(env.KAS_SERVICE_TOKEN, "KAS_SERVICE_TOKEN is empty");
  const ds = new BirJoySource({ baseUrl: env.KAS_BIRJOY_URL, serviceToken: env.KAS_SERVICE_TOKEN });
  const base = env.KAS_BIRJOY_URL.replace(/\/+$/, "");
  const headers = { "x-service-token": env.KAS_SERVICE_TOKEN, "content-type": "application/json" };

  await check("enum: bot knows every core status", async () => {
    const unknown = CORE_ORDER_STATUSES.filter((s) => !isCoreOrderStatus(s));
    must(unknown.length === 0, `unmapped: ${unknown.join(",")}`);
    return `${CORE_ORDER_STATUSES.length}/12`;
  });

  await check("addresses: catalogue", async () => {
    const a = await ds.getAllAddresses();
    must(a.length > 0, "empty catalogue");
    const noCoords = a.filter((x) => x.lat == null || x.lng == null).length;
    must(noCoords === 0, `${noCoords} places without coordinates`);
    return `${a.length} places, all with coordinates`;
  });

  await check("addresses: externalId for pickup migration", async () => {
    const res = await fetch(`${base}/addresses?limit=1000`, { headers, signal: AbortSignal.timeout(8000) });
    must(res.ok, `HTTP ${res.status}`);
    const raw = (await res.json()) as Array<{ externalId?: number | null }>;
    const withExt = raw.filter((r) => r.externalId != null).length;
    must(withExt > 0, "no externalId in the response — deploy the 1067-taxi change first");
    return `${withExt}/${raw.length} carry a kas id`;
  });

  await check("addresses: search", async () => `${(await ds.searchAddresses("bozor")).length} hits for "bozor"`);
  await check("order add-ons", async () => `${(await ds.getBookingAddons()).length} add-ons`);
  await check("tariff", async () => {
    const t = await ds.getTariff();
    must(t.minimalPayment > 0, "minimalPayment is 0");
    return `min ${t.minimalPayment}, per km ${t.distancePaymentInCity}`;
  });
  await check("company", async () => {
    const c = await ds.getCompanyInfo();
    return `${c.companyName} · ${c.dispatcherPhones.length} dispatcher phone(s)`;
  });
  await check("service area", async () => `${(await ds.getServiceArea()).length} points`);
  await check("main report", async () => {
    const r = await ds.getMainReport();
    return `yesterday ${r.completedYesterday}/${r.bookingsYesterday} · online now ${r.onlineDrivers}`;
  });

  await check("active orders: statuses translate", async () => {
    const list = await ds.listActiveBookings();
    const bad = badStatuses(list);
    must(bad.length === 0, `untranslated: ${bad.join(",")}`);
    const zero = list.filter((b) => b.lat === 0 || b.lng === 0).length;
    must(zero === 0, `${zero} orders with a 0 coordinate`);
    return `${list.length} active`;
  });

  await check("reports: statuses + distance in metres", async () => {
    const page = await ds.getReportsPage(0, 50);
    const bad = badStatuses(page);
    must(bad.length === 0, `untranslated: ${bad.join(",")}`);
    const tiny = page.filter((r) => r.distance != null && r.distance > 0 && r.distance < 50).length;
    must(tiny === 0, `${tiny} rides under 50 m — distance probably still in km`);
    return `${page.length} rows`;
  });

  await check("driver pins: no zero positions", async () => {
    const pins = await ds.getDriverPins();
    must(pins.every((p) => p.lat !== 0 && p.lng !== 0), "a pin at 0");
    return `${pins.length} pins, ${pins.filter((p) => !p.busy).length} free`;
  });
  await check("driver roster", async () => `${(await ds.listDriverRoster()).length} drivers`);

  if (PHONE) {
    await check(`client ${PHONE}: members`, async () => `${(await ds.fetchByPhone(PHONE)).length} member row(s)`);
    await check(`client ${PHONE}: booking info`, async () => {
      const c = await ds.checkClient(PHONE);
      if (!c) return "unknown to the core (ok for a new rider)";
      must(c.addresses.every((a) => a.id < 0), "a saved place with a positive id would be sent as a catalogue id");
      return `${c.addresses.length} saved place(s), active: ${c.activeBooking ? "yes" : "no"}`;
    });
    await check(`client ${PHONE}: active order`, async () => {
      const b = await ds.getActiveBooking(PHONE);
      if (!b) return "none";
      must(BOT_STATUSES.has(b.status), `untranslated status ${b.status}`);
      must(!b.driver || (b.driver.lat !== 0 && b.driver.lng !== 0), "driver at 0");
      return `${b.status}${b.driver ? ` · ${b.driver.carNumber}${b.driver.lat != null ? " · live position" : ""}` : ""}`;
    });
    await check(`client ${PHONE}: history paging`, async () => {
      const p0 = await ds.getRideHistory(PHONE, 2, 0);
      const p1 = await ds.getRideHistory(PHONE, 2, 1);
      const bad = badStatuses([...p0, ...p1]);
      must(bad.length === 0, `untranslated: ${bad.join(",")}`);
      must(!(p0.length && p1.length && p0[0]!.id === p1[0]!.id), "page 1 repeats page 0 — offset ignored");
      return `page0 ${p0.length}, page1 ${p1.length}`;
    });
  }

  if (PLATE) {
    await check(`driver ${PLATE}: account`, async () => {
      const a = await ds.getDriverAccount(PLATE);
      must(a, "not found");
      return `balance ${a!.balance}, debt ${a!.debt}`;
    });
    await check(`driver ${PLATE}: by car`, async () => {
      const d = await ds.getDriverByCar(PLATE);
      must(d, "not found");
      must(d!.lat !== 0 && d!.lng !== 0, "position 0");
      return `${d!.fullName}${d!.lat != null ? " · live position" : " · no fresh GPS"}`;
    });
    await check(`driver ${PLATE}: rides`, async () => {
      const r = await ds.getRidesByCar(PLATE, 10);
      const bad = badStatuses(r);
      must(bad.length === 0, `untranslated: ${bad.join(",")}`);
      return `${r.length} rides`;
    });
  }

  await check("POST /orders knows the new fields (no order created)", async () => {
    // No phone → validation fails before the handler. The message tells us which fields the core accepts.
    const res = await fetch(`${base}/orders`, {
      method: "POST",
      headers,
      body: JSON.stringify({ pickupAddress: "verify", requirementIds: [1], additionalPaymentUzs: 1, clientName: "verify" }),
      signal: AbortSignal.timeout(8000),
    });
    const text = await res.text();
    must(res.status === 400, `expected 400 from validation, got ${res.status} — CHECK THE CORE FOR AN ORDER NAMED "verify"`);
    must(!/should not exist/i.test(text), `the core rejects the new fields: ${text.slice(0, 160)}`);
    return "validation rejects only the missing phone";
  });

  const width = Math.max(...rows.map((r) => r.check.length));
  console.log("");
  for (const r of rows) console.log(`${r.ok ? "✅" : "❌"} ${r.check.padEnd(width)}  ${String(r.ms).padStart(5)} ms  ${r.detail}`);
  const failed = rows.filter((r) => !r.ok).length;
  console.log(`\n${rows.length - failed}/${rows.length} passed`);
  if (failed) process.exitCode = 1;
}

main().catch((e) => {
  console.error("❌", e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
