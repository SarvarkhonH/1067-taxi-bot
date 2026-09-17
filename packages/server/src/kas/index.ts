import { env } from "../env";
import { KasMockSource } from "./mock";
import { BirJoySource } from "./birjoy";
import type { KasDataSource } from "./types";

export * from "./types";
export { KasMockSource } from "./mock";
export { BirJoySource } from "./birjoy";

let cached: KasDataSource | null = null;

/**
 * The taxi dispatch this process talks to.
 *
 * `birjoy` — our own core (1067-taxi) on the same machine. This is production.
 * `mock`   — an offline stand-in for development and the simulators.
 *
 * Until 2026-09-17 there was a third answer, kas1067, a rented dispatch reached
 * by scraping its admin panel. It went down for days at a time and took the
 * bot's taxi screens with it; the owner decided to remove it entirely, with no
 * way back. Its client, sockets, shadow comparison and boot guard were deleted
 * in the same change.
 */
export function getDataSource(): KasDataSource {
  if (cached) return cached;
  if (env.KAS_MODE === "birjoy") {
    cached = new BirJoySource({
      baseUrl: env.KAS_BIRJOY_URL,
      serviceToken: env.KAS_SERVICE_TOKEN,
    });
  } else {
    cached = new KasMockSource();
  }
  return cached;
}
