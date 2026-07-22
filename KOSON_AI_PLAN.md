# KOSON AI — universal shahar-agent (provider-registry arxitektura)
*2026-07-22 v2. Ega talabi: «qanday xizmat qo'shilsa ham FLEXIBLE ishlashi kerak» — modul-boshiga
qo'lda tool yozish YO'Q. Yangi xizmat = bitta adapter-fayl, AI avtomatik qamrab oladi.
AI_V2_PLAN P1 (eslatma+hisob — QURILDI) poydevor. Holat: EGA TASDIQINI KUTMOQDA.*

## Bosh g'oya: AI yadro + provider-plaginlar
AI yadrosi hech qanday modulni BILMAYDI. U faqat 3 ta universal tool ko'radi:

| Universal tool | Nima qiladi |
|---|---|
| `shahar_qidir(tur, sorov)` | tanlangan turdagi provider'dan qidiradi → top-3 karta |
| `shahar_buyurtma(tur, element, soni)` | tasdiqlash-karta → ✅ bosilsa provider o'z buyurtmasini yaratadi |
| `shahar_holat(tur)` | mijozning shu turdagi oxirgi buyurtmasi holati |

`tur` enum RUNTIME'da registry'dan quriladi — yangi provider qo'shilsa enum + tavsif
avtomatik kengayadi, agent.ts'ga TEGILMAYDI.

## Provider interfeysi (yangi xizmat = shu interfeys, ~60-100 qator)
```ts
// services/ai/providers/types.ts
export interface AiCard {              // universal natija-karta
  id: string;                          // provider ichki ID (buyurtma uchun)
  title: string;                       // "Osh — Milliy Taomlar"
  subtitle?: string;                   // "56 000 so'm · ⭐ 4.8 · 🏅 92-ball"
  buttons: { text: string; data: string }[]; // provider o'zi beradi (📞/🛒/📍)
}
export interface ConfirmCard {         // buyurtma-tasdiqlash
  html: string;                        // "🍽 2× Osh ... Rasmiylashtiraymi?"
  payload: string;                     // ✅ bosilganda provider.execute(payload)
}
export interface AiProvider {
  key: string;                         // "restoran" | "xizmat" | "bazar" | KELAJAKDAGI HAR QANDAY
  title: string;                       // enum-tavsif uchun: "restoran taomlari va dastavka"
  flags: FeatureName[];                // HAMMASI ON bo'lsa roster'ga kiradi (ikki qavatli gate)
  search(query: string): Promise<AiCard[]>;
  order?(memberId: number, tgId: string, itemId: string, qty: number): Promise<ConfirmCard | { error: string }>;
  execute?(memberId: number, tgId: string, payload: string): Promise<{ ok: boolean; message: string }>;
  status?(memberId: number): Promise<string | null>;
}
```
`services/ai/providers/index.ts` — registry: `register(provider)` + `activeProviders()`
(flag-filtrlangan). Yadro (agent.ts + bot.ts) FAQAT shu registry bilan gaplashadi.

## Yadro oqimi (bir marta quriladi, keyin o'zgarmaydi)
1. runAgent: activeProviders() → tur-enum + har provider title'i tool-tavsifga → Groq.
2. `shahar_qidir` → provider.search() LOKAL → kartalar bot-layer'da render (LLM'ga faqat
   topilgan PUBLIC title'lar qisqa kontekst sifatida qaytishi mumkin — narx/menyu public).
3. `shahar_buyurtma` → provider.order() → ConfirmCard → [✅] [✖️] tugmalar.
   ✅ callback `ai:exec:<key>` → provider.execute(payload) → natija-xabar.
   TASDIQSIZ HECH QANDAY buyurtma YO'Q — bu yadroda, provider chetlab o'ta olmaydi.
4. Mijoz PII (telefon/manzil) provider ICHIDA server-side olinadi — LLM ko'rmaydi.

## Birinchi 3 adapter (arxitektura isboti)
- **restoranProvider** — search: listActiveRestaurants+menyu keyword; order→ConfirmCard;
  execute→MAVJUD createFoodOrder (concierge: operator qo'ng'iroq, naqd, CoinTxn YO'Q);
  status→myFoodOrders. flags: ["restoran"].
- **xizmatProvider** — search: serviceDirectory.listListings (1067-tekshiruvi>verified>rating
  saralash) + 📞 trackCall tugma. order YO'Q (qo'ng'iroq-model). flags: ["xizmatlar"].
- **bazarProvider** — search: shop/bazar katalog; buyurtma-tugma MAVJUD buy-oqimga deep-link
  (tanga to'lov o'sha yerda, human-tap). flags: ["bazar"] yoki ["shop"].
Keyin: intercity, e'lonlar, taxi-paket... — har biri faqat bitta yangi fayl.

## «Koson bilimi» + aql (aibrain ostida, yadro qismi)
- RAG-lite: shahar_qidir natijalarining title/narxlari (PUBLIC) LLM-kontekstga — model fakt
  bilan tavsiya qiladi. ≤1200 token, 6h in-memory kesh. Vektor-DB YO'Q (tiny-VPS).
- Multi-provider LLM fallback tool-calling uchun: Groq 429 → Gemini Flash → OpenRouter free
  (bugungi testlarda ko'ringan limit yechimi).
- System-prompt: «Sen Koson AI'san — Koson shahrining universal yordamchisi».

## K4 — 💛 «Do'st-rejim»: emotsional AI + o'z-xotira (flag: `aidost`)
Ega talabi: «bot emotional AI bo'lishi, odamlar bilan dardlashishi, o'zi yozib eslab turishi».

**Emotsional suhbat (persona-qatlam, system-prompt):**
- Koson AI iliq, samimiy DO'ST: tinglaydi, qadrlaydi, qisqa hamdard javoblar, sof o'zbekcha
  («ha, og'ir kun bo'libdi...», «xafa bo'lmang...»). Nasihat-ma'ruza YO'Q, hukm YO'Q.
- QAT'IY chegara: u psixolog/shifokor EMAS — dori/tashxis/diniy-huquqiy maslahat bermaydi.
  Og'ir holat belgilari (o'ziga zarar, zo'ravonlik) → darhol iliq + ishonch raqamlari
  (103 tez yordam, 102, 1050 ishonch telefoni) + «yaqinlaringiz bilan gaplashing».
- Dardlashish suhbatlari ODDIY suhbat-limitga kiradi (kunlik cap himoya qiladi).

**O'z-xotira (auto-memory):**
- Yangi jadval `MemberMemory` (memberId, note ≤200, createdAt) — a'zoga max 20 ta, eng
  eskisi siqib chiqariladi.
- `eslab_qol(fakt)` tool — suhbatda muhim narsa chiqsa AI O'ZI qisqa yozib qo'yadi
  («ertaga imtihoni bor», «onasi kasal — tashvishda»). Mijozning O'Z so'zlari — faqat
  o'sha mijozning keyingi suhbat-kontekstiga qaytadi (boshqa hech qayerga).
- `unut(raqam?)` tool + «meni unut» → xotira o'chadi (mijoz nazorati).
- Kelajak voqea aytilsa → AI o'zi MAVJUD eslatma-oqimini taklif qiladi (tasdiqlash-karta
  bilan, avvalgidek): «imtihondan oldin eslataymi? 😊»
- Keyingi bosqich (opt-in, quiet-hours, NotifyLog): ertasiga o'zi so'raydi —
  «imtihon qanday o'tdi?» — mana shu «o'zi eslab turish» tuyg'usini beradi.

**Maxfiylik:** xotira-yozuvlar mijozning o'z aytganlari (balans/telefon EMAS) — shifrlangan
DB'da, faqat o'z suhbatida ishlatiladi, so'rovda o'chadi. Admin-panelda ko'rsatilMAYDI.

## Tartib va DoD
1. **K4 — Do'st-rejim** (tez g'alaba: persona + MemberMemory + eslab_qol/unut tool'lari;
   testAgent: dardlashish-scenariy → hamdard matn + xotira-scenariy → eslab_qol) → QABUL.
2. **K1 — yadro + registry + restoranProvider** (typecheck, testAgent kengaytma: generik
   qidir/buyurtma scenariylari stub-provider bilan; restoran-preview'da ega sinovi) → QABUL.
3. **K2 — xizmatProvider + bazarProvider** (adapter ≤100 qator ekanini isbotlash = flexibility
   DoD'i: "yangi provider qo'shish uchun yadroga tegilmadi" — diff bilan ko'rsatiladi) → QABUL.
4. **K3 — LLM-fallback zanjiri + Koson-bilim kontekst** → 3× yashil testAgent.
Flaglar: aidost (do'st-rejim) · aicity (yadro master-gate) — ikkalasi aibrain ostida +
har provider o'z modul-flagi.

## QURILMAYDI / O'ZGARMAS
- Tasdiqlash-kartasiz buyurtma YO'Q (yadro kafolati). AI to'lov o'tkazmaydi.
- Mijoz PII prompt'da YO'Q; public katalog-ma'lumot esa mumkin (bu «bilim»).
- Yangi poller YO'Q, vektor-DB YO'Q, pullik LLM YO'Q (hozircha), "coin" so'zi YO'Q.
- Modul flagi DARK → provider avtomatik roster'dan tushadi (ikki qavatli gate).
