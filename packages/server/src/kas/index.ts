import { env } from "../env";
import { KasLiveSource } from "./client";
import { KasMockSource } from "./mock";
import { BirJoySource } from "./birjoy";
import type { KasDataSource } from "./types";

export * from "./types";
export { KasLiveSource } from "./client";
export { KasMockSource } from "./mock";
export { BirJoySource } from "./birjoy";

let cached: KasDataSource | null = null;

export function getDataSource(): KasDataSource {
  if (cached) return cached;
  if (env.KAS_MODE === "live") {
    cached = new KasLiveSource({
      baseUrl: env.KAS_BASE_URL,
      username: env.KAS_USERNAME,
      password: env.KAS_PASSWORD,
      pageSize: Number(process.env.KAS_PAGE_SIZE) || undefined,
      maxPages: Number(process.env.KAS_MAX_PAGES) || undefined,
    });
  } else if (env.KAS_MODE === "birjoy") {
    // ⚠️ BirJoySource is INCOMPLETE — 6 of 27 KasDataSource methods still
    // reject with "not implemented yet". Selecting this mode today still takes
    // down the driver map pins, the member sync and the analytics reports,
    // because each calls a stubbed method and gets a rejected promise.
    //
    // The coin ledger and the booking sweep are no longer among them: the
    // three tanga methods resolve inside A, and listActiveBookings has its B
    // endpoint (2026-09-14).
    //
    // Failing loudly at boot beats failing quietly at 2am on a real customer's
    // ride. Set KAS_BIRJOY_FORCE=1 to proceed anyway (F1-bridge testing).
    //
    // This list is checked against the code by
    // packages/shared/src/__tests__/bridgeStubs.test.ts — a refusal message
    // naming methods that now work is how people learn to ignore the refusal.
    const forced = String(process.env.KAS_BIRJOY_FORCE ?? "").trim();
    if (forced !== "1" && forced.toLowerCase() !== "true") {
      throw new Error(
        "KAS_MODE=birjoy refused: BirJoySource still has 6 unimplemented methods " +
        "(fetchByPhone, fetchMembers, getDriverPins, getMainReport, " +
        "getReportsPage, getRidesByCar). " +
        "Switching now breaks the map pins, the member sync and the reports. " +
        "Finish F1-bridge Slice 5b first, or set KAS_BIRJOY_FORCE=1 to override.",
      );
    }
    console.warn("[kas] ⚠️ KAS_MODE=birjoy FORCED — 6 methods are stubs; expect failures.");
    cached = new BirJoySource({
      baseUrl: env.KAS_BIRJOY_URL,
      serviceToken: env.KAS_SERVICE_TOKEN,
    });
  } else {
    cached = new KasMockSource();
  }
  return cached;
}
