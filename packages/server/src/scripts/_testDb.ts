// Sweep-simulation tests (testPhantomRide / testRideCard) drive the GLOBAL finish
// sweep. On the app's DB the LIVE deployed bot's 90s sweep RACES the test's
// synthetic members (clears state / grants / sends cards) → flaky + prod-unsafe
// (this is the shared-state pattern that masked a real bug before). So these tests
// MUST run on a SEPARATE database the live bot never touches: TEST_DATABASE_URL.
//
// This file is the VERY FIRST import (before ../env / db.ts) and loads the repo
// .env itself so TEST_DATABASE_URL is visible, then points the Prisma client at it.
// It REFUSES to run on the app DB — no silent fallback (that is exactly the race).
import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(here, "../../../..", ".env") });

const isolated = process.env.TEST_DATABASE_URL;
if (!isolated) {
  throw new Error(
    "[testDb] Sweep tests require TEST_DATABASE_URL (a separate DB). Refusing to run on the app DB — " +
      "the live bot's 90s sweep would race the test's synthetic members (flaky + prod-unsafe).",
  );
}
process.env.DATABASE_URL = isolated;
process.env.DIRECT_URL = isolated;
export {};
