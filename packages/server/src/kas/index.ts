import { env } from "../env";
import { KasLiveSource } from "./client";
import { KasMockSource } from "./mock";
import { BirJoySource } from "./birjoy";
import type { KasDataSource } from "./types";
import { withShadow, startShadowSummaryLog } from "./shadow";

export * from "./types";
export { KasLiveSource } from "./client";
export { KasMockSource } from "./mock";
export { BirJoySource } from "./birjoy";
export { withShadow, shadowRecorder } from "./shadow";

let cached: KasDataSource | null = null;

/**
 * Put the taxi core alongside whatever is answering, and write down where they
 * disagree.
 *
 * Off unless KAS_SHADOW_ENABLED=1. It never changes an answer: the caller gets
 * the primary's reply, always, and only READ methods are asked twice — a
 * doubled write would create two real orders or move money twice.
 *
 * This is what the KAS_MODE=birjoy boot guard is waiting for. Nobody should
 * flip that switch until a week of this has run and the report is boring.
 */
function maybeShadow(primary: KasDataSource): KasDataSource {
  const on = String(process.env.KAS_SHADOW_ENABLED ?? "").trim();
  if (on !== "1" && on.toLowerCase() !== "true") return primary;
  if (primary.name === "birjoy") return primary;   // already the thing we compare against
  if (!env.KAS_BIRJOY_URL || !env.KAS_SERVICE_TOKEN) {
    console.warn("[shadow] KAS_SHADOW_ENABLED is set but KAS_BIRJOY_URL / KAS_SERVICE_TOKEN are not — shadow OFF");
    return primary;
  }

  // Every Nth read, so a comparison never becomes the reason the taxi core is
  // busy. One in three is enough to learn the shape of a disagreement in a day.
  const sampleEvery = Math.max(1, Number(process.env.KAS_SHADOW_SAMPLE ?? 3));
  console.warn(
    `[shadow] ON — comparing ${primary.name} against birjoy, 1 call in ${sampleEvery}. ` +
    "Reads only; the caller always gets " + primary.name + "'s answer.",
  );
  startShadowSummaryLog();
  return withShadow(
    primary,
    new BirJoySource({ baseUrl: env.KAS_BIRJOY_URL, serviceToken: env.KAS_SERVICE_TOKEN }),
    { sampleEvery },
  );
}

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
    // ⚠️ Every method is implemented now — 27 of 27, as of 2026-09-14. That is
    // NOT the same as "safe to switch", and the difference is the whole reason
    // this guard still exists.
    //
    // What has been proven: each method compiles, maps the shape kas1067
    // answers with, and is covered where the logic is dangerous (the member
    // matcher, the coin paths, the id namespacing).
    //
    // What has NOT been proven, and cannot be from here:
    //
    //   • no shadow run. Nobody has put the two sources side by side for a day
    //     and compared what they answer. The plan asks for seven (G6).
    //   • ids change shape. Every member arrives with a "bj_" id at the
    //     moment of the switch, and the matcher takes over their existing row
    //     so the tanga travels. That path is unit-tested and has never run
    //     against real data.
    //   • a customer's money is not in B. Their balance stays in this
    //     system's ledger; the bridge deliberately refuses to write it.
    //   • no rollback drill. KAS_MODE=live is the way back, and nobody has
    //     walked it.
    //
    // So the switch stays a deliberate act with a name on it, rather than a
    // config change somebody makes on a Tuesday. Set KAS_BIRJOY_FORCE=1 when
    // the shadow run is done and the owner has said go.
    const forced = String(process.env.KAS_BIRJOY_FORCE ?? "").trim();
    if (forced !== "1" && forced.toLowerCase() !== "true") {
      throw new Error(
        "KAS_MODE=birjoy refused: the bridge is code-complete (27/27) but UNVERIFIED. " +
        "No shadow run has compared it against kas1067, the cutover member-matching " +
        "has never touched real data, and no rollback has been rehearsed. " +
        "Run the shadow comparison first (G6), then set KAS_BIRJOY_FORCE=1.",
      );
    }
    console.warn(
      "[kas] ⚠️ KAS_MODE=birjoy FORCED — code-complete but unverified against kas1067. " +
      "Watch the member sync: an unexpected 'create' where you expected 'adopt' means " +
      "somebody's tanga was left on their old row.",
    );
    cached = new BirJoySource({
      baseUrl: env.KAS_BIRJOY_URL,
      serviceToken: env.KAS_SERVICE_TOKEN,
    });
  } else {
    cached = new KasMockSource();
  }
  cached = maybeShadow(cached);
  return cached;
}
