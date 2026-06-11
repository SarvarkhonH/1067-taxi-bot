// 🏪 Bozor tests: buy burns coins + issues voucher, per-user limit, owner-gated
// idempotent redeem, ledger invariant. Run: dotenv -e ../../.env -- tsx src/scripts/testMarket.ts
import "../env";
import { prisma } from "../db";
import { grantCoins } from "../services/coinService";
import { buyListing, listShops, myOrders, redeemVoucher } from "../services/marketService";

const TAG = "mkt-test";
let failed = 0;
function ok(cond: boolean, label: string): void {
  console.log(`${cond ? "✅" : "❌"} ${label}`);
  if (!cond) failed++;
}

async function cleanup(): Promise<void> {
  const shops = await prisma.shop.findMany({ where: { name: { startsWith: TAG } }, select: { id: true } });
  await prisma.shopOrder.deleteMany({ where: { shopId: { in: shops.map((s) => s.id) } } });
  await prisma.shop.deleteMany({ where: { id: { in: shops.map((s) => s.id) } } }); // listings cascade
  await prisma.member.deleteMany({ where: { kasId: { startsWith: TAG } } });
}

async function main(): Promise<void> {
  await cleanup();

  const shop = await prisma.shop.create({ data: { name: `${TAG} Sartarosh`, emoji: "💈", ownerPhone: "+998900002001" } });
  const listing = await prisma.listing.create({ data: { shopId: shop.id, title: "Soch olish", emoji: "✂️", priceCoins: 5000, perUserLimit: 2 } });
  const buyer = await prisma.member.create({ data: { type: "client", kasId: `${TAG}-B`, fullName: "Mkt Buyer", phone: "+998900002002", trips: 2 } });
  const owner = await prisma.member.create({ data: { type: "client", kasId: `${TAG}-O`, fullName: "Mkt Owner", phone: "+998900002001", trips: 9 } });
  await grantCoins(buyer.id, 12000, "manual", "test seed");

  const shopsView = await listShops();
  ok(shopsView.some((s) => s.id === shop.id && s.listings.length === 1), `shop listed with 1 item`);

  // buy → coins burned, voucher issued
  let r = await buyListing(buyer.id, listing.id);
  ok(r.ok && !!r.voucherCode && r.coinsLeft === 7000, `buy burns 5000, voucher ${r.voucherCode} (left ${r.coinsLeft})`);
  const code1 = r.voucherCode!;

  // ledger invariant after burn
  const sum = await prisma.coinTxn.aggregate({ where: { memberId: buyer.id }, _sum: { amount: true } });
  const bal = (await prisma.member.findUnique({ where: { id: buyer.id } }))?.coins ?? -1;
  ok(Math.abs(bal - (sum._sum.amount ?? 0)) < 0.001, `ledger invariant holds after market spend`);

  // second buy ok, third hits per-user limit
  r = await buyListing(buyer.id, listing.id);
  ok(r.ok, `second buy ok (limit 2)`);
  r = await buyListing(buyer.id, listing.id);
  ok(!r.ok && r.reason === "per_user_limit", `third buy blocked by per-user limit`);

  // insufficient coins
  const poor = await prisma.member.create({ data: { type: "client", kasId: `${TAG}-P`, fullName: "Mkt Poor", phone: "+998900002003" } });
  r = await buyListing(poor.id, listing.id);
  ok(!r.ok && r.reason === "insufficient", `insufficient coins blocked (no burn)`);

  // orders view shows vouchers
  const orders = await myOrders(buyer.id);
  ok(orders.length === 2 && orders.every((o) => o.status === "issued"), `buyer sees 2 issued vouchers`);

  // redeem: wrong owner phone blocked, right phone works, second redeem blocked
  let rr = await redeemVoucher(code1, "+998900009999");
  ok(!rr.ok && rr.reason === "not_owner", `redeem by stranger blocked`);
  rr = await redeemVoucher(code1, "+998900002001");
  ok(rr.ok && rr.title === "Soch olish", `owner redeems voucher`);
  rr = await redeemVoucher(code1, "+998900002001");
  ok(!rr.ok && rr.reason === "already", `double-redeem blocked (idempotent)`);
  rr = await redeemVoucher("ZZZZZZ", "+998900002001");
  ok(!rr.ok && rr.reason === "not_found", `unknown code rejected`);

  // total: buyer spent 10000, nothing came back (pure sink)
  const after = (await prisma.member.findUnique({ where: { id: buyer.id } }))?.coins ?? -1;
  ok(after === 2000, `coins are a pure sink (12000 → ${after})`);

  await cleanup();
  await prisma.$disconnect();
  console.log(failed === 0 ? "\n🎉 all market checks passed" : `\n❌ ${failed} FAILED`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
