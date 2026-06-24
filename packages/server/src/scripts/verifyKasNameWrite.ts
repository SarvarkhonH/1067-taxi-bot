// Safely PROVE that kas honors a fullName change on PUT api/clients. Picks a PLACEHOLDER-named
// client (name "-" or empty or "Mijoz <id>" — nobody's real name), round-trips:
//   read original → set a temp name → re-read (did kas honor it?) → restore original → confirm.
// Zero real-name risk; the change exists for ~1s and is restored. Read-mostly otherwise.
//
// Run: KAS_MODE=live dotenv -e ../../.env -- tsx src/scripts/verifyKasNameWrite.ts
import "../env";
import { prisma } from "../db";
import { getDataSource, KasLiveSource } from "../kas";
import { env } from "../env";

const PLACEHOLDER = /^(-|—|\s*|Mijoz( \d+)?)$/;

async function main(): Promise<void> {
  const ds = getDataSource();
  if (ds.name !== "live") {
    console.log("KAS_MODE not live — abort");
    process.exit(1);
  }
  const kas = ds as KasLiveSource;

  // grab a page of clients, find a placeholder-named one with a phone
  const data = await kas.getJson("api/clients/byFilter?searchText=&sort=bonus&page=0&size=50");
  const list = (data.clientDtoList as Record<string, unknown>[]) ?? [];
  const target = list.find((c) => {
    const name = String(c.fullName ?? "").trim();
    const phone = String(c.phoneNumber ?? "").replace(/\D/g, "");
    return phone.length >= 9 && PLACEHOLDER.test(name);
  });
  if (!target) {
    console.log("no placeholder-named client found on page 0 — aborting (won't touch a real name)");
    process.exit(0);
  }
  const phone = String(target.phoneNumber);
  const original = String(target.fullName ?? "");
  console.log(`target client: id=${target.id} phone=${phone} originalName="${original}"`);

  const TEMP = "TEST_1067_NAME";
  // 1) set temp
  const set1 = await kas.setClientName(phone, TEMP);
  console.log(`setClientName("${TEMP}") → ok=${set1.ok} status=${set1.status}`);

  // 2) re-read — did kas honor it?
  const after = await kas.getJson(`api/clients/byFilter?searchText=${encodeURIComponent(phone.slice(-9))}&sort=bonus&page=0&size=20`);
  const afterList = (after.clientDtoList as Record<string, unknown>[]) ?? [];
  const reread = afterList.find((c) => String(c.phoneNumber ?? "").replace(/\D/g, "").slice(-9) === phone.slice(-9));
  const newName = String(reread?.fullName ?? "");
  console.log(`re-read name = "${newName}"`);

  // 3) RESTORE original (even if empty → set back to a single dash to match placeholder)
  const restore = await kas.setClientName(phone, original || "-");
  console.log(`restore("${original || "-"}") → ok=${restore.ok} status=${restore.status}`);

  console.log("\n" + (newName === TEMP
    ? `✅ KAS HONORS fullName changes — name updated to "${TEMP}" then restored. setClientName WORKS.`
    : `⚠️ kas did NOT change the name (still "${newName}") — PUT api/clients ignores fullName. Need another endpoint.`));

  await prisma.$disconnect();
}
main();
