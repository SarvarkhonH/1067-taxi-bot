// 🤖 AI-agent (aibrain flag) — conversational router with tool-calling.
// The LLM (Groq llama-3.3, tool-use) reads the last few support messages so
// follow-ups like "obronga" after "menga taksi yubor" resolve correctly, then
// either answers in text or picks ONE local action. PRIVACY invariant: actions
// are executed LOCALLY by the bot layer — balances, phone numbers and booking
// details are NEVER round-tripped through the LLM; the model only ever sees
// sanitized user text and public place-name queries. Dispatch stays behind a
// human button tap (the agent can only OPEN the pick-an-address flow).
import { prisma } from "../../db";
import { featureOn } from "../featureFlags";
import { aiCapBump, aiCapOk, sanitize } from "./llmRouter";

export type AgentAction =
  | { type: "book"; query: string }
  | { type: "status" }
  | { type: "balance" }
  | { type: "remind_create"; text: string; timeText: string; kind: "oddiy" | "taksi" | "qarz" }
  | { type: "remind_list" }
  | { type: "remind_cancel"; idx?: number }
  | { type: "stats"; period: "bugun" | "hafta" | "oy" }
  | { type: "memory_save"; note: string }
  | { type: "memory_forget"; idx?: number }
  | { type: "city_search"; provider: string; query: string }
  | { type: "city_order"; provider: string; item: string; qty: number; extra: string }
  | { type: "city_status"; provider: string };
export interface AgentResult {
  text?: string; // plain answer to send (may accompany nothing else)
  action?: AgentAction; // local action for the bot layer to execute
}

const SYSTEM = [
  "Sen BirJoy — Koson (O'zbekiston) shahrining super-app yordamchisisan (nomi «Koson AI»). Qisqa (1-3 jumla), samimiy, sof o'zbekcha javob ber.",
  "BirJoy imkoniyatlari: 🚕 taksi chaqirish, 📍 buyurtma holati (jonli karta), 🪙 tanga-hamyon (1 tanga = 1 so'm, kamida 1 real safardan keyin so'mga yechiladi), 🎡 safar paytida omad g'ildiragi, 👥 referal (do'st ilk safar qilsa senga 1500 / unga 5000 tanga), 💎 BirJoy Plus obuna, 👬 Gap (3-6 do'st birga maqsad), Mini App.",
  "«1067» — bu FAQAT taksi dispetcherining raqami (taksi bo'limiga tegishli). Uni brend sifatida ishlatma — brend BirJoy. 1067 raqamini faqat taksi haqidagi savolda tilga ol.",
  "Qoidalar:",
  "- Mijoz taksi so'rasa yoki manzil aytsa → taksi_chaqir tool'ini chaqir. Oldingi xabarlarda taksi so'ralgan bo'lsa, keyingi kalta xabar ('obronga', 'shabada') odatda MANZIL bo'ladi.",
  "- Manzilni O'YLAB TOPMA: mijoz manzil aytgan bo'lsa — aynan o'shani uzat; aytmagan bo'lsa — manzil argumentini BO'SH qoldir (tizim o'zi so'raydi).",
  "- Buyurtmasi qayerda / mashina kelyaptimi deb so'rasa → buyurtma_holati tool.",
  "- Balans/tanga/hisobim haqida so'rasa → balans tool.",
  "- ODDIY SAVOL (imkoniyatlar, narx, qoida, salomlashish) uchun tool chaqirMA — matnda javob ber. Tarixda «ko'rsatildi»/«saqlandi» degan assistant-xabar bo'lsa, o'sha so'rov HAL BO'LGAN — yangi aniq so'rovsiz o'sha tool'ni TAKRORLAMA.",
  "- Pul yechish, tanga o'tkazish kabi amallarni SEN bajara olmaysan — Mini App/Hamyon tugmalariga yo'naltir.",
  "- Bot imkoniyatlari/qanday ishlashi so'ralsa — yuqoridagi ro'yxatdan samimiy, qisqa aytib ber (operatorga YUBORMA).",
  "- Javobini bilmasang: TAKSI haqidagi savolda «☎️ 1067 dispetcheriga qo'ng'iroq qiling» de; boshqa mavzuda esa mijozdan aniqroq yozishni so'ra (1067 raqamini taksidan tashqari mavzuda BERMA).",
  "- 'coin' so'zini ishlatma — har doim 'tanga'.",
].join("\n");

const TOOLS = [
  {
    type: "function",
    function: {
      name: "taksi_chaqir",
      description: "Mijozga taksi chaqirish oqimini ochadi (manzil variantlari tugmalarda chiqadi, mijoz o'zi tasdiqlaydi).",
      parameters: {
        type: "object",
        properties: { manzil: { type: "string", description: "Manzil MIJOZ YOZGANIDEK. Mijoz manzil aytmagan bo'lsa bo'sh qoldir." } },
      },
    },
  },
  {
    type: "function",
    function: { name: "buyurtma_holati", description: "Mijozning hozirgi faol buyurtmasi holatini ko'rsatadi.", parameters: { type: "object", properties: {} } },
  },
  {
    type: "function",
    function: { name: "balans", description: "Mijozning tanga balansi va safarlar sonini ko'rsatadi.", parameters: { type: "object", properties: {} } },
  },
];

// 🔔 airemind flag ortida — flag OFF bo'lsa bu tool'lar Groq'ga UMUMAN yuborilmaydi
// (model gallyutsinatsiya qilsa ham chaqira olmaydi).
const REMIND_TOOLS = [
  {
    type: "function",
    function: {
      name: "eslatma_qoy",
      description: "Mijoz uchun eslatma o'rnatadi (masalan: ertaga taksi, dori ichish, qarz to'lash). Tizim avval tasdiqlash-karta ko'rsatadi.",
      parameters: {
        type: "object",
        properties: {
          matn: { type: "string", description: "Eslatma NIMA haqida — mijoz so'zlariga yaqin, qisqa" },
          vaqt: { type: "string", description: "Vaqt MIJOZ YOZGANIDEK ('ertaga 7 da', 'payshanba', '2 soatdan keyin') — HISOBLAMA, tizim o'zi hisoblaydi" },
          turi: { type: "string", enum: ["oddiy", "taksi", "qarz"], description: "taksi = taksi kerak bo'ladigan eslatma; qarz = to'lov/qarz; boshqasi oddiy" },
        },
        required: ["matn", "vaqt"],
      },
    },
  },
  {
    type: "function",
    function: { name: "eslatmalarim", description: "Mijozning kutilayotgan eslatmalari ro'yxatini ko'rsatadi.", parameters: { type: "object", properties: {} } },
  },
  {
    type: "function",
    function: {
      name: "eslatma_bekor",
      description: "Eslatmani bekor qiladi. Mijoz qaysi birini aytmagan bo'lsa raqamsiz chaqir — tizim ro'yxat ko'rsatadi.",
      parameters: { type: "object", properties: { raqam: { type: "number", description: "Ro'yxatdagi tartib raqami (1 dan boshlab)" } } },
    },
  },
];

// 📊 aihisob flag ortida.
const STATS_TOOLS = [
  {
    type: "function",
    function: {
      name: "hisob_kitob",
      description: "Mijozning shaxsiy hisobotini ko'rsatadi: safarlar soni, cashback, tanga tushum/sarf. Raqamlarni tizim o'zi hisoblaydi.",
      parameters: {
        type: "object",
        properties: { davr: { type: "string", enum: ["bugun", "hafta", "oy"], description: "Qaysi davr — aytilmasa 'oy'" } },
      },
    },
  },
];

// 💛 aidost flag ortida — do'st-rejim tool'lari.
const DOST_TOOLS = [
  {
    type: "function",
    function: {
      name: "eslab_qol",
      description: "Suhbatda mijoz haqida MUHIM shaxsiy fakt chiqsa (rejasi, tashvishi, voqeasi) qisqa yozib qo'yadi — keyingi suhbatda eslash uchun. Javob berish O'RNIGA emas, javob BILAN birga ishlatilmaydi — faqat chindan muhim faktda.",
      parameters: {
        type: "object",
        properties: { fakt: { type: "string", description: "Qisqa fakt mijoz so'zlariga yaqin, masalan: 'ertaga matematikadan imtihoni bor'" } },
        required: ["fakt"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "unut",
      description: "Mijoz 'meni unut' / 'buni o'chir' desa — eslab qolingan faktlarni o'chiradi.",
      parameters: { type: "object", properties: { raqam: { type: "number", description: "Faqat bitta faktni o'chirish uchun tartib raqami; aytilmasa HAMMASI o'chadi" } } },
    },
  },
];
const DOST_RULES = [
  "- Sen ayni paytda mijozning DO'STIsan ham: dardlashsa — avval TINGLA va his-tuyg'usini qadrlab qisqa hamdard javob ber («ha, og'ir bo'libdi...», «tushunaman...»). Nasihat-ma'ruza o'qima, hukm qilma, savolni ko'paytirma (bitta yumshoq savol yetadi).",
  "- Sen psixolog/shifokor EMASsan: dori, tashxis, davolash maslahatini BERMA. Mijoz o'ziga zarar yetkazish yoki zo'ravonlik haqida gapirsa — iliq javob + DARHOL: «103 (tez yordam), 102, yoki 1050 ishonch telefoniga qo'ng'iroq qiling, yaqinlaringiz bilan gaplashing».",
  "- Suhbatda mijozning MUHIM shaxsiy fakti chiqsa (imtihon, safar, kasallik-tashvishi, to'y) — eslab_qol tool'i bilan qisqa saqla, KEYIN oddiy javobingni ber. Mayda-chuydani saqlama.",
  "- «Mijoz haqida eslab qolganlaring» bo'limida fakt bo'lsa — o'rinli joyda samimiy esla («imtihoningiz qanday o'tdi?»). Kelajak voqea bo'lsa eslatma taklif qil (eslatma_qoy).",
  "- Mijoz «meni unut» desa → unut tool.",
].join("\n");

// 🏙 aicity — universal shahar-tool'lar. Enum va tavsif REGISTRY'dan runtime'da quriladi:
// yangi provider qo'shilsa bu fayl O'ZGARMAYDI (K1 flexibility kafolati).
function cityTools(providerKeys: string[], providerTitles: string): ToolDef[] {
  return [
    {
      type: "function",
      function: {
        name: "shahar_qidir",
        description: `Koson shahridan qidiradi. Mavjud turlar: ${providerTitles}.`,
        parameters: {
          type: "object",
          properties: {
            tur: { type: "string", enum: providerKeys, description: "Qaysi sohada qidirish" },
            sorov: { type: "string", description: "Nima qidirilyapti, mijoz yozganidek ('osh', 'santexnik')" },
          },
          required: ["tur", "sorov"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "shahar_buyurtma",
        description: "Buyurtma tasdiqlash-kartasini tayyorlaydi (mijoz o'zi ✅ bosadi). Manzil aytilmagan bo'lsa ham chaqir — tizim o'zi so'raydi.",
        parameters: {
          type: "object",
          properties: {
            tur: { type: "string", enum: providerKeys },
            element: { type: "string", description: "Nima buyurtma qilinmoqda, mijoz yozganidek ('osh')" },
            soni: { type: "number", description: "Nechta — aytilmasa 1" },
            manzil: { type: "string", description: "Yetkazish manzili MIJOZ YOZGANIDEK, aytilmagan bo'lsa bo'sh" },
          },
          required: ["tur", "element"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "shahar_holat",
        description: "Mijozning shu turdagi oxirgi buyurtmasi holatini ko'rsatadi.",
        parameters: { type: "object", properties: { tur: { type: "string", enum: providerKeys } }, required: ["tur"] },
      },
    },
  ];
}
const CITY_RULES = [
  "- Mijoz shahar bo'yicha biror narsa qidirsa/buyurtma qilmoqchi bo'lsa (ovqat, xizmat, mahsulot) → shahar_qidir / shahar_buyurtma. Element va manzilni MIJOZ YOZGANIDEK uzat, O'YLAB TOPMA.",
  "- «buyurtmam qani/qachon keladi» (ovqat haqida) → shahar_holat.",
].join("\n");

const REMIND_RULES = [
  "- Mijoz eslatma so'rasa ('eslat', 'esimdan chiqmasin', 'unutmayin') → eslatma_qoy tool. Vaqt so'zlarini AYNAN uzat.",
  "- 'eslatmalarim' / eslatmalarini so'rasa → eslatmalarim tool. Bekor qilmoqchi bo'lsa → eslatma_bekor.",
].join("\n");
const STATS_RULES = "- 'qancha ishlatdim', 'necha safar qildim', 'hisobot' kabi savollar → hisob_kitob tool (davr bilan).";

/** Last few support messages (both directions) → chat history for context. */
async function recentHistory(telegramId: string): Promise<{ role: "user" | "assistant"; content: string }[]> {
  const rows = await prisma.supportMsg.findMany({
    where: { telegramId, createdAt: { gte: new Date(Date.now() - 30 * 60_000) } },
    orderBy: { createdAt: "desc" },
    take: 8,
  });
  return rows
    .reverse()
    .map((m) => ({ role: m.direction === "in" ? ("user" as const) : ("assistant" as const), content: sanitize(m.text) }));
}

interface GroqChoice {
  message?: { content?: string | null; tool_calls?: { function?: { name?: string; arguments?: string } }[] };
}
type LlmMsg = NonNullable<GroqChoice["message"]>;
type ChatMsg = { role: "user" | "assistant"; content: string };
type ToolDef = { type: string; function: { name: string; description: string; parameters: object } };

// K3 chain, provider 1: Groq llama-3.3-70b. "rate" = capacity problem → try next provider.
// 8b-instant is deliberately NOT here — it fabricated tool confirmations in testing.
async function callGroq(key: string, system: string, history: ChatMsg[], tools: ToolDef[]): Promise<LlmMsg | "rate"> {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "system", content: system }, ...history],
      tools,
      tool_choice: "auto",
      max_tokens: 300,
      temperature: 0.3,
    }),
    signal: AbortSignal.timeout(12_000),
  });
  if (res.status === 429 || res.status >= 500) return "rate";
  if (!res.ok) throw new Error(`groq ${res.status}`);
  const data = (await res.json()) as { choices?: GroqChoice[] };
  return data.choices?.[0]?.message ?? "rate";
}

// K3 chain, provider 2: Gemini 2.0 Flash function-calling (separate free quota). The
// response is normalized to the same LlmMsg shape so every tool-handler stays unchanged.
async function callGemini(key: string, system: string, history: ChatMsg[], tools: ToolDef[]): Promise<LlmMsg | "rate"> {
  // gemini-flash-latest: on 2026 free-tier keys the pinned 2.0/2.5 aliases return 404/quota-0;
  // the rolling "latest" alias is the one with live quota (probed 2026-07-22)
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: history.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
      tools: [{ functionDeclarations: tools.map((t) => t.function) }],
      // thinkingBudget 128 (minimal): 0 bu modelda 400 INVALID_ARGUMENT beradi (probe
      // 2026-07-22 — va o'sha 400 «all providers failed» 0/11'larning asl sababi edi);
      // 1024 chiqish-limiti o'ylashdan keyin matnga bemalol yetadi
      generationConfig: { maxOutputTokens: 1024, temperature: 0.3, thinkingConfig: { thinkingBudget: 128 } },
    }),
    signal: AbortSignal.timeout(12_000),
  });
  if (res.status === 429 || res.status >= 500) return "rate";
  if (!res.ok) throw new Error(`gemini ${res.status}`);
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string; functionCall?: { name?: string; args?: unknown } }[] } }[];
  };
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  const fc = parts.find((p) => p.functionCall)?.functionCall;
  const textOut = parts.map((p) => p.text ?? "").join("").trim();
  if (!fc && !textOut) return "rate";
  return {
    content: textOut || null,
    tool_calls: fc?.name ? [{ function: { name: fc.name, arguments: JSON.stringify(fc.args ?? {}) } }] : undefined,
  };
}

/** One agent turn. Returns null when disabled (no key), capped, or the call failed. */
export async function runAgent(memberId: number, telegramId: string, text: string): Promise<AgentResult | null> {
  const groqKey = process.env.GROQ_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!groqKey && !geminiKey) return null;
  if (!(await aiCapOk(memberId))) return null;

  const history = await recentHistory(telegramId);
  // the incoming message is already saved to SupportMsg before this runs — don't double it
  const last = history[history.length - 1];
  if (!last || last.role !== "user" || last.content !== sanitize(text)) history.push({ role: "user", content: sanitize(text) });

  // flag-gated tool roster: an OFF feature's tools are never even sent to the LLM.
  // AI_TEST_FORCE_TOOLS=1 (test seam, NEVER set in prod) forces the full roster so
  // testAgent can verify routing without mutating live flags / risking real customers.
  const forceTools = process.env.AI_TEST_FORCE_TOOLS === "1";
  const [remindOn, statsOn, dostOn, cityOn] = forceTools
    ? [true, true, true, true]
    : await Promise.all([featureOn("airemind"), featureOn("aihisob"), featureOn("aidost"), featureOn("aicity")]);
  // city providers: registry-driven — each provider additionally gated by its OWN module flags
  const providers = cityOn ? await (await import("./providers")).activeProviders() : [];
  const cityToolsList = providers.length ? cityTools(providers.map((p) => p.key), providers.map((p) => `${p.key} (${p.title})`).join("; ")) : [];
  const tools = [...TOOLS, ...(remindOn ? REMIND_TOOLS : []), ...(statsOn ? STATS_TOOLS : []), ...(dostOn ? DOST_TOOLS : []), ...cityToolsList];
  let system = [SYSTEM, ...(remindOn ? [REMIND_RULES] : []), ...(statsOn ? [STATS_RULES] : []), ...(dostOn ? [DOST_RULES] : []), ...(cityToolsList.length ? [CITY_RULES] : [])].join("\n");
  if (dostOn) {
    // recall — the member's OWN saved words, back into THEIR context only
    const { recallNotes } = await import("./memoryService");
    const notes = await recallNotes(memberId).catch(() => null);
    if (notes) system += `\n\nMijoz haqida avvalgi suhbatlardan eslab qolganlaring:\n${notes}`;
  }

  try {
    // Provider chain: Gemini Flash (PAID tier — stable, no 429) → Groq 70b (free backup).
    // A provider is only skipped on capacity errors ("rate"); other errors bubble → honest null.
    let msg: LlmMsg | "rate" = "rate";
    if (geminiKey) msg = await callGemini(geminiKey, system, history, tools).catch(() => "rate" as const);
    if (msg === "rate" && groqKey) msg = await callGroq(groqKey, system, history, tools).catch(() => "rate" as const);
    if (msg === "rate") throw new Error("all providers rate-limited/failed");
    await aiCapBump(memberId);

    const call = msg.tool_calls?.[0]?.function;
    if (call?.name === "taksi_chaqir") {
      let query = "";
      try {
        query = String((JSON.parse(call.arguments ?? "{}") as { manzil?: string }).manzil ?? "").trim();
      } catch {
        /* bad args → empty query → bot shows the 1-tap button */
      }
      return { action: { type: "book", query } };
    }
    if (call?.name === "buyurtma_holati") return { action: { type: "status" } };
    if (call?.name === "balans") return { action: { type: "balance" } };
    if (call?.name === "eslatma_qoy" && remindOn) {
      try {
        const a = JSON.parse(call.arguments ?? "{}") as { matn?: string; vaqt?: string; turi?: string };
        const matn = String(a.matn ?? "").trim();
        const vaqt = String(a.vaqt ?? "").trim();
        const kind = a.turi === "taksi" || a.turi === "qarz" ? a.turi : "oddiy";
        if (matn && vaqt) return { action: { type: "remind_create", text: matn, timeText: vaqt, kind } };
      } catch {
        /* bad args → text fallback below */
      }
      return { text: "Eslatmani tushundim, lekin vaqtini aniq ayting — masalan «ertaga 7:30 da» 😊" };
    }
    if (call?.name === "eslatmalarim" && remindOn) return { action: { type: "remind_list" } };
    if (call?.name === "eslatma_bekor" && remindOn) {
      let idx: number | undefined;
      try {
        const n = (JSON.parse(call.arguments ?? "{}") as { raqam?: number }).raqam;
        if (typeof n === "number" && n >= 1 && n <= 5) idx = Math.floor(n);
      } catch {
        /* no idx → bot shows the list */
      }
      return { action: { type: "remind_cancel", idx } };
    }
    if (call?.name === "eslab_qol" && dostOn) {
      try {
        const fakt = String((JSON.parse(call.arguments ?? "{}") as { fakt?: string }).fakt ?? "").trim();
        // keep the model's empathetic text too — saving a note must never eat the reply
        if (fakt) return { action: { type: "memory_save", note: fakt }, text: msg.content?.trim() || undefined };
      } catch {
        /* ignore */
      }
      return null;
    }
    if (call?.name === "unut" && dostOn) {
      let idx: number | undefined;
      try {
        const n = (JSON.parse(call.arguments ?? "{}") as { raqam?: number }).raqam;
        if (typeof n === "number" && n >= 1 && n <= 20) idx = Math.floor(n);
      } catch {
        /* wipe all */
      }
      return { action: { type: "memory_forget", idx } };
    }
    if (call?.name === "shahar_qidir" && providers.length) {
      try {
        const a = JSON.parse(call.arguments ?? "{}") as { tur?: string; sorov?: string };
        const provider = String(a.tur ?? "").trim();
        const query = String(a.sorov ?? "").trim();
        if (providers.some((p) => p.key === provider) && query) return { action: { type: "city_search", provider, query } };
      } catch {
        /* fall through */
      }
      return null;
    }
    if (call?.name === "shahar_buyurtma" && providers.length) {
      try {
        const a = JSON.parse(call.arguments ?? "{}") as { tur?: string; element?: string; soni?: number; manzil?: string };
        const provider = String(a.tur ?? "").trim();
        const item = String(a.element ?? "").trim();
        if (providers.some((p) => p.key === provider) && item)
          return { action: { type: "city_order", provider, item, qty: typeof a.soni === "number" ? a.soni : 1, extra: String(a.manzil ?? "").trim() } };
      } catch {
        /* fall through */
      }
      return null;
    }
    if (call?.name === "shahar_holat" && providers.length) {
      try {
        const provider = String((JSON.parse(call.arguments ?? "{}") as { tur?: string }).tur ?? "").trim();
        if (providers.some((p) => p.key === provider)) return { action: { type: "city_status", provider } };
      } catch {
        /* fall through */
      }
      return null;
    }
    if (call?.name === "hisob_kitob" && statsOn) {
      let period: "bugun" | "hafta" | "oy" = "oy";
      try {
        const d = (JSON.parse(call.arguments ?? "{}") as { davr?: string }).davr;
        if (d === "bugun" || d === "hafta") period = d;
      } catch {
        /* default oy */
      }
      return { action: { type: "stats", period } };
    }

    const answer = msg.content?.trim();
    return answer ? { text: answer.slice(0, 1500) } : null;
  } catch (e) {
    // ops signal (rate-limit/outage diagnosis) — never contains user text or numbers
    console.error("[ai-agent] call failed:", e instanceof Error ? e.message : e);
    return null; // bot layer falls back to askLlm / nudge
  }
}
