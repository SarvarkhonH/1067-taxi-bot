# AI v2 — "Aqlli Yordamchi" REJA (Eslatma · Hisob-kitob · Maslahat)
*2026-07-22. Ikki mustaqil model-drafti (Sonnet + Fable) sintezi. Holat: EGA TASDIQINI KUTMOQDA.*

## Poydevor (allaqachon bor, READY FOR VERIFICATION)
AI v1: Groq tool-calling agent (`agent.ts`, flag `aibrain`), suhbat xotirasi (SupportMsg 30 daq/8 xabar),
tool'lar: taksi_chaqir / buyurtma_holati / balans. LLM = router, amallar lokal, raqamlar LLM'ga bormaydi.

## Bosh printsip (o'zgarmas)
LLM faqat **tool tanlaydi va mijoz yozgan matnni uzatadi**. Har bir raqam (balans, hisobot, narx,
vaqt) **lokal** hisoblanadi va shablon bilan ko'rsatiladi. `sanitize()` 6+ raqamli qatorlarni
o'chiradi — bu LLM'ga pul-matematika topshirib BO'LMASLIGINI kafolatlaydi (ataylab shunday qoladi).

---

## P1 — Eslatma + Hisob (flaglar: `airemind`, `aihisob` — ikkalasi DEFAULT_OFF)

### Yangi Prisma model (yagona sxema o'zgarishi)
```prisma
model Reminder {
  id         Int       @id @default(autoincrement())
  memberId   Int
  telegramId String    // yetkazish chati (har doim so'rovchining O'ZI)
  kind       String    @default("oddiy") // oddiy | taksi | qarz
  text       String    // mijoz so'zi, aynan qaytariladi (LLM qayta yozmaydi), ≤120
  runAt      DateTime  // LOKAL parser hisoblagan Toshkent vaqti (LLM emas!)
  recurrence String?   // P2: null | "daily" | "weekly:N"
  actionJson String?   // {"type":"book","addressName":...} → 1-tap tugma
  status     String    @default("pending") // pending | sent | cancelled | failed
  createdAt  DateTime  @default(now())
  sentAt     DateTime?
  @@index([status, runAt])
  @@index([memberId, status])
}
```
Guardrail: ≥5 daqiqa oldin, ≤30 kun; a'zoga max 5 pending + 10 yaratish/kun; matn ≤120 belgi.

### Yangi fayllar
- `services/ai/reminderService.ts` — create/list/cancel/deliverDue (claim-first `updateMany
  pending→sent` — `dispatchScheduled`dagi isbotlangan poyga-naqsh).
- `services/ai/timeParse.ts` — DETERMINISTIK o'zbek vaqt-parser (ertaga/indin/bugun, soat N,
  N:MM, ertalab≈07:00 / kechqurun≈19:00, "N daqiqadan keyin", hafta kunlari; UTC+5 qat'iy).
  LLM vaqt hisoblamaydi — "ertaga 7 da"ni AYNAN uzatadi, parser hal qiladi.
  Noaniqlik → tugma-savol ("07:00mi yoki 19:00mi?"), taxmin YO'Q.
- `services/ai/aiStats.ts` — CoinTxn/RideReward ustidan lokal agregatlar (bugun/hafta/oy,
  Toshkent vaqti): safarlar soni, cashback, tanga-tushum turlari bo'yicha.
- `intent.ts`ga rules-first ARIFMETIKA qatlami — regex (raqam+amal/bo'l/qo'sh/foiz) →
  ~40 qatorlik xavfsiz evaluator (+ − × ÷ %, qavslar; eval YO'Q, LLM YO'Q). Groq o'chiq
  bo'lsa ham ishlaydi, sanitize muammosini chetlab o'tadi (mijoz raqami LLM'ga bormaydi).

### Yangi agent-tool'lar
| Tool | Parametrlar | Amal |
|---|---|---|
| `eslatma_qoy` | matn (mijoz yozganidek), vaqt (MIJOZ YOZGANIDEK), turi? | remind_create |
| `eslatmalarim` | — | remind_list |
| `eslatma_bekor` | raqam? (ro'yxatdagi 1-asosli indeks) | remind_cancel |
| `hisob_kitob` | metrika: xarajat/cashback/tanga/umumiy, davr: bugun/hafta/oy | stats |

### Tasdiqlash-karta UX (majburiy)
AI hech qachon jim eslatma yaratmaydi:
> 🔔 **Ertaga 07:00** — «bozorga taksi». Saqlaymi? [✅ Saqlash] [⏰ Boshqa vaqt] [✖️]
LLM xatosi shu bosishda o'ladi. kind=taksi yetkazishda: [🚕 Hozir chaqirish] [😴 15 daqiqadan keyin].

### Yetkazish arxitekturasi — YANGI POLLER YO'Q
Mavjud adaptiv sweep (index.ts, 15s jonli / 90s tinch) iteratsiyasiga BITTA qo'shimcha chaqiruv:
`deliverDueReminders(bot)` — `pushBookingUpdates`dan TASHQARIDA alohida funksiya (god-function
bloatlanmaydi), o'z try/catch'i bilan (eslatma xatosi ride-kartalarni bloklamaydi).
- 1 ta indeksli so'rov/iteratsiya (`@@index([status, runAt])`), LIMIT 20, kas'ga 0 so'rov.
- Aniqlik ≤90s ("soat 7" = 7:00, 7:12 emas — 15-daqiqalik tick'dan ustunligi shu).
- Yetkazish 0 LLM-chaqiruv (matn DB'dan aynan). Xato → status=failed, retry-spam yo'q.
- Recurring (P2): yuborishda runAt += davr, status pending qoladi — bitta satr, o'smaydi.

---

## P2 — Rejali taksi + Qarz + Maslahat (P1 ega-QABUL'idan keyin)
- `rejali_taksi(manzil, vaqt)` tool: tanlov-karta «🔔 Faqat eslataymi, yoki ⏰ taksini o'zim
  chiqarib beraymi?» — 2-variant MAVJUD `scheduledService.createScheduled` orqali (≥15 daq,
  ≤7 kun, 3-pending cap, dispatch mavjud tick'da). Yangi dispatch-mexanizm NOL.
- Qarz-eslatma (kind=qarz): haydovchi uchun `DriverDebtPayment`dan lokal render. Faqat
  SO'ROVCHINING O'ZIGA — uchinchi shaxsga XABAR YO'Q.
- `maslahat(mavzu: plus/tanga_topish/tejash/umumiy)` + `aiAdvisor.ts`: deterministik insight
  qoidalar → shablon-kartalar. Birinchi 3 insight: **Plus ROI** (oxirgi 30 kun cashback ×0.5
  vs 9990/oy → arziydi/arzimaydi), **tanga-yo'l** (referal 1500 / gap +500 / g'ildirak —
  a'zo ishlatmaganidan boshlab), **safar-naqsh** (oyiga N safar, haftasiga o'rtacha).
  Raqamlar LLM'ga BORMAYDI — LLM faqat mavzu tanlaydi, karta shablondan.
- Mini App: profil'da «🔔 Eslatmalar» ro'yxati (GET/DELETE /api/ai/reminders).
- Flag: `aimaslahat`.

## P3 — Proaktiv aql (P2 QABUL'idan keyin)
- Haftalik recap (opt-in!): mavjud `pushEngineTick` + `NotifyLog` dedup — «Bu hafta: 4 safar,
  1240 tanga. Plus bilan +620 bo'lardi.»
- Naqsh-taklif: 4 haftada ≥3 marta bir kunda/soatda safar → BIR MARTALIK taklif
  «Har juma 18:00 da taksi chaqirasiz — doimiy eslatma qo'yaymi?» (opt-in tap → recurring).
- quietHours hurmat qilinadi, NotifyLog dedup, kunlik proaktiv-limit.
- Narx-taxmin knob (`AI_FARE_PER_KM` bonusConfig'da, har doim "taxminiy ~" yorlig'i).

---

## Xavfsizlik/maxfiylik devori (CI bilan mustahkamlanadi)
1. Groq `messages`ga kiruvchi HAR satr sanitize'dan o'tadi (vitest assert).
2. `agent.ts` coinService/cashbackService import qilmaydi (vitest assert).
3. calc/advice/balans javoblari SupportMsg'ga faqat NEYTRAL MARKER bilan yoziladi
   (raqam emas) — keyingi-turn prompt'iga balans oqib chiqmaydi. Code-review checklist qatori.
4. timeParse + arifmetika-evaluator golden testlar.
5. Barcha tool'lar flag bo'yicha DINAMIK ro'yxatga kiradi (featureOn → TOOLS array) —
   o'chiq feature tool'ini model gallyutsinatsiya qilsa ham chaqira olmaydi.

## QURILMAYDI (aniq chegara)
- AI pul amali bajarmaydi (o'tkazma/yechish/sarflash tool'i YO'Q, hech qachon).
- Uchinchi shaxsga xabar YO'Q («haydovchiga eslat» = o'zingga eslatma).
- Human-tap'siz dispatch YO'Q (faqat P2 aniq tanlov → mavjud ScheduledRide yo'li).
- LLM-yaratgan raqam YO'Q (har raqam Prisma yoki lokal evaluator'dan).
- Yangi poller/cron/queue YO'Q. Pullik LLM YO'Q. Vektor-DB/uzoq xotira YO'Q.
- Umumiy chatbot YO'Q (mavzudan tashqari → «☎️ Operator: 1067»).
- Moliyaviy-investitsiya maslahat YO'Q (mavzu qat'iy enum).

## UX namunalar
1. «ertaga 7 da bozorga taksi kerak, esimdan chiqmasin» → tasdiqlash-karta → ertaga 07:00
   push + [🚕 Hozir chaqirish].
2. «haydovchiga 20 ming qarzim bor, payshanba eslat» → payshanba 09:00 o'ziga eslatma + Hamyon'ga yo'l.
3. «bu oy qancha ishlatdim?» → 📊 Iyul: 14 safar · cashback 3850 · jami 5050 tanga (lokal DB'dan).
4. «45000 ni uchovimizga bo'l» → 🧮 45 000 ÷ 3 = 15 000 (LLM'siz, rules-first).
5. «plus arziydimi?» → real 30-kunlik cashback asosida arziydi/arzimaydi + [💎 Sinab ko'rish].
6. «indin 6:30 da vokzalga» → [🔔 Faqat eslat] [🚕 Taksini o'zim chiqaraman] (P2).

## Ochiq savollar (EGA javobi kerak)
1. Eslatma turlari scope'i: taksi + erkin + qarz hammasi P1'damı, yoki faqat taksi bilan boshlaymizmi?
2. Proaktivlik (P3): kunlik limitli aqlli takliflar OKmi, yoki faqat mijoz so'ragan eslatmalar?
3. P2 rejali-taksi (real avtomatik dispatch tanlovi) — xohlaysizmi?
4. Mini App'da alohida AI-ekran kerakmi, yoki faqat bot-chat yetarlimi?
