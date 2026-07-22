// K1 core tests — NO LLM calls (quota-free): provider registry, flag-gating, and the
// stub-provider order→confirm→execute round trip. The LLM-side scenarios (shahar_qidir
// tool selection) join testAgent.ts tomorrow when quotas reset.
// Run: pnpm exec dotenv -e ../../.env -- tsx src/scripts/testCity.ts
import "../env";
import { prisma } from "../db";
import { __registerForTest, activeProviders, providerByKey } from "../services/ai/providers";
import { restoranProvider } from "../services/ai/providers/restoranProvider";
import type { AiProvider } from "../services/ai/providers/types";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, extra = ""): void {
  ok ? pass++ : fail++;
  console.log(`${ok ? "✅" : "❌"} ${name}${extra ? ` — ${extra}` : ""}`);
}

const executed: string[] = [];
const stub: AiProvider = {
  key: "teststub",
  title: "test xizmati",
  flags: [], // no gates → always active (stub only lives in this process)
  search: async (q) => (q === "bo'sh" ? [] : [{ id: "1", title: `Stub natija: ${q}`, subtitle: "1 000 so'm" }]),
  order: async (_m, _t, item, qty, extra) =>
    extra.length < 5 ? { error: "manzil kerak" } : { html: `<b>${qty}× ${item}</b>`, payload: JSON.stringify({ item, qty, extra }) },
  execute: async (_m, _t, payload) => {
    executed.push(payload);
    return { ok: true, message: "bajarildi" };
  },
  status: async () => "holat-ok",
};

async function main(): Promise<void> {
  __registerForTest(stub);

  // registry
  check("providerByKey topadi", providerByKey("teststub")?.title === "test xizmati");
  check("restoran registrda", providerByKey("restoran") === restoranProvider);
  const active = await activeProviders();
  check("stub (flag'siz) active", active.some((p) => p.key === "teststub"));
  // flag-gate: provider ro'yxatda FAQAT moduli yoqiq bo'lsa (2026-07-22: restoran jonli ON)
  const { featureOn } = await import("../services/featureFlags");
  const restoranOn = await featureOn("restoran");
  check(`restoran gate flag'ga mos (flag=${restoranOn ? "ON" : "OFF"})`, active.some((p) => p.key === "restoran") === restoranOn);

  // real katalog qidiruvi (read-only): flag ON bo'lsa "osh" kamida 1 natija berishi kerak
  const oshCards = await restoranProvider.search("osh");
  check(restoranOn ? "jonli katalogda «osh» topiladi" : "flag-off search=[]", restoranOn ? oshCards.length > 0 : oshCards.length === 0, oshCards[0]?.title ?? "");

  // stub round-trip: search → order(confirm) → execute
  check("stub search", (await stub.search("osh"))[0]!.title.includes("osh"));
  check("stub search bo'sh", (await stub.search("bo'sh")).length === 0);
  const noAddr = await stub.order!(1, "t", "osh", 2, "");
  check("manzilsiz order → error", "error" in noAddr);
  const okOrder = await stub.order!(1, "t", "osh", 2, "Obod mahalla 12");
  check("manzil bilan order → ConfirmCard", "payload" in okOrder && okOrder.html.includes("2× osh"));
  if ("payload" in okOrder) {
    check("execute FAQAT payload bilan", (await stub.execute!(1, "t", okOrder.payload)).ok && executed.length === 1);
    check("payload aynan saqlangan", JSON.parse(executed[0]!).extra === "Obod mahalla 12");
  }
  check("status", (await stub.status!(1)) === "holat-ok");

  console.log(`\n${pass}/${pass + fail} o'tdi`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

void main();
