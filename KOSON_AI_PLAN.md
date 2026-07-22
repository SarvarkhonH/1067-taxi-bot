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

## K5 — 🧠 Life Graph + Needs Engine (Founder Bible §17.5 + §17.4 urug'i) — flag: `aigraf`
Ega yo'nalishi + Bible §17.5: «BirJoy eslab qoladi — har juma qayerga borasan, har oy qayerdan
xarid qilasan — va oldindan tayyorlaydi». Suhbatlar orqali odamga NIMA KERAKLIGINI aniqlaydi.
K4 do'st-xotira (MemberMemory) — shuning URUG'I; K5 uni strukturaviy + proaktiv qiladi.

**TEMIR SHART (Bible §12.3 — buzilmaydi):** hammasi FAQAT ochiq rozilik + to'liq halollik bilan.
«Ishonch kompaniyasi ma'lumotni qurolga aylantirmaydi — aks holda poydevor qulaydi.» «Meni unut»
har doim g'olib. Balans/telefon hech qachon graf'ga yozilmaydi. Admin-panelda ko'rinmaydi.

### K5.1 — QURILADI (arzon urug', hozir): strukturaviy xotira + ehtiyoj-sezgi
- `MemberMemory`ga `kind` (fakt | odat | ehtiyoj | voqea) + `expiresAt?` (voqea o'tsa tozalanadi;
  odat/fakt qoladi). Migratsiya additiv.
- **Ehtiyoj-sezgi passi** (yangi poller YO'Q — mavjud pushEngineTick + NotifyLog dedup):
  faol a'zoga N kunda BIR marta, 1 ta LLM-chaqiruv oxirgi SupportMsg+notes ustidan →
  0-2 «ehtiyoj» chiqaradi (masalan «har juma bozorga boradi», «to'yga tayyorlanyapti»,
  «onasi kasal — tashvishda»). Saqlanadi. BITTASI yumshoq proaktiv taklif bo'ladi
  (opt-in, quiet-hours, kunlik proaktiv-limit — K4-P3 naqshi): «Har juma bozorga chiqasiz —
  doimiy eslatma qo'yaymi? 😊» yoki «To'y tashvishi bormi? Fotograf/zal/osh — birga topamiz».
- Har taklifda [👍 Ha] [🔕 Bunday yozma] — «🔕» o'sha turdagi proaktivlikni butunlay o'chiradi.
- «Bu oy taksiga ko'p sarfladingiz» (Personal Economy urug'i) — aiStats ustiga quriladi
  (lokal, LLM raqam ko'rmaydi).

### K5.2 — DARVOZA oladi (Bible §17.10, hozir QURILMAYDI): to'liq Intent Engine + Life Graph
- **Intent Engine (§17.4):** «Ertaga to'yim bor» → AI fotograf+zal+osh+gul+taksi+video'ni bitta
  jarayonga yig'adi. «150 mingga tug'ilgan kun joyi top» → restoran+tort+gul+taksi bitta buyurtma.
  Darvoza: kamida 3-4 modul barqaror + Registry boyligi + AI-xarajatni ko'taradigan tushum
  (Bible mo'ljali 2027-2028). Provider-registry (K1) buning texnik poydevori — Intent Engine
  bir necha provider'ni ketma-ket bog'laydi.
- **Life Graph (§17.5):** sen→mashina→usta→sug'urta→benzin — bog'langan tugunlar. Darvoza:
  ma'lumot yetarli + maxfiylik/adolat qoidalari tayyor.
- Bu ikkisi rejada YOZILADI, lekin bugun kod YO'Q — «katta g'oya rad etilmaydi, darvoza oladi».

### Strategik filtr (Bible §17.2): har K5-xususiyat «City Graph'ni boyitadimi?»
Ehtiyoj-sezgi → HA (talab ma'lumoti). Personal Economy → HA (sarf naqshi). Shuning uchun
strategik — quriladi. Sof-chat o'yin-kulgi → City Graph'ni boyitmaydi → qurilmaydi.

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
5. **K5.1 — Life Graph urug'i** (strukturaviy xotira + ehtiyoj-sezgi passi; opt-in proaktiv,
   Bible §12.3 rozilik-shart bilan) → testAgent: ehtiyoj-ekstraksiya + proaktiv opt-out → QABUL.
Flaglar: aidost (do'st-rejim) · aicity (yadro master-gate) · aigraf (K5.1 Life Graph) —
hammasi aibrain ostida + har provider o'z modul-flagi.
K5.2 (to'liq Intent Engine + Life Graph) — Bible darvozasi ochilguncha (2027-2028) faqat rejada.

## 📍 HOLAT va QADAMLAR — «to'liq kuchli Koson AI» (2026-07-23)

### ✅ QURILGAN (jonli, test bilan)
- **Yadro:** Gemini Flash (pullik) → Groq zaxira, tool-calling. Rules-first (80% LLM'siz).
- **Taksi-agent:** chaqirish, holat, balans + suhbat-xotira.
- **Eslatma:** «ertaga 7 da / 3 daqiqadan keyin» — deterministik parser, sweep-yetkazish.
- **Hisob-kitob:** oylik hisobot + LLM'siz kalkulyator.
- **Do'st-rejim + xotira:** dardlashish + «eslab qol/unut» (MemberMemory).
- **Shahar-agent (K1):** provider-registry — restoran (buyurtma) + xizmat (139 usta, qidiruv).
- **🧠 Jamoaviy bilim (aibilim):** /bilim → odam yozadi → EGA tasdiqlaydi (owner-card + admin API)
  → AI grounding. Isbot: yuborilgan fakt tasdiqlangach AI «Zilola oshxonasi 6:00 da ochiladi»
  deb javob berdi. testBilim 10/10 ×3.
- Brend: BirJoy (Koson AI); 1067 faqat taksida.

### 🔜 QADAMLAR (ustuvorlik tartibida)
1. **Generic katalog-fabrikasi** — yangi qidiriladigan modul = ~10 qator config (adapter shart emas).
   Kelajakni yengil qiladi: «ertaga funksiya qo'shilsa AI o'zidan biladi».
2. **Bazar-provayderi** — do'kon/mahsulot qidiruv+xarid (mavjud buy-oqim).
3. **Reys + e'lonlar provayderlari** — fabrika ustidan tez.
4. **K5.1 Needs Engine** — odatlarni sezish + opt-in proaktiv taklif (Bible §17.5).
5. **Xizmat-buyurtma** — ustani ilova ichida band qilish (hozir faqat qo'ng'iroq).
6. **Butun bot BirJoy rebrend** — /start, admin, haydovchi matnlari.
7. **K5.2 Intent Engine** (Bible darvozasi 2027-2028) — «to'yim bor» → ko'p-xizmat yig'ish.

### Bilim-oqimi (aibilim) — qanday ishlaydi
`/bilim` → odam Koson-fakt yozadi → `AiKnowledge(pending)` → egaga owner-card [✅]/[❌]
(yoki admin panel: GET/POST /api/admin/knowledge) → tasdiqlangan fakt `relevantKnowledge`
(keyword-retrieval; KB kichik bo'lsa hammasi, katta bo'lsa top-8) orqali agent system-prompt'iga.
Maxfiylik: ommaviy shahar-bilimi, PII emas, pul yo'q. Kunlik limit 5/odam.

## 💡 NEEDS ENGINE (aineeds) — proaktiv AI, EHTIYOTKOR v0 (qurildi, DARK)
AI odam ODATLARINI sezib, o'zi birinchi yumshoq taklif yozadi. **Halol persuasion, aldov YO'Q**
(Bible §12.3 «ishonch kompaniyasi» — kichik shaharда aldov = block). Qurilgan v0 triggerlar:
- **T1 Habit-safar** (ertalab): oxirgi 4 haftaда bir kun ≥3× safar → o'sha kuni «Odatda [kun]
  yo'lga chiqasiz — taksi tayyor turaymi?» — perfect timing + personalization.
- **T2 Referral-urug'** (tushda): ≥3 safar qilgan, hech kim chaqirmagan → «Do'st chaqiring,
  2000+ tanga» — halol value-framing.
Guardrail (real mijozga xabar — eng ehtiyot): mavjud push (kunlik 2 + opt-out + tun 21-08 + dedup)
+ **haftalik 2 cap** + har xabarда **[🔕 Bunday yozma]** (bir bosishда butun proaktivni o'chiradi).
Yangi poller YO'Q (mavjud tick). Isbot: testNeeds 6/6 ×3 (opt-out/dedup/kunlik-cap/haftalik-cap).

### Persuasion texnikalari (halol, Hooked modeli — Bible §12)
Trigger→amal→o'zgaruvchan mukofot→investitsiya · loss-aversion (halol: «bepul g'ildiragingiz
yo'qolmasin») · social proof («qo'shnilaringiz ishlatyapti») · reciprocity · perfect timing ·
individual personalization. **QILINMAYDI:** soxta shoshilinch, yolg'on, zaiflikdan foydalanish.

## 🗺 TO'LIQ ROADMAP — nima qurildi, nima qoldi (2026-07-23)
### ✅ Qurilgan (jonli/DARK, test bilan)
Yadro (Gemini→Groq, Kimi ixtiyoriy) · rules-first · taksi-agent · eslatma · hisob/kalkulyator ·
do'st+xotira · shahar-agent (restoran buyurtma + xizmat qidiruv) · jamoaviy bilim (/bilim→ega→AI) ·
niyat-taxmin · «uyim» · maslahat-persona · Needs Engine v0 · BirJoy brend.

### 🔜 Qolgan ish (ustuvorlik bilan)
1. **Needs Engine v1** — AI-generatsiya shaxsiy xabar (LLM, Koson-shevasi), ko'proq trigger
   (hamyon/do'kon, tashlab ketilgan savat, ob-havo «yomg'ir — taksi?», bayram), A/B: qaysi ishlaydi.
2. **Generic katalog-fabrikasi** — yangi qidiriladigan modul = ~10 qator config (adapter shart emas).
3. **Bazar + reys + e'lonlar** provayderlari (fabrika ustidan tez).
4. **Xizmat-buyurtma** — ustani ilova ichida band (hozir faqat qo'ng'iroq).
5. **To'liq tavsiya** — agent qidiruv natijasini KO'RIB, aniq bitta joyni nomi+sababi bilan tavsiya.
6. **Ovoz** — odam yozmasdan gapiradi (Bible §17.6 «soatidan gapiradi»).
7. **Admin panel UI** — bilim-moderatsiya (API tayyor, UI qoldi) + AI-analitika (nima konversiya
   qiladi, xarajat).
8. **Butun bot BirJoy rebrend** — /start, admin, haydovchi matnlari.
9. **Kimi A/B baho** — kalit qo'yilgach sifat+narx solishtiruv.
10. **K5.2 Intent Engine** (Bible darvozasi 2027-28) — «to'yim bor» → ko'p-xizmat yig'ish.
11. **Life Graph** (Bible §17.5, gated) — sen→mashina→usta→benzin bog'langan tugunlar.

## Founder Bible bilan bog'lanish (BirJoy_Founder_Bible_v2, 19.07.2026)
Bu reja Bible §17 (City OS) ning AI qatlamini amalga oshiradi: §17.3 Mahalliy Google = K1
shahar_qidir · §17.4 Intent Engine = K5.2 (darvozali) · §17.5 Memory/Life Graph/Personal
Economy = K4+K5 · §17.6 Invisible App (Telegram birinchi eshik) = butun bot-agent yondashuvi.
Bible intizomi hurmat qilinadi: 90-kunlik fokus «SEVILISH» — AI mijozni sevishga xizmat qiladi,
ko'paytirishga emas; har katta g'oya darvoza oladi, bugungi fokusni buzmaydi.

## QURILMAYDI / O'ZGARMAS
- Tasdiqlash-kartasiz buyurtma YO'Q (yadro kafolati). AI to'lov o'tkazmaydi.
- Mijoz PII prompt'da YO'Q; public katalog-ma'lumot esa mumkin (bu «bilim»).
- Yangi poller YO'Q, vektor-DB YO'Q, pullik LLM YO'Q (hozircha), "coin" so'zi YO'Q.
- Modul flagi DARK → provider avtomatik roster'dan tushadi (ikki qavatli gate).
