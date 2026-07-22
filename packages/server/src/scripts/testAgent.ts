// Smoke-test the AI agent against LIVE Groq (no Telegram messages sent, no real
// members touched). Seeds a TAG'd fake-tgId conversation in SupportMsg to prove
// the memory path ("obronga" after "menga taksi yubor" → book action), runs the
// scenarios, then cleans up. Cap counters bump by ~4 for the throwaway memberId
// 999999 (harmless — capped namespace, never a real member's budget).
// Run: pnpm exec dotenv -e ../../.env -- tsx src/scripts/testAgent.ts
import "../env";
process.env.AI_TEST_FORCE_TOOLS = "1"; // force the full tool roster — verify routing without touching live flags
import { prisma } from "../db";
import { runAgent } from "../services/ai/agent";

const TAG_TG = "aitest-throwaway-999";
const FAKE_MEMBER = 999999;

async function scenario(name: string, text: string, expect: (r: Awaited<ReturnType<typeof runAgent>>) => boolean): Promise<boolean> {
  const r = await runAgent(FAKE_MEMBER, TAG_TG, text);
  const ok = expect(r);
  console.log(`${ok ? "✅" : "❌"} ${name}: ${JSON.stringify(r)}`);
  // mirror what bot.ts does so the NEXT scenario sees this exchange as history
  await prisma.supportMsg.create({ data: { telegramId: TAG_TG, direction: "in", text } });
  const a = r?.action;
  const out =
    r?.text ??
    (a?.type === "book"
      ? a.query
        ? `📍 Manzil variantlari ko'rsatildi: «${a.query}» — mijoz tugmadan tanlaydi.`
        : "🚕 1-bosishda chaqirish tugmasi ko'rsatildi."
      : a?.type === "balance"
        ? "🪙 Balans ko'rsatildi."
        : a?.type === "status"
          ? "📍 Buyurtma holati ko'rsatildi."
          : a?.type === "remind_create"
            ? `🔔 Eslatma taklifi ko'rsatildi: «${a.text}» — ${a.timeText}. Saqlandi.`
            : a?.type === "remind_list"
              ? "🔔 Eslatmalar ro'yxati ko'rsatildi."
              : a?.type === "remind_cancel"
                ? "✖️ Eslatma bekor qilindi."
                : a?.type === "stats"
                  ? "📊 Hisobot ko'rsatildi."
                  : a?.type === "memory_save"
                    ? "Yozib qo'ydim, esimda turadi 😊"
                    : a?.type === "memory_forget"
                      ? "🧹 Unutdim."
                      : a?.type === "city_search"
                        ? `🔎 Topildi (${a.provider}): Zakaz osh — Bahor Restaurant (60 000 so'm).`
                        : a?.type === "city_order"
                          ? `🏙 Buyurtma tasdiqlash-kartasi ko'rsatildi (${a.provider}: ${a.item} ×${a.qty}).`
                          : a?.type === "city_status"
                            ? "🏙 Buyurtma holati ko'rsatildi."
                            : null);
  if (out) await prisma.supportMsg.create({ data: { telegramId: TAG_TG, direction: "out", text: out } });
  await new Promise((res) => setTimeout(res, 1500)); // Gemini pullik — kvota-pauza shart emas
  return ok;
}

async function main(): Promise<void> {
  if (!process.env.GROQ_API_KEY) {
    console.error("GROQ_API_KEY yo'q — test o'tkazib yuborildi.");
    process.exit(1);
  }
  await prisma.supportMsg.deleteMany({ where: { telegramId: TAG_TG } }); // stale runs
  // throwaway member's daily AI-cap counter — repeated test runs must not self-starve
  // (namespace 999999 is never a real member; the GLOBAL counter is left untouched)
  await prisma.appState.deleteMany({ where: { key: { startsWith: `ai_member:${FAKE_MEMBER}:` } } });
  let pass = 0;
  const results = [
    await scenario("taksi so'rovi → book action", "menga taksi yubor", (r) => r?.action?.type === "book" || r?.text !== undefined),
    await scenario("kalta manzil follow-up → book('obron…')", "obronga", (r) => r?.action?.type === "book" && /obron/i.test(r.action.query)),
    await scenario("balans savoli → balance action", "tangalarim qancha bo'ldi", (r) => r?.action?.type === "balance"),
    await scenario("oddiy savol → matn javob", "bot nima qila oladi", (r) => typeof r?.text === "string" && r.text.length > 10),
    await scenario(
      "eslatma so'rovi → remind_create (vaqt aynan)",
      "ertaga 7:30 da bozorga taksi kerak, eslat",
      (r) => r?.action?.type === "remind_create" && /7[:.]30|ertaga/i.test(r.action.timeText),
    ),
    await scenario("eslatmalar ro'yxati → remind_list", "eslatmalarim qani", (r) => r?.action?.type === "remind_list"),
    await scenario("hisobot so'rovi → stats(oy)", "bu oy qancha ishlatdim", (r) => r?.action?.type === "stats" && r.action.period === "oy"),
    await scenario("dori eslatmasi → remind_create oddiy", "kechqurun 9 da dori ichishni eslat", (r) => r?.action?.type === "remind_create"),
    await scenario(
      "dardlashish → hamdard matn (tool YO'Q, nasihatsiz)",
      "bugun ishda juda charchadim, hech narsaga kuchim yo'q",
      (r) => (typeof r?.text === "string" && r.text.length > 5 && !r.action) || r?.action?.type === "memory_save",
    ),
    await scenario(
      "muhim fakt → memory_save",
      "ertaga matematikadan katta imtihonim bor, juda hayajondaman",
      (r) => r?.action?.type === "memory_save" && /imtihon/i.test(r.action.note),
    ),
    await scenario("meni unut → memory_forget", "meni unut, hamma narsani o'chir", (r) => r?.action?.type === "memory_forget"),
    await scenario(
      "ovqat qidiruv → city_search(restoran)",
      "qaysi restoranda osh bor?",
      (r) => r?.action?.type === "city_search" && r.action.provider === "restoran",
    ),
    await scenario(
      "buyurtma manzil bilan → city_order(qty=2, manzil)",
      "2 ta osh buyurtma qil, manzil: Obod mahalla 12-uy",
      (r) => r?.action?.type === "city_order" && r.action.provider === "restoran" && r.action.qty === 2 && /obod/i.test(r.action.extra),
    ),
    await scenario("ovqat holati → city_status", "ovqat buyurtmam qayerda qoldi", (r) => r?.action?.type === "city_status" && r.action.provider === "restoran"),
  ];
  pass = results.filter(Boolean).length;
  await prisma.supportMsg.deleteMany({ where: { telegramId: TAG_TG } }); // full cleanup
  console.log(`\n${pass}/${results.length} scenariy o'tdi`);
  await prisma.$disconnect();
  process.exit(pass === results.length ? 0 : 1);
}

void main();
