import { env } from "../env";
import { KasLiveSource } from "./client";
import { KasMockSource } from "./mock";
import type { KasDataSource } from "./types";

export * from "./types";
export { KasLiveSource } from "./client";
export { KasMockSource } from "./mock";

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
  } else {
    cached = new KasMockSource();
  }
  return cached;
}
