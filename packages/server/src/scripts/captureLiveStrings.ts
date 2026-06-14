// Capture the EXACT bot strings the CURRENTLY-DEPLOYED code renders for the owner —
// proves what the live process (same commit) returns for /me + the unknown-text fallback.
import "../env";
import { getMe } from "../services/memberService";
import { renderProfile } from "../bot/render";

const OWNER = "6506297119";

async function main(): Promise<void> {
  const me = await getMe(OWNER);
  console.log("=== /me (renderProfile) — what the deployed code sends ===");
  console.log(me ? renderProfile(me) : "(owner not linked / no member)");
  console.log("\n=== contains 'Coin'? ===", me ? renderProfile(me).includes("Coin") : "n/a");
  console.log("=== contains 'Tanga'? ===", me ? renderProfile(me).includes("Tanga") : "n/a");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
