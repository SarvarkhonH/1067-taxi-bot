# 🎮 KOSON O'YINI — YANGI AGENT UCHUN TO'LIQ BRIFING

> **Maqsad:** yangi AI-agent bu faylni o'qib, o'yin qanday ishlashini, nima buzuq va nima
> qilinmasligi kerakligini **kod o'qimasdan oldin** biladi. Har da'vo yonida manba bor.
> **Ishonchlilik belgilari:** ✅ = men kodda tasdiqladim · 🟡 = audit-agent hisoboti, qayta
> tekshirilsin · ⚪️ = ega so'zi / qaror.
>
> Oxirgi yangilanish: 2026-08-10. Avval `ARCHITECTURE.md` va `CLAUDE.md` ni o'qing.

---

## 1. ENG MUHIM GAP — bir jumlada

**O'yin qurilgan, ulangan, himoyalangan — LEKIN O'LIK.** Hech kim o'ynay olmaydi, chunki
katalogdagi eng arzon chipta ham erishib bo'lmaydigan darajada qimmat narxlangan. Bu — kod
xatosi emas, **ma'lumot (katalog) xatosi**. Flag hali `oyin` = **DARK** (jonli emas).

---

## 2. IKKI VALYUTA — ARALASHTIRISH TAQIQ

| | **TANGA** | **BALL** |
|---|---|---|
| Nima uchun | pul o'rnida, yechiladi/sarflanadi | FAQAT sovg'aga (chipta olish) |
| Manbai | `cashbackService.rollRideCashback` | `oyinService.computeBallMap` |
| Cheklov | **≤350/safar CLAMP** (buzilmas) | clamp'ga TEGMAYDI ✅ |
| Saqlanishi | `CoinTxn` + `member.points` | **saqlanmaydi — JONLI hisoblanadi** ✅ |

⚠️ **Ball hech qayerda «balans» sifatida yozilmaydi.** U har so'rovda `RideReward` va
`AppState` qatorlaridan **qayta hisoblanadi** (`computeBallMap`, `oyinService.ts:~276-560`) ✅.
Shuning uchun «ballni qo'shish» degan kod yo'q — manbani (safar, taklif, hikoya) o'zgartirasan.

---

## 3. BALL QAYERDAN KELADI

`computeBallMap` da (`oyinService.ts:502-524`) ✅. Har biri **econ-knob** bilan boshqariladi
(`packages/shared/src/economy.ts`, guruh «Koson O'yini»):

| Manba | Knob | Kod-default | ⚠️ JONLI holat |
|---|---|---|---|
| O'z safari (har biri) | `oyinRideBall` | 35 | 35 |
| Mavsumdagi 1-safar | `oyinFirstRideBall` | 100 | 100 |
| Telefon tasdiqlash | `oyinPhoneBall` | 20 | bir marta (2026-08-10 tuzatildi) |
| Do'st 1-safari | `oyinReferFirstRideBall` | 175 | 175 |
| Do'stning har safari | `oyinReferRideBall` | 10 | 10 |
| Gashtak navbatchisiga | `oyinJamoaBallPerRide` | 6 | 6 |
| Hikoya (admin tasdig'i) | `oyinStoryProofBall` | 100 | 100 |
| Kunlik topshiriq | `oyinDailyQuestBall` | 20 | 20 |
| Kunlik kirish | `oyinDailyLoginBall` | 1 | **0 — O'CHIRILGAN** |
| 3-kunlik zanjir | `oyinStreakBall` | 35 | **0 — O'CHIRILGAN** |

🔴 **QOIDA:** `getBonusEcon()` saqlangan DB-qiymatni (`AppState["bonus:econ"]`) kod-defaultdan
**USTUN** qo'yadi ✅. Ya'ni knobni kodda o'zgartirib push qilish **YETARLI EMAS** — VPS'da
alohida skript bilan jonli qiymat ham yangilanishi shart.

---

## 4. IQTISOD — buzilmas langarlar

`packages/shared/src/oyin.ts` ✅:
- `OYIN_SOM_PER_BALL = 20` — 1 ball «yuzi» 20 so'm
- `OYIN_SOM_PER_RIDE = 2000` — safar komissiyasi (ega raqami)
- `OYIN_PRIZE_MULTIPLIER = 3` + `oyinMinSellPct = 100`

**Shundan chiqadigan asosiy son:**
> **1 sarflangan ball ega uchun ≈ 6.67 so'm** (20 ÷ 3) — chunki sovrin faqat hamma chipta
> sotilganda o'ynaladi va o'shanda narxidan **3× ko'p ball** yig'ilgan bo'ladi.

⚠️ **YAGONA ZARAR HOLATI:** `oyinMinSellPct` yoki `OYIN_PRIZE_MULTIPLIER` pasaytirilsa —
qisman sotilgan sovrin o'ynalib, yig'ilgandan ko'p to'lanadi. **Bu ikkisiga TEGMANG.**

**Real biznes raqamlari** (ega bergan, 2026-08-10) ⚪️:
- Kasan 1067: **1956 buyurtma/oy** (~63/kun) · qo'ng'iroq 89.4% / ilova **10.6%**
- **21.5% rad etiladi** (haydovchi yetmaydi) — bu TA'MINOT to'sig'i
- Yo'l haqi ~62k/buyurtma (mijozniki) · **ega sof foydasi ~1700 so'm/buyurtma**

---

## 5. 🔴 NEGA O'YIN O'LIK — asosiy diagnoz

**Katalog xato narxlangan** 🟡 (`convertUzumToCatalog.ts:38,59` + `shared/oyin.ts:206-247`):
```
narx = qiymat / 20   (butun mahsulot qiymati ballda)
limit = 15           (qattiq kodlangan)
```
Natija: eng arzon sovrin (krossovka 105 910 so'm) = **5300 ball**. Lekin
`OYIN_MAX_REALISTIC_BALL = 4000` — ya'ni butun mavsumda yig'ib bo'ladigan maksimumdan ham
katta. **Hech kim birorta chipta ololmaydi.** iPhone = 450 000 ball (~12 857 safar).

**To'g'ri formula kodda BOR** (`oyinCardPlan` / `oyinPrizePlan`) va **admin paneli uni
to'g'ri ishlatadi** — faqat seed-katalog uni chetlab o'tgan.

**Rasmlar ham o'lik** ✅: seed `photoUrl` lari `images.uzum.uz/cjl6b340fdd0o0ip****` —
men `curl` bilan tekshirdim: **404**. Shuning uchun ilovada sovrin o'rnida emoji chiqadi.

**Yechim:** admin paneldan seed-sovrinlarni **o'chirib**, real sovrinlarni **real rasm** va
to'g'ri kalkulyator bilan bir-ma-bir qo'shish. Katalog bo'shatilsa **bo'sh qoladi** ✅
(`getCatalog`, `oyinService.ts:984-988` — «bo'sh massiv = eganing ongli qarori»).

---

## 6. LIVE-BLOKERLAR (bularsiz `oyin` flag YOQILMAYDI) 🟡

1. **Katalog** — yuqoridagi narx + rasm muammosi
2. **Huquqiy rekvizitlar bo'sh** — `miniapp/src/oyin.tsx:322-324`
   (`RULES_ORGANIZER` / `RULES_HANDOVER` / `RULES_CONTACT` = `""`). Lotereya-aksiya uchun
   tashkilotchi (STIR), topshirish joyi/muddati, shikoyat kontakti majburiy.
3. **Mavsum sozlanmagan** — admin «Sozlama»da start/end sana bo'lmasa `computeBallMap` bo'sh
   qaytadi, ball = 0, `buyTicket` → `season_off`.
4. Faqat shundan keyin: `setFeature("oyin", true)` + `EXPECTED_ON`ga qo'shish (jim toggle TAQIQ).

---

## 7. ⚠️ OCHIQ XAVFLAR (red-team + audit topgan) 🟡

| # | Xavf | Joy | Holat |
|---|---|---|---|
| 1 | **Soxta safar** — ball kas «delivered» signalidan zarb qilinadi, **komissiya FAKTIDAN emas**. Haydovchi+mijoz til biriktirsa daromadsiz ball → jismoniy sovrin | `cashbackService.ts:85` → `creditGashtakLedger` | **OCHIQ** |
| 2 | **Gashtak boshlig'i o'zini har oy navbatchi qila oladi** — `applySetTurn` «umrbod bitta navbat» qo'rig'ini ATAYLAB aylanib o'tadi | `oyinService.ts:2974-2982` | **OCHIQ** |
| 3 | **`oyinJamoaMaxBall` = 200 000/oy**, dizayn esa **3600** ni nazarda tutgan (55×) → #2 bilan birga bitta odam oyiga ~4 mln so'mlik ball | `economy.ts:~351` | **OCHIQ** |
| 4 | **To'lmagan sovringa sarflangan ball abadiy yonadi** — `minSell=100%` + `seasonClose` kuydiradi + oxirgi 48 soatda bekor qilib bo'lmaydi. 14/15 sotilsa 14 kishi ballsiz qoladi | `oyinService.ts:3210-3227`, `1327-1328` | **OCHIQ** |
| 5 | **Tiraj g'olibini admin QO'LDA tanlaydi** — kodda tekshiriladigan tasodifiylik yo'q | `adminRecordWinner:3081` | **OCHIQ** |
| 6 | Mijoz chipta oqibatini (yutdi/yutqazdi) ilovada **hech qachon bilmaydi** — push ham, natija-ko'rinish ham yo'q | — | **OCHIQ** |
| 7 | `cancelOwnTicket` da `withMemberLock` YO'Q — parallel bekor `oyin_sold` ni kam sanaydi | `oyinService.ts:1325-1351` | **OCHIQ** |

**MUSTAHKAM tomonlar (buzmang):** `seasonClose` qoldiq ballni **tangaga aylantirmay kuydiradi**
(pul faqat sovrin sifatida chiqadi — butun zararni cheklaydi) · `no_ride` darvozasi ·
`reserveSoldSlot` atomik SQL · telefon-dedup · `oyinMaxTicketsPerPrize = 3` · chipta-bekor
abuse to'liq yopilgan (`will_draw`/`final_lock`/`own_limit`).

---

## 8. RAQAMLI EGIZAK NIMA DEDI (P0–P4)

Lokal simulyatsiya real kodni ishlatib, real kas1067'ga kalibrlangan (`packages/server/src/sim/`):

- **Egizak real Kosonni qayta chiqaradi:** oylik rider **126 vs real 127** ✅, plato ✅,
  link/1-safar/retention konversiyalari ✅. Umumiy safar hajmini **~17% past** baholaydi
  (power-user «og'ir dumi» modellanmagan) — mutlaq raqamga emas, **yo'nalishga** ishoning.
- **A–H armlar (8 mexanika × 12 olam × 90 kun):** hech qaysi joriy mexanika safarni oshirmadi
  (cashback +0%, ball +0%, lotereya −1%, kichik sovrinlar +3%). Sabab: **hamma armda 0 chipta** —
  ball narxga yetmaydi, ya'ni o'yin simulyatsiyada ham o'lik (real bilan mos).
- **Strategik xulosa:** BirJoy to'sig'i **TALAB emas** — **ta'minot (21.5% rad) + ko'chirish
  (ilova 10.6%)**. Sovrin-o'yin yalang'och talabni pompalasa, rad devoriga uriladi.
  O'yin to'g'ri yo'nalishi: (a) qo'ng'iroq→ilovaga ko'chirish, (b) haydovchini zaif kunlarda
  online qilish, (c) retention + raqiblardan ulush.

Batafsil: `packages/server/src/sim/BASELINE.md`, `P1_DOD.md`, `sim-out/_predictions/*-verdict.md`.

---

## 9. QAT'IY QOIDALAR (buzilsa ish qaytariladi)

1. **Pul-to'lab-omad TAQIQ** — chipta/imkoniyat real pulga sotilmaydi. Yo'l faqat:
   pul → safar → ball → chipta.
2. **Yaqin-yutuq (near-miss) muhandisligi TAQIQ** — «1 raqam qoldi!» yo'q.
3. **Kunlik streak TAQIQ** — taksi hosila talab; kunlik zanjir soxta safarga turtadi.
4. **«coin» so'zi UI'da yo'q** — hamma joyda **«tanga»**.
5. **Har mexanika kill-switch flag ortida.** Flag toggle **har doim alert** beradi.
6. **Yashirin ehtimol yo'q** — imkoniyat foizi ochiq ko'rsatiladi.
7. **⛔ NEON'GA HECH NARSA YOZILMAYDI.** Baza VPS ichida (`localhost:5432/birjoy`).
   Lokaldan DB-skriptlar **ishlamaydi va ishlamasligi kerak**.
8. **Sxema o'zgarishi** — alohida ongli qadam, VPS'da, kod push'idan OLDIN.

---

## 10. ASOSIY FAYLLAR — jump-table

| Nima | Fayl |
|---|---|
| Ball hisobi, chipta, tiraj, gashtak, mavsum | `packages/server/src/services/oyinService.ts` (~3800 q.) |
| Ball manbai (safar → RideReward) | `packages/server/src/services/cashbackService.ts:85` |
| Knoblar (o'qish/yozish + clamp) | `packages/server/src/services/bonusConfig.ts` |
| Knob ta'riflari + defaultlar | `packages/shared/src/economy.ts` («Koson O'yini» guruhi) |
| Langarlar + narx-formulalar + seed-katalog | `packages/shared/src/oyin.ts` |
| Hikoya-isbot oqimi | `packages/server/src/services/oyinStory.ts` |
| Mijoz ekrani | `packages/miniapp/src/oyin.tsx` (~2600 q.) |
| Uy ekranidagi sovg'a-karta | `packages/miniapp/src/uy.tsx` (`KosonOyinCard`) |
| Admin (sovrin/mavsum/tiraj/gashtak/ball) | `packages/admin/src/App.tsx` (`OyinTab`) |
| Simulyatsiya (raqamli egizak) | `packages/server/src/sim/` |
| CI qalqoni | `simEconomy.ts` · `simLoyalty.ts` · `simGuards.ts` |

---

## 11. KEYINGI ISHLAR (ega bilan kelishilgan tartib)

1. **Katalogni tuzatish** — seed'ni o'chirib, real sovrinlar + real rasm + to'g'ri narx
2. **Admin'da rasm yuklash** (hozir faqat URL yozish) — haydovchi-rasm naqshi tayyor:
   base64 → Telegram → `file_id` → proksi. Reja tasdiqlangan, kod yozilmagan.
3. **Xavflar #1–#3 ni yopish** (soxta safar · gashtak navbat · cap 200 000)
4. **Huquqiy rekvizitlar** + mavsum sanasi → keyin `oyin` flagini yoqish
5. **Chipta raqami g'oyasi** ⚪️ (2026-08-10): har chiptaga abadiy takrorlanmas raqam, egaga
   doimiy bog'langan, tarixda turadi. 🟡 `nextGlobalTicketNo`/`gno` allaqachon bor deb
   xabar qilingan — **avval kodda tasdiqlansin**. Oshkoralik bo'yicha tavsiya: chipta
   olinganda faqat **umumiy son** ko'rinadi, **g'olib** esa ism+mahalla bilan ochiq.

---

## 12. DoD — «tayyor» deyishdan oldin

`CLAUDE.md` dagi 8 qoida amal qiladi. Eng muhimi:
- Builder **hech qachon «done» demaydi** — faqat **«READY FOR VERIFICATION»** + buyruq/natija isboti
- **Butun-repo** tekshiruvi, tor grep emas
- UI isboti = **REAL autentifikatsiyalangan render** (lokalda API bazaga bog'liq, shuning uchun
  jonli isbot faqat deploy'dan keyin ega telefonida)
- PROGRESS.md — **literal haqiqat**, aralashtirish yo'q

⚠️ **Shared-worktree ogohlantirishi:** bu ish-papkani bir necha sessiya baham ko'radi.
Commitdan oldin **har doim** `git diff --cached --name-only` bilan tekshiring — index'da
boshqa sessiyaning tugallanmagan ishi qolib ketishi mumkin (2026-08-10 da ikki marta yuz berdi).
