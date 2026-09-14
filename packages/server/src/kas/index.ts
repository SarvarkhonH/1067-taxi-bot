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
    // Two of the four reasons this guard used to give were closed on
    // 2026-09-14. What it says now is what is actually left:
    //
    //   • the shadow run has STARTED, not finished. KAS_SHADOW_ENABLED=1 since
    //     2026-09-14 15:23; the plan asks for seven days (G6). A day of kas1067
    //     being unreachable is not a week of agreement.
    //   • ids change shape — REHEARSED. scripts/dryRunCutover.ts ran the real
    //     matcher over the real member table and the taxi core's real answers:
    //     every member with a shared phone is adopted, nobody's balance is
    //     stranded, and the way back produces no duplicates. The rehearsal
    //     found a real bug doing it (rollback used to duplicate every adopted
    //     member). What it cannot prove: the cutover happens against whatever
    //     the two tables hold ON THE DAY, not what they held when it ran.
    //   • a customer's money is not in B. Their balance stays in this
    //     system's ledger; the bridge deliberately refuses to write it. This
    //     one is by design and is not going to change.
    //   • the rollback is WRITTEN and its file surgery has been run
    //     (deploy/rollback-to-kas.sh). The one step nobody can rehearse without
    //     cutting over first is the value actually changing back from birjoy.
    //
    // So the switch stays a deliberate act with a name on it, rather than a
    // config change somebody makes on a Tuesday. Set KAS_BIRJOY_FORCE=1 when
    // the shadow run is done and the owner has said go.
    const forced = String(process.env.KAS_BIRJOY_FORCE ?? "").trim();
    if (forced !== "1" && forced.toLowerCase() !== "true") {
      throw new Error(
        "KAS_MODE=birjoy refused: the bridge is code-complete (27/27) and the cutover " +
        "matching is rehearsed against real data, but the shadow run that decides " +
        "whether the two sources AGREE has only just started (G6 asks for seven days). " +
        "Read it — journalctl -u bot1067 | grep '[shadow] SUMMARY' — and when the owner " +
        "has said go, set KAS_BIRJOY_FORCE=1.",
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
