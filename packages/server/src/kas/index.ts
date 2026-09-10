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
    // ⚠️ BirJoySource is INCOMPLETE — 19 of 27 KasDataSource methods still
    // reject with "not implemented yet". Selecting this mode today takes down
    // the booking sweep, the coin ledger and driver-debt repayment, because
    // every one of those calls a stubbed method and gets a rejected promise.
    //
    // Failing loudly at boot beats failing quietly at 2am on a real customer's
    // ride. Set KAS_BIRJOY_FORCE=1 to proceed anyway (F1-bridge testing).
    const forced = String(process.env.KAS_BIRJOY_FORCE ?? "").trim();
    if (forced !== "1" && forced.toLowerCase() !== "true") {
      throw new Error(
        "KAS_MODE=birjoy refused: BirJoySource still has 19 unimplemented methods " +
        "(addClientBonus, addDriverPayment, cancelBooking, checkClient, fetchByPhone, " +
        "fetchMembers, getBonusRules, getCompanyInfo, getDriverAccount, getDriverPins, " +
        "getMainReport, getReportsPage, getRidesByCar, getServiceArea, getTariff, " +
        "listActiveBookings, listDriverRoster, setClientBonus, setClientName). " +
        "Switching now breaks the booking sweep, the coin ledger and debt repayment. " +
        "Finish F1-bridge Slice 5b/5c first, or set KAS_BIRJOY_FORCE=1 to override.",
      );
    }
    console.warn("[kas] ⚠️ KAS_MODE=birjoy FORCED — 19 methods are stubs; expect failures.");
    cached = new BirJoySource({
      baseUrl: env.KAS_BIRJOY_URL,
      serviceToken: env.KAS_SERVICE_TOKEN,
    });
  } else {
    cached = new KasMockSource();
  }
  return cached;
}
