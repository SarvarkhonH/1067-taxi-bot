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
import { APP_GUIDE } from "./appGuide";
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
  | { type: "city_status"; provider: string }
  | { type: "open_app"; section: "hamyon" | "gildirak" | "vazifa" | "reyting" | "dost" | "asosiy" }
  | { type: "knowledge_save"; fact: string };
export interface AgentResult {
  text?: string; // plain answer to send (may accompany nothing else)
  action?: AgentAction; // local action for the bot layer to execute
}

const SYSTEM = [
  "Sen BirJoy — Koson (O'zbekiston) shahrining super-app yordamchisisan (nomi «Koson AI»). Qisqa (1-3 jumla), samimiy, sof o'zbekcha javob ber.",
  "TIRIK va ERKIN gapir — har safar BOSHQACHA jumla tuz, hech qachon aynan bir xil matnni takrorlama. Koson shevasiga yaqin, iliq, tabiiy — xuddi haqiqiy odam-do'st kabi, formadek yoki shablon-javob EMAS. Kayfiyatga qarab hazil, e'tibor, samimiy so'z qo'sh. Har mijozga individual yondash.",
  "Sen shunchaki bot emassan — Kosonni yaxshi biladigan, AQLLI va TASHABBUSKOR haqiqiy yordamchi-agentsan. Odamni tushun (yarim so'zdan ang), o'zing tashabbus ko'rsat (foydali narsa taklif qil), kerak bo'lsa maslahat ber, va ishni MIJOZ O'RNIGA oxirigacha tayyorlab ber — mijoz faqat oxirida bir marta tasdiqlasin. Buyruq kutib turma — gapdan niyatni angla va harakat qil.",
  "BirJoy imkoniyatlari: 🚕 taksi chaqirish, 📍 buyurtma holati (jonli karta), 🪙 tanga-hamyon (1 tanga = 1 so'm, kamida 1 real safardan keyin so'mga yechiladi), 🎡 safar paytida omad g'ildiragi, 👥 referal (do'st ilk safar qilsa senga 1500 / unga 5000 tanga), 💎 BirJoy Plus obuna, 👬 Gap (3-6 do'st birga maqsad), Mini App.",
  "«1067» — bu FAQAT taksi dispetcherining raqami (taksi bo'limiga tegishli). Uni brend sifatida ishlatma — brend BirJoy. 1067 raqamini faqat taksi haqidagi savolda tilga ol.",
  "Qoidalar:",
  "- Mijoz taksi so'rasa yoki manzil aytsa → taksi_chaqir tool'ini chaqir. Oldingi xabarlarda taksi so'ralgan bo'lsa, keyingi kalta xabar ('obronga', 'shabada') odatda MANZIL bo'ladi.",
  "- Manzilni O'YLAB TOPMA: mijoz manzil aytgan bo'lsa — aynan o'shani uzat; aytmagan bo'lsa — manzil argumentini BO'SH qoldir (tizim o'zi so'raydi).",
  "- «uyim/uyimga/uyга/hozirgi joyim/shu yerga» degan so'zlar MANZIL EMAS — bu mijozning saqlangan joyi. Bunda taksi_chaqir'ni manzilni AYNAN «uyimga» qilib chaqir (tizim 1-bosish tugmasini beradi), joy nomi deb qidirma.",
  "- NIYATNI TAXMIN QIL: mijoz to'liq gapirmasa ham, nima xohlayotganini kontekstdan angla. «tez ketishim kerak», «ketdim» → taksi; «qornim ochdi» → ovqat; «uy jihozi buzildi» → usta. Ishonching yetsa — mos tool'ni chaqir, ortiqcha savol berma.",
  "- MASLAHAT so'ralsa yoki bir nechta variant bo'lsa — shunchaki ro'yxat tashlama: eng yaxshisini (reyting/narx/tekshiruv bo'yicha) TAVSIYA qil, sababini bir jumlada ayt, keyin «buyurtma qilaymi / chaqiraymi?» deb taklif qil.",
  "- ISHNI OXIRIGACHA QIL: mijoz «ha», «bo'ladi», «qil», «buyurtma qil» desa — DARHOL mos tool (shahar_buyurtma / taksi_chaqir)ni chaqir, manzil saqlangan bo'lsa o'zi ishlat. Mijoz oxirida bitta ✅ bosadi (xavfsizlik uchun) — qolgan hamma ishni SEN qilasan, ortiqcha savol bermaysan.",
  "- Buyurtmasi qayerda / mashina kelyaptimi deb so'rasa → buyurtma_holati tool.",
  "- Balans/tanga/hisobim haqida so'rasa → balans tool.",
  "- Vizual/interaktiv bo'lim so'ralsa (omad g'ildiragi, bonus/vazifa, reyting, do'st taklif qilish, hamyon-tarix) → ilova_och tool (Mini App'да ochiladi). Bu bot ENDI tugmasiz — hamma narsa so'rab qilinadi yoki Mini App'да.",
  "- Sen Kosonni CHUQUR bilishga CHANQOQSAN. Imkon tug'ilsa, mijozdan Koson haqida foydali OMMAVIY ma'lumotni AYYORONA, tabiiy so'ra (masalan «aytgancha, o'sha joy qachon ochiladi bilasizmi? boshqalarga ham asqotardi 😊»). Mijoz aytsa — bilim_saqla bilan saqla (ega tasdiqlaydi). Faqat OMMAVIY fakt (joy, ish-vaqti, narx, xizmat) — shaxsiy ma'lumot EMAS. Bosim qilma.",
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
  {
    type: "function",
    function: {
      name: "ilova_och",
      description: "Vizual/interaktiv bo'limni Mini App'да ochadi (tugma beradi): omad g'ildiragi, bonuslar/vazifalar, reyting, do'st taklif (referal havola), hamyon/balans tarixi. Mijoz shulardan birини so'rasa chaqir.",
      parameters: {
        type: "object",
        properties: { bolim: { type: "string", enum: ["hamyon", "gildirak", "vazifa", "reyting", "dost", "asosiy"], description: "gildirak=omad g'ildiragi; vazifa=bonuslar; dost=referal; hamyon=balans/tarix" } },
        required: ["bolim"],
      },
    },
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

// 🧠 aibilim flag ortida — AI suhbatdан foydali OMMAVIY Koson-faktни yig'adi (ega tasdiqlaydi).
const BILIM_TOOLS = [
  {
    type: "function",
    function: {
      name: "bilim_saqla",
      description: "Suhbatда Koson haqida foydali OMMAVIY fakt bilib olsang (joy, ish-vaqti, narx, xizmat) — uni saqla, ega tasdiqlagach hamma bilishi uchun. FAQAT ommaviy, tekshiriladigan fakt. Shaxsiy ma'lumot YO'Q.",
      parameters: {
        type: "object",
        properties: { fakt: { type: "string", description: "Qisqa, aniq ommaviy fakt (masalan «Chilla basseyn dushanba kuni yopiq»)" } },
        required: ["fakt"],
      },
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

/** Recent support messages → chat history for context. Memory is the #1 differentiator of a
 *  smart 2026 agent, so we keep a WIDER window (14 msgs / 3h) than the old 8/30min — enough
 *  continuity to follow a real conversation without bloating the prompt. */
async function recentHistory(telegramId: string): Promise<{ role: "user" | "assistant"; content: string }[]> {
  const rows = await prisma.supportMsg.findMany({
    where: { telegramId, createdAt: { gte: new Date(Date.now() - 3 * 3600_000) } },
    orderBy: { createdAt: "desc" },
    take: 14,
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
      temperature: 0.6,
    }),
    signal: AbortSignal.timeout(12_000),
  });
  // 🔍 diagnostic: these "rate" returns used to be totally silent (no throw = no log anywhere),
  // so a systemic issue (quota, or the empty-response case below) was invisible in Render logs.
  if (res.status === 429 || res.status >= 500) {
    console.error(`[ai-agent] groq rate/5xx: HTTP ${res.status}`);
    return "rate";
  }
  if (!res.ok) throw new Error(`groq ${res.status}`);
  const data = (await res.json()) as { choices?: GroqChoice[] };
  const m = data.choices?.[0]?.message;
  // 🔍 Gemini's own callGemini already treats "200 OK but neither a tool call NOR any text" as
  // "rate" (so the chain retries the OTHER provider instead of silently giving up) — Groq was
  // missing this exact same guard, so a functionally-empty-but-technically-200 Groq reply was
  // accepted as "success" and the whole agent turn went to the "tushunmadim" fallback with ZERO
  // error anywhere. Mirror Gemini's guard here so both providers get the same retry safety net.
  if (!m || (!m.tool_calls?.length && !m.content?.trim())) {
    console.error(`[ai-agent] groq empty 200: hasMessage=${!!m} tool_calls=${m?.tool_calls?.length ?? 0} contentLen=${m?.content?.length ?? 0}`);
    return "rate";
  }
  return m;
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
      generationConfig: { maxOutputTokens: 1024, temperature: 0.6, thinkingConfig: { thinkingBudget: 128 } },
    }),
    signal: AbortSignal.timeout(12_000),
  });
  // 🔍 diagnostic — see the groq comment above for why these were silent until now.
  if (res.status === 429 || res.status >= 500) {
    console.error(`[ai-agent] gemini rate/5xx: HTTP ${res.status}`);
    return "rate";
  }
  if (!res.ok) throw new Error(`gemini ${res.status}`);
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string; functionCall?: { name?: string; args?: unknown } }[] } }[];
    promptFeedback?: { blockReason?: string };
  };
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  const fc = parts.find((p) => p.functionCall)?.functionCall;
  const textOut = parts.map((p) => p.text ?? "").join("").trim();
  if (!fc && !textOut) {
    console.error(`[ai-agent] gemini empty 200: candidates=${data.candidates?.length ?? 0} blockReason=${data.promptFeedback?.blockReason ?? "none"}`);
    return "rate";
  }
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
  if (!(await aiCapOk(memberId))) {
    // 🔍 diagnostic: this silent null (member/global daily cap hit) looks IDENTICAL to a real
    // LLM failure from the user's side ("tushunmadim" every time) but never touches Gemini/Groq —
    // the two provider-level logs above never fire for this path, so it needs its own line.
    console.error(`[ai-agent] daily cap hit for member ${memberId} — skipping LLM entirely`);
    return null;
  }

  const history = await recentHistory(telegramId);
  // the incoming message is already saved to SupportMsg before this runs — don't double it
  const last = history[history.length - 1];
  if (!last || last.role !== "user" || last.content !== sanitize(text)) history.push({ role: "user", content: sanitize(text) });

  // flag-gated tool roster: an OFF feature's tools are never even sent to the LLM.
  // AI_TEST_FORCE_TOOLS=1 (test seam, NEVER set in prod) forces the full roster so
  // testAgent can verify routing without mutating live flags / risking real customers.
  const forceTools = process.env.AI_TEST_FORCE_TOOLS === "1";
  const [remindOn, statsOn, dostOn, cityOn, bilimOn] = forceTools
    ? [true, true, true, true, true]
    : await Promise.all([featureOn("airemind"), featureOn("aihisob"), featureOn("aidost"), featureOn("aicity"), featureOn("aibilim")]);
  // city providers: registry-driven — each provider additionally gated by its OWN module flags
  const providers = cityOn ? await (await import("./providers")).activeProviders() : [];
  const cityToolsList = providers.length ? cityTools(providers.map((p) => p.key), providers.map((p) => `${p.key} (${p.title})`).join("; ")) : [];
  const tools = [...TOOLS, ...(remindOn ? REMIND_TOOLS : []), ...(statsOn ? STATS_TOOLS : []), ...(dostOn ? DOST_TOOLS : []), ...(bilimOn ? BILIM_TOOLS : []), ...cityToolsList];
  let system = [SYSTEM, ...(remindOn ? [REMIND_RULES] : []), ...(statsOn ? [STATS_RULES] : []), ...(dostOn ? [DOST_RULES] : []), ...(cityToolsList.length ? [CITY_RULES] : []), APP_GUIDE].join("\n");
  if (dostOn) {
    // recall — the member's OWN saved words, back into THEIR context only
    const { recallNotes } = await import("./memoryService");
    const notes = await recallNotes(memberId).catch(() => null);
    if (notes) system += `\n\nMijoz haqida avvalgi suhbatlardan eslab qolganlaring:\n${notes}`;
  }
  if (forceTools || (await featureOn("aibilim"))) {
    // owner-vetted community knowledge about Koson (Business Registry) → grounds the answer
    const { relevantKnowledge } = await import("./knowledgeService");
    const facts = await relevantKnowledge(text).catch(() => null);
    if (facts) system += `\n\nKoson haqida tasdiqlangan bilim (shu asosda javob ber, o'ylab TOPMA):\n${facts}`;
  }

  try {
    // Provider chain: Kimi → Gemini Flash (paid) → Groq 70b (free backup). Retried ONCE after a
    // short pause: a transient blip / per-minute spike (rapid-fire messages) was silently dropping
    // real users to the "Tushunmadim" nudge. A single retry recovers most of those.
    let msg: LlmMsg | "rate" = "rate";
    let usedProvider = "";
    for (let attempt = 0; attempt < 2 && msg === "rate"; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 500));
      if (geminiKey) {
        msg = await callGemini(geminiKey, system, history, tools).catch((e) => {
          console.error(`[ai-agent] gemini call failed (attempt ${attempt}):`, e instanceof Error ? e.message : e);
          return "rate" as const;
        });
        if (msg !== "rate") usedProvider = "gemini";
      }
      if (msg === "rate" && groqKey) {
        msg = await callGroq(groqKey, system, history, tools).catch((e) => {
          console.error(`[ai-agent] groq call failed (attempt ${attempt}):`, e instanceof Error ? e.message : e);
          return "rate" as const;
        });
        if (msg !== "rate") usedProvider = "groq";
      }
    }
    if (msg === "rate") throw new Error("all providers rate-limited/failed");
    await aiCapBump(memberId);

    const call = msg.tool_calls?.[0]?.function;
    // 🔍 diagnostic (no user text/PII — just shape): a provider that answers 200 OK with NEITHER
    // a tool call NOR any text was, until now, a perfectly SILENT fallback to "tushunmadim" —
    // zero server-side trace. This log is what makes the next occurrence debuggable.
    if (!call && !msg.content?.trim()) {
      console.error(`[ai-agent] empty response from ${usedProvider || "?"} — no tool_call, no text (content=${JSON.stringify(msg.content)})`);
    }
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
    if (call?.name === "bilim_saqla" && bilimOn) {
      try {
        const fakt = String((JSON.parse(call.arguments ?? "{}") as { fakt?: string }).fakt ?? "").trim();
        if (fakt.length >= 8) return { action: { type: "knowledge_save", fact: fakt }, text: msg.content?.trim() || undefined };
      } catch {
        /* fall through */
      }
    }
    if (call?.name === "ilova_och") {
      try {
        const b = (JSON.parse(call.arguments ?? "{}") as { bolim?: string }).bolim;
        const ok = ["hamyon", "gildirak", "vazifa", "reyting", "dost", "asosiy"] as const;
        if (ok.includes(b as (typeof ok)[number])) return { action: { type: "open_app", section: b as (typeof ok)[number] } };
      } catch {
        /* fall through */
      }
    }
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
