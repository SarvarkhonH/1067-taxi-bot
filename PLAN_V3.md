# 1067 — MASTER PLAN v3 · Dunyodagi eng mukammal taxi-buyurtma boti

> v2 (PLAN.md) geymifikatsiya va vizyonni qurdi. **v3 — taxi-buyurtma yadrosini dunyo darajasiga ko'taradi.** Gamifikatsiya endi *moat* (himoya), taxi esa *mahsulot*. Bu hujjat har bir holatni (edge case) — ayniqsa nosozliklarni — qamrab oladi.

---

## 0. Bitta jumlada — nega dunyoda yagona

> **Telegram ichida, ilovasiz, AI bilan suhbatlashib taxi chaqirasan; safar senga cashback to'laydi; o'sha cashback bilan o'yin o'ynaysan; oilangga, telefoni yo'q onangga ham buyurtma berasan; backend yiqilsa ham buyurtmang yo'qolmaydi — operatorga o'tadi.** Hech bir taxi ilovasi bu beshtasini birga bermaydi.

**Unique wedge (5 ustun, birga = takrorlanmas):**
| # | Ustun | Dunyoda kim qiladi | Biz nega yagonamiz |
|---|-------|--------------------|--------------------|
| 1 | Ilovasiz, to'liq Telegram-native ride-hailing | qisman (ba'zi botlar) | Uber darajasidagi xarita+kuzatuv+narx **Telegram ichida** |
| 2 | Cashback = o'yin valyutasi (yopiq halqa) | hech kim | safar → cashback → o'yin → withdraw, bitta ledger |
| 3 | AI suhbat + mahalliy manzil ("Oqtepa yonida") | hech kim | rasmiy manzil zaif O'zbekistonga moslangan |
| 4 | Oila/birovga buyurtma + telefoni yo'q odamga | kam | kas1067 telefon bo'yicha kalitlaydi — tabiiy mos |
| 5 | Backend yiqilsa ham yiqilmaydigan buyurtma | deyarli hech kim | graceful degradation 1-darajali feature |

---

## 1. BOSH PRINSIP — "Roviy hech qachon yiqilmaydi" (Never fail the rider)

Bu — v3 ning yuragi. Bugun aniqlandi: bot kas1067'ga ulanolmay **502** qaytaryapti. Dunyodagi eng yaxshi taxi boti hech qachon foydalanuvchiga xom xato ko'rsatmaydi.

**Degradatsiya zinapoyasi (har bir tashqi bog'liqlik uchun):**
| Bog'liqlik | Normal | Sekin/xato | To'liq o'lik |
|---|---|---|---|
| kas1067 (buyurtma) | jonli dispatch | retry + "biroz kutamiz" | **buyurtma navbatga → operatorga SMS/qo'ng'iroq + foydalanuvchiga "operator chaqirmoqda"** |
| kas1067 (narx) | jonli rate-card | oxirgi cache'langan tarif | taxminiy diapazon ("~12–15 ming") |
| kas1067 (cashback yozish) | darhol | navbatga, idempotent retry | ledger'da "pending", keyin reconcile |
| Telegram API | webhook | retry + polling fallback | navbat, qayta yuborish |
| Render uyqu (cold start) | issiq | keep-warm ping | birinchi so'rovga "bir soniya..." skeleton |
| Internet yo'q (foydalanuvchi) | — | offline banner | oxirgi holatni ko'rsat, qayta ulanishda sync |

**Texnik qoidalar:**
- **Circuit breaker** har tashqi chaqiriqqa (kas1067 3 marta yiqilsa — 30s ochiq, fallback).
- **Outbox/queue pattern** — buyurtma avval BIZNING bazaga yoziladi (`status=REQUESTED`), keyin async kas1067'ga. kas yiqilsa — buyurtma yo'qolmaydi, navbatda turadi.
- **Idempotency key** har buyurtma/grantда (double-tap, retry, duplicate webhook → bir marta bajariladi).
- **Operator fallback** — kas o'lik bo'lsa, buyurtma operator paneliga + Telegram operator-guruhiga tushadi, qo'lda dispatch.
- **Hech qachon 502/500 ko'rsatma** — har xato foydalanuvchi tilida: "Hozir biroz sekin, 10 soniyada chaqiramiz 🙏".

---

## 2. ⭐ BUYURTMA HOLAT MASHINASI — har holat, har nosozlik (markaz)

Bu jadval — "hamma caselar"ning asosi. Har holat va undan chiqadigan **nosozlik o'tishlari** aniq belgilangan.

| Holat | Normal keyingi | Nosozlik o'tishlari va ishlov |
|---|---|---|
| **DRAFT** (manzil yig'ilyapti) | QUOTED | app yopildi → 24s draft saqlanadi, qaytsa davom etadi · GPS yo'q → manzil/landmark/saqlangan |
| **QUOTED** (narx ko'rsatildi) | CONFIRMED | narx eskirdi (>2 daq) → qayta hisobla · foydalanuvchi rad etdi → DRAFT |
| **CONFIRMED** → kas'ga | SEARCHING | kas o'lik → **OUTBOX_QUEUED** (operator fallback) · dup-tap → idempotent, bitta |
| **SEARCHING** (haydovchi izlash) | ASSIGNED | timeout (no driver) → **NO_DRIVER** · surge → narx ogohlantirish + qayta tasdiq |
| **NO_DRIVER** | — | radiusni kengaytir / kut / operator / boshqa tarif / keyinroq eslat |
| **ASSIGNED** (haydovchi qabul qildi) | EN_ROUTE | haydovchi bekor qildi → **REASSIGN** (avto qayta izlash, foydalanuvchiga "yangi haydovchi qidiramiz") |
| **EN_ROUTE** (yo'lda) | ARRIVED | haydovchi qimirlamayapti (5 daq) → nudge/operator · noto'g'ri yo'nalish → ogohlantirish · GPS yo'qoldi → oxirgi nuqta + ETA freeze |
| **ARRIVED** (yetib keldi) | IN_PROGRESS | bepul kutish (3 daq) → keyin **WAITING_CHARGED** · mijoz chiqmadi → no-show oqimi |
| **WAITING** (kutyapti) | IN_PROGRESS | kutish haqi hisoblanadi (shaffof, jonli) · mijoz bekor → cancel-fee qoidasi |
| **IN_PROGRESS** (safar) | COMPLETED | yo'l o'zgardi → narx qayta · qo'shimcha to'xtash → +narx · GPS uzildi → masofani interpolatsiya · **SOS bosildi** → safety oqim · halokat → emergency |
| **COMPLETED** (yetib keldi) | SETTLED | — |
| **SETTLED** (to'lov + cashback) | RATED | cashback yozish kas-xato → pending + retry + refund kafolati · naqd kam → qoldiq qarz/keyingi |
| **RATED** | yopiq | past baho → support ticket · shikoyat → operator |
| **CANCELLED_CLIENT** | yopiq | assign'dan oldin → bepul · keyin → cancel-fee (shaffof, oldindan aytilgan) |
| **CANCELLED_DRIVER** | REASSIGN | haydovchiga jarima ball · mijozga uzr + tezkor qayta izlash + kichik cashback ("noqulaylik uchun") |
| **NO_SHOW_CLIENT** | yopiq | kutish haqi + ogohlantirish · takror → vaqtincha cheklov |
| **NO_SHOW_DRIVER** | REASSIGN | haydovchiga jarima · mijozга kompensatsiya |
| **FAILED** (tizim) | OUTBOX/operator | hech qachon foydalanuvchiga "error" — operator fallback |
| **EXPIRED** (taklif eskirdi) | DRAFT | narxni yangilab qayta taklif |

**Invariantlar (buzilmas qoidalar):**
- Bir foydalanuvchida bir vaqtda **bir faol buyurtma** (yangi chaqirsa — eskisini ko'rsat/bekor qil).
- Har holat o'zgarishi **audit-log**ga (kim, qachon, nega).
- Status update'lar **tartibsiz kelishi mumkin** (webhook) → versiya/timestamp bilan reconcile, eski update yangini bosib ketmaydi.
- Har pul harakati **idempotent + ledger** (ikki marta yozilmaydi).

---

## 3. MANZIL & JOYLASHUV — eng qiyin UX (O'zbekistonga moslangan)

Rasmiy manzil O'zbekistonda zaif. Bu — eng katta farqlash nuqtasi.

| Holat | Yechim |
|---|---|
| GPS aniq | pin + "shu yerdanmi?" tasdiq |
| GPS yo'q (ichkarida) | oxirgi joylashuv + qo'lda + saqlangan |
| GPS noaniq (bino orasida) | xaritani surib pin to'g'rilash, "qaysi darvoza?" |
| Rasmiy manzil yo'q | **landmark-based**: "Oqtepa bozori yonida", "5-maktab ro'parasida" → AI + kas joylar bazasi |
| Ovozli manzil | voice → matn → joy (AI concierge) |
| Katta obyekt (bozor/shifoxona) | qaysi kirish/darvoza tanlash (preset nuqtalar) |
| Uy/Ish saqlangan | bir bosishda (🏠 / 💼) |
| Oxirgi manzillar | tarixdan tez tanlash |
| Boshqa shahardan | xizmat hududidan tashqari → ogohlantirish + intercity oqim |
| Olib ketish nuqtasi ≠ joriy joy | "men boshqa joydaman" / "boshqa kishi uchun" |

**Texnik:** koordinata bilan dedup (PLAN v2'da bor), `cityBorders` poligon ichida tekshirish (bor), pin precision, reverse-geocode cache, landmark lug'ati (Koson uchun qo'lda + AI).

---

## 4. NARX DVIGATELI — barcha holatlar

| Holat | Ishlov |
|---|---|
| Oddiy A→B | clientTariffs rate-card + masofa (bor) |
| Surge (talab yuqori) | shaffof ko'rsat, oldin tasdiq ("1.3x — rozimisiz?") |
| Tungi tarif | vaqtga qarab avto |
| Qo'shimchalar | bagaj/moto/konditsioner/bolalar o'rindig'i → +narx (bor: ORQA/TEPA BAGAJ, MOTO) |
| Ko'p to'xtash | har to'xtash +narx, oldin ko'rsat |
| Kutish haqi | bepul 3 daq, keyin daqiqasiga, jonli sanab |
| Hudud ustamasi | manzil surcharge (bor) |
| Yo'l o'zgardi | safar oxirida qayta hisob, farqni tushuntir |
| 3 tarif (decoy) | Tejamkor/Standart/Komfort — o'rtasi anchor (bor: psixologiya) |
| Naqd ↔ cashback | qancha cashback qoplaydi, qoldiq naqd — aniq ko'rsat |
| Narx kafolati | ko'rsatilgan narxdan oshmaydi (yo'l/kutishdan tashqari, ular oldin aytiladi) |

---

## 5. MOSLASHTIRISH & DISPATCH — barcha holatlar

| Holat | Ishlov |
|---|---|
| Haydovchi bor | eng yaqin/eng yaxshi (ETA + reyting) |
| Haydovchi yo'q | radius kengaytir → kut → operator → keyinroq eslat |
| Hammasi band | navbat + "taxminan 5 daq" + jonli yangilanish |
| Haydovchi rad etdi | keyingisiga avto, foydalanuvchi sezmaydi |
| Qabul qildi-yu bekor qildi | tez REASSIGN + kompensatsiya |
| Uzoq ETA | oldin ogohlantir, bekor qilish opsiyasi |
| Adolatli taqsimot | haydovchilar orasida (anti-favoritizm, gamifikatsiya bilan) |
| Demand forecast (AI) | haydovchini issiq zonaga yo'naltir (PLAN v2: demand forecasting) |

---

## 6. 🛡 XAVFSIZLIK & ISHONCH QATLAMI — "dunyoda yagona" bandi

Konservativ/oilaviy mintaqa uchun bu — ASOSIY farqlash, qo'shimcha emas.

- **SOS tugma** — bir bosishda operator + oldindan belgilangan yaqinlarga lokatsiya.
- **Safarni ulashish** — jonli havola oilaga ("onam qayerda ekanini ko'rib tursin").
- **👩 Ayol-haydovchi opsiyasi** — ayol yo'lovchilar uchun (mintaqada juda talab).
- **Ishonchli kontaktlar** — avtomatik "yetib keldim" xabari.
- **Haydovchi tekshiruvi** — reyting, hujjat, mashina mosligi.
- **Yo'nalishdan chetga chiqish** — avto-aniqlash + "hammasi joyidami?".
- **Tungi safar rejimi** — qo'shimcha kuzatuv.
- **Maxfiy qo'ng'iroq** — raqamlar yashirin (masklangan).
- **Bola uchun safar** — ota-ona kuzatuvi.

---

## 7. BUYURTMA REJIMLARI — 10+ holat (ko'pchilik bot bermaydi)

| Rejim | Tavsif |
|---|---|
| Oddiy A→B | hozir |
| **Birov uchun** | onam/do'stim uchun — boshqa olib ketish nuqtasi, ularning telefoni |
| **Telefoni yo'q odamga** | kas1067 telefon bilan kalitlaydi → SMS bilan kuzatuv havolasi |
| **Rejalashtirilgan** | "ertaga 7:00 aeroportga" — eslatma + oldindan dispatch |
| **Takrorlanuvchi** | har kun ishxonaga (commute) — bir marta sozla |
| **Borib-kelish** | kutib tur, qaytar (wait & return) |
| **Ko'p to'xtash** | A→B→C |
| **Shaharlararo** | Koson→Qarshi (boshqa tarif/oqim) |
| **Yetkazib berish** | yo'lovchisiz, paket jo'natish (bir xil dispatch) |
| **Guruh/birgalikda** | bo'lishilgan safar (kelajak) |
| **Doimiy/korporativ** | tashkilot hisobiga (kelajak) |

---

## 8. ALOQA QATLAMI

- Masklangan qo'ng'iroq (maxfiylik) · in-app chat (driver↔client).
- **Balansi yo'q bo'lsa ham** qo'ng'iroq/aloqa (asosiy funksiya pulga bog'lanmaydi).
- Tayyor xabarlar ("5 daqiqada chiqaman", "pastdaman").
- **Til:** haydovchi/mijoz — o'zbek/rus/tojik (Koson tojik chegarasida) → preset xabarlar tarjimasi.
- Ovozli xabar → matn (AI).

---

## 9. TO'LOV — barcha holatlar

| Holat | Ishlov |
|---|---|
| Naqd (asosiy O'zbekistonda) | tasdiq, cashback baribir yoziladi |
| Cashback hamyon | balansdan, qoldiq naqd |
| Cashback yetmaydi | qancha qoplaydi + qoldiq naqd, aniq |
| Karta (kelajak) | Payme/Click integratsiya |
| Bo'lib to'lash | do'stlar bilan (kelajak) |
| Choy puli | ixtiyoriy, haydovchiga |
| Ortiqcha hisob | narx kafolati + nizo tugmasi |
| Refund | kas-xato/bekor → avto qaytarish (ledger) |
| Check | har safar elektron kvitansiya |

---

## 10. INKLYUZIVLIK & QULAYLIK

- **Keksalar rejimi** — katta tugma, ovoz, soddalashtirilgan.
- **Smartfoni yo'q** — birov orqali buyurtma + SMS kuzatuv.
- **Nogironlik** — maxsus transport (g'ildirakli kreslo), bola o'rindig'i.
- **Ayol-haydovchi** — yuqorida.
- **Til tanlash** — o'zbek (lotin+kirill), rus, tojik.
- **Past internet** — yengil rejim, kam trafik.

---

## 11. 🤖 AI CONCIERGE (Claude API — birinchi daraja)

- **Tabiiy tilda buyurtma**: "ertaga ertalab ishxonaga taxi" → to'liq buyurtma.
- **Landmark geocoding**: norasmiy manzilni joyga (mahalliy bilim).
- **Ovozli buyurtma**: voice → niyat → buyurtma.
- **Proaktiv**: "har kuni 8da chaqirasiz, avtomat qilaymi?".
- **Support**: nizo, savol, yo'qolgan narsa — AI birinchi liniya.
- **Churn/win-back, smart cashback, fraud-detection, demand forecast** (PLAN v2'dan — saqlanadi).

---

## 12. 🚖 HAYDOVCHI TOMONI — ikki tomonli

Roviy va haydovchi — ikkalasi ham o'yinchi. Haydovchini ushlamasak, taklif yo'q.

- Qabul/rad, navigatsiya, daromad jonli.
- **Smena maqsadi** (gamifikatsiya), balans, reyting, daraja, bonus.
- **Issiq zona xaritasi** (demand forecast) — qayerga borsa buyurtma ko'p.
- **Adolatli dispatch** — shaffof, favoritizmsiz.
- Haydovchi reytingi/jarima (no-show, bekor) — sifat halqasi.

---

## 13. 🎮 GAMIFIKATSIYA MOAT (qurilган — saqlanadi, qisqartirilgan)

PLAN v2 + S1–S4 to'liq qurilgan: 2 hamyon (cashback+coin), withdraw, 6 o'yin (g'ildirak/quti/poyga/crash/park/duel/viktorina), missiya/liga-tier/referral/streak/jackpot/surprise, xarita booking+kuzatuv. **82+ avtotest.** Bular endi *moat* — taxi yadrosi ustida.

> Yangi prinsip: **har o'yin mexanikasi taxi xulqini kuchaytirishi shart** (safar = eng katta ball, eng yaxshi cashback). O'yin o'yin uchun emas — safar uchun.

---

## 14. 🏗 INFRA · XAVFSIZLIK · DATA (bugungi topilmalar kiritilgan)

**Kritik (bugun aniqlandi):**
1. 🔴 **Bot UZB hostiga ko'chsin** — Render (Singapur) geo-deny bilan kas1067'dan uzilgan (502). UZB VPS → geo'dan o'tadi + **latency tushadi** + HTTPS arzon. Bitta harakat, uch muammo.
2. 🔴 **kas1067 HTTPS** — hozir plain HTTP, parol ochiq matnda. (Geo+rate qo'yildi, lekin transport hali ochiq.)
3. 🟠 **`bonusSecretKey "1303"` koddan env'ga** — public repoda turmasin (yoki repo private).
4. 🟠 **Outbox/queue + circuit breaker** — §1 degradatsiya uchun.

**Arxitektura (PLAN v2 + v3):**
- PostgreSQL (bor) · Redis (cache/queue/leaderboard) · WebSocket (kuzatuv) · object storage.
- Event-driven, idempotent grant (bor), audit-log (bor), RBAC, secret rotation.
- **Observability** — har buyurtma trace, dispatch metrics, alert (no-driver %, cancel %, kas-latency).
- Multi-tenant (shahar bo'yicha — Koson→keyingilar).

---

## 15. ✅ SIFAT DARAJASI — har edge case'ga test

Dunyo darajasi = isbotlangan ishonchlilik. Har §2–9 holati uchun:
- **Avtotest** (hozir 82+ → har yangi case +test).
- **Chaos test** — kas1067 o'lik/sekin holatини simulyatsiya, bot yiqilmasligini isbotla.
- **Idempotency test** — double-tap, duplicate webhook, retry → bir marta.
- **Reconciliation** — bizning ledger ↔ kas1067 har kuni solishtirish.
- **prodVerify kengaytirilsin** — booking lifecycle + degradation + cashback exactly-once.

---

## 16. 🗺 QAYTA TARTIBLANGAN ROADMAP

| Bosqich | Tema | Asosiy ish |
|---|---|---|
| **0 — HOZIR (kun-hafta)** | Hayotiy belgilar | Bot UZB host · kas1067 HTTPS · outbox/operator-fallback (502 yo'q) · "1303" env |
| **1 — Yadro mukammalligi** | §2 holat mashinasi to'liq | har nosozlik o'tishi, REASSIGN, no-show, cancel-fee, narx kafolati |
| **2 — Manzil+narx ustasi** | §3–4 | landmark AI, voice, surge, kutish-haqi, ko'p-to'xtash |
| **3 — Xavfsizlik qatlami** | §6 | SOS, safar ulashish, ayol-haydovchi, ishonchli kontakt |
| **4 — Buyurtma rejimlari** | §7 | birov-uchun, telefoni-yo'q, rejalashtirilgan, takrorlanuvchi |
| **5 — AI concierge** | §11 | tabiiy til + ovoz buyurtma |
| **6 — Haydovchi tomoni** | §12 | smena maqsadi, issiq zona, adolatli dispatch |
| **7 — Wallet/super-app** | PLAN v2 IX | P2P, marketplace, bill-pay, ekspansiya |

---

## 17. 📊 KPI — taxi mukammalligi (DAU'dan tashqari)

PLAN v2: DAU × D30. **v3 qo'shadi (taxi sifati):**
| Metrika | Maqsad |
|---|---|
| Buyurtma muvaffaqiyat % | >98% (dispatch'gacha yetdi) |
| Haydovchigacha vaqt (T2D) | median <4 daq |
| No-driver % | <2% |
| Bekor % (mijoz/haydovchi) | past + sabab tahlili |
| Narx aniqligi (taxmin↔real) | ±5% |
| **Backend-o'lik buyurtma yo'qolishi** | **0%** (outbox kafolati) |
| Xavfsizlik insidenti | 0, SOS javob vaqti |
| Cashback exactly-once | 100% (audit) |

---

## 18. NEGA LITERAL YAGONA — sintez

Alohida har biri bor dunyoda. **Birga — yo'q:**
Telegram-native Uber-tajriba **×** cashback-o'yin yopiq iqtisodi **×** AI mahalliy-manzil suhbati **×** oila/birov-uchun buyurtma **×** xavfsizlik qatlami **×** backend-yiqilsa-ham-ishlash **×** ikki-tomonli gamifikatsiya — **bir botda, bir mintaqaga chuqur moslashgan.**

Moat: tarmoq (referral) × wallet lock-in × kunlik odat × ma'lumot × **ishonchlilik reputatsiyasi** (hech qachon yiqilmaydi) × **xavfsizlik ishonchi**. Olti qatlam — ko'chmas.

---

### Darhol keyingi qadam
**Bosqich 0** — bot UZB hostiga + kas1067 HTTPS + outbox/operator-fallback. Bularsiz qolgan hammasi qum ustiga quriladi (bugun 502 buni isbotladi). Boshlaymizmi?
