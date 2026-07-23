// READ-ONLY: prove /api/home/feed aggregate (Bosqich 2) returns a real banner + image feed from the
// live DB. preview=true → sees the catalog even while shop/restoran flags are DARK (owner-preview).
//   KAS_MODE=live dotenv -e ../../.env -- tsx src/scripts/testHomeFeed.ts
import "../env";
import { prisma } from "../db";
import { getHomeFeed } from "../services/homeFeedService";

async function main(): Promise<void> {
  const feed = await getHomeFeed(true);
  console.log("\n=== /api/home/feed (preview=admin) ===");
  console.log("banner:", feed.banner ? `${feed.banner.title} → ${feed.banner.target} [${feed.banner.badge}] img=${feed.banner.imageUrl}` : "none");
  console.log(`items: ${feed.items.length}`);
  feed.items.forEach((it, i) =>
    console.log(`  ${i === 0 ? "▮(tall)" : "      "} ${it.kind.padEnd(10)} #${it.id} "${it.name.slice(0, 24)}" ${(it.priceLabel ? it.priceLabel + " tanga" : it.rating ? "⭐" + it.rating.toFixed(1) : "").padEnd(14)} badge=${it.badge ?? "-"} photo=${it.photoUrl ?? "none"}`));
  console.log("services:", feed.services.map((s) => `${s.key}:${s.on ? "on" : "off"}`).join(" "));
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
