// 🔔 V4 — EGAGA sinov-push (ega so'radi: "menga sinov push yubor, keyin yoqamiz").
//
// ⚠️ FAQAT EGAGA. Chat ID kodda qattiq yozilgan (OWNER_TG) — parametr yo'q, ya'ni bu skript
//    boshqa hech kimga xabar yubora olmaydi. Mijozlarga sinov xabar yuborish TAQIQ.
// ⚠️ MARKER QO'YILMAYDI: bu sinov haqiqiy push'ni "yuborilgan" deb belgilamaydi, shuning uchun
//    bayroq yoqilganda mijoz o'z xabarini baribir oladi.
// ⚠️ Bayroq holati TEKSHIRILMAYDI (maqsad — yoqishdan OLDIN ko'rsatish), lekin bu skript FAQAT
//    qo'lda ishga tushadi; tick'dagi yo'l (runLifecyclePushes) bayroqqa bo'ysunaveradi.
//
// Yugurtirish: npx dotenv -e ../../.env -- npx tsx src/scripts/sendLifecyclePreview.ts
import { Bot } from "grammy";
import { prisma } from "../db";
import { env } from "../env";
import { planLifecyclePushes } from "../services/marketLifecycleService";
import { sendProductCard } from "../bot/shop";

const OWNER_TG = "6506297119"; // cashout.ts / shop.ts / broadcast.ts bilan bir xil manba

async function main(): Promise<void> {
  if (!env.BOT_TOKEN) { console.error("BOT_TOKEN yo'q"); return; }
  const bot = new Bot(env.BOT_TOKEN); // faqat API uchun — polling ISHGA TUSHIRILMAYDI

  console.log("— V4 sinov-push (FAQAT egaga) —");
  await bot.api.sendMessage(
    OWNER_TG,
    "🧪 <b>V4 sinov</b> — quyidagi ikki xabar mijozga aynan shunday ko'rinadi.\n<i>Bu faqat sizga yuborildi; bayroq hali OFF.</i>",
    { parse_mode: "HTML" },
  );

  // 1) «Qidirganingiz keldi» — jonli rejadagi HAQIQIY moslikdan
  const plan = await planLifecyclePushes(new Date(Date.UTC(2026, 6, 28, 9, 0, 0)), { ignoreFlag: true });
  const demand = plan.pushes.find((p) => p.kind === "demand");
  if (demand) {
    await bot.api.sendMessage(OWNER_TG, demand.lead, { parse_mode: "HTML" });
    const ok = await sendProductCard(bot, OWNER_TG, demand.productId);
    console.log(`1) demand: ${demand.why} · karta=${ok ? "yuborildi" : "YUBORILMADI"}`);
  } else {
    console.log("1) demand: jonli rejada moslik yo'q — sinov yuborilmadi");
  }

  // 2) «Sevimlingiz arzonlashdi» — chegirmali mahsulot topilsa (real misol bilan)
  const disc = await prisma.product.findFirst({
    where: { active: true, stock: { gt: 0 }, oldPriceTanga: { not: null } },
    select: { id: true, name: true, priceTanga: true, oldPriceTanga: true },
    orderBy: { updatedAt: "desc" },
  });
  if (disc && disc.oldPriceTanga && disc.oldPriceTanga > disc.priceTanga) {
    const pct = Math.round((1 - disc.priceTanga / disc.oldPriceTanga) * 100);
    await bot.api.sendMessage(OWNER_TG, `💥 <b>Sevimlingiz arzonlashdi — ${pct}%</b>`, { parse_mode: "HTML" });
    const ok = await sendProductCard(bot, OWNER_TG, disc.id);
    console.log(`2) fav: product#${disc.id} «${disc.name.slice(0, 40)}» −${pct}% · karta=${ok ? "yuborildi" : "YUBORILMADI"}`);
  } else {
    await bot.api.sendMessage(
      OWNER_TG,
      "ℹ️ <b>Ikkinchi tur (sevimli arzonlashdi)</b> — hozir bazada chegirmali mahsulot yo'q, shuning uchun namuna yuborilmadi. Biror mahsulotga «eski narx» qo'ysangiz, xabar aynan yuqoridagi ko'rinishda ketadi.",
      { parse_mode: "HTML" },
    );
    console.log("2) fav: chegirmali mahsulot yo'q — izoh yuborildi");
  }

  console.log("\nESLATMA: marker QO'YILMADI — bayroq yoqilganda mijozlar o'z xabarini baribir oladi.");
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
