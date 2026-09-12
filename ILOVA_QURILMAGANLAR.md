# ILOVA — UMUMAN QURILMAGANLAR

**Sana:** 2026-09-10 · **Qayta o'lchandi:** 2026-09-12 · **Manba:** uchta "va'da vs haqiqat" auditi (113 + 51 + 27 va'da)

> **2026-09-12 eslatma.** Bu ro'yxat ikki kun ichida eskirdi — quyidagi qatorlarning bir qismi
> endi qurilgan. Har o'zgargan qator **o'lchov buyrug'i bilan** belgilandi; o'lchanmagani
> tegilmadi. «Qurildi» degan har bir belgi shu kundagi grep yoki jonli sinovga tayanadi,
> xotiraga emas.

Bu ro'yxatda **faqat `YO'Q`** — ya'ni kodda bitta qatori ham yo'q narsalar. "Qisman" va
"yozilgan-lekin-ulanmagan" alohida bo'limda (ular arzonroq — kod bor, ulash kerak).

✅ = **qurildi** · 🆕 = **2026-09-12 da qurildi** · 🔒 = sizning qaroringiz/hisobingizga tiqilgan

---

# 1. UMUMAN QURILMAGAN — 0 QATOR

## 1.1 Telefoniya (MASTER sirt C) — **butun blok yo'q**
| Nima | Isbot | Nega kerak |
|---|---|---|
| **SIP / Asterisk / PBX ulanishi** | `asterisk\|freeswitch\|sip\|twilio\|jssip` → 0 natija | Buyurtmaning **89.4%** telefonda |
| **`/ring` ni chaqiradigan tomon** | haydovchi ilovasida telefoniya izi 0 | Popup qurilgan, lekin uni **hech kim ishga tushirmaydi** |
| **Qo'ng'iroq yozib olish** | `recording` → 0 | Nizo va sifat nazorati |
| **IVR** ("1 = o'sha joydan yana") | `ivr\|voicemail` → 0 | 1 748 qo'ng'iroq/oy, eng katta vaqt yeyuvchi |
| **Qo'ng'iroqlar tarixi ekrani** | `GET /operator/calls/recent` — **yagona uchrash: o'z ta'rifi** | Operator kim qo'ng'iroq qilganini ko'rmaydi |
| **`TELEFON_PLAN.md` ning O'ZI** | `Kontakt\|phoneBook\|telefonraw` → faqat hujjatning o'zi | Butun hujjat 0% |

## 1.2 Ratsiya (MASTER sirt D)
| Nima | Holat |
|---|---|
| **Server: klip qabul/saqlash/tarqatish** | ✅ **bugun qurildi** (6 route jonli) |
| **Haydovchi ilovasi: yozish + eshittirish** | ✅ `service/RadioManager.kt` |
| **Operator tugmasi (bosib gapirish)** | ✅ `components/operator/RadioPanel.tsx` |
| **Ratsiya orqali manzil belgilash** | ✅ `orders.destAddressId` + `destSource` (`'client'|'operator'|'radio'|'driver'`) · `PATCH /orders/:id/destination` |
| Ovoz **real qurilmada** sinalgani | ❌ — hech biri telefonda eshitilmagan (C bo'limi, TESTING-PLAN) |

## 1.3 Firibgarlik qalqoni (MASTER sirt G — 8 dan 1 tasi)
| Nima | Holat |
|---|---|
| **Mock-GPS bloki** | ✅ **bugun qurildi** |
| Imkonsiz tezlik (2 fix orasida 150 km/soat) | 🆕 `impossible_speed` — `fraud-e2e` jonli |
| Bir xil haydovchi↔mijoz juftligi takrorlanishi | 🆕 `pair_repeat` — `fraud2-e2e` jonli |
| Safar ichida GPS uzilishi | ❌ |
| Bekor qilish naqshi (qabul → 30s → bekor) | 🆕 `quick_cancel` — `fraud-e2e` jonli |
| No-show qoidalari (10 daq + 300 m) | 🆕 `no_show_streak` — `fraud2-e2e` jonli |
| Taksometr sakrashi / ortiqcha tezlik | 🆕 `meter_jump` · `meter_overspeed` |
| Ko'p akkaunt / bir qurilma | ❌ — `installId` endi yig'iladi (crash hisobotida), lekin hech kim solishtirmaydi |
| Reyting manipulyatsiyasi | ❌ va **hozircha ma'nosiz**: `driver_ratings` da 0 qator, manipulyatsiya qilinadigan narsa yo'q |

**Muhim:** yettitasi ham **faqat yozadi** — hech biri hech kimni bloklamaydi. Bu ataylab: signal jazoga aylanishidan oldin odam o'qib chiqishi kerak.

## 1.4 Analitika (MASTER sirt H) — **butun blok yo'q**
KPI paneli · tayinlash vaqti median/p95 · rad tarkibi paneli · O-D yo'nalish matritsasi ·
haydovchi 360 kartasi · devor tablosi.
*(✅ bugun: **bosilgan rad ≠ jim taymer** ajratildi — bu panelning eng muhim raqami endi yoziladi.)*

## 1.5 F2 — soya rejimi
`shadow\|dual-write\|mirrorBooking` → **0 natija**. Bu rejaning o'zi "eng qimmatli g'oya" va
**cutover'dan oldingi yagona xavfsizlik darvozasi" degan narsa.

## 1.6 TANGA birlashuvi (MASTER §5) — **yangi ish 0%**
| Nima | Holat |
|---|---|
| Safar → tanga **earn** yo'li | ❌ yo'q |
| Idempotent kalit = `dispatchBookingId` | ✅ **bugun** id-space qurildi (8 test) |
| B'ning parallel valyutasini to'xtatish | ⚠️ **kill-switch bugun**, birlashtirish ❌ |
| §5.5 uch metod (`addClientBonus`, `setClientBonus`, `getBonusRules`) | ❌ stub |
| Mijoz cashback hamyoni B'da | ❌ **#1 to'siq** |

## 1.7 Haydovchi ilovasi (MASTER sirt A — 17 dan 4 tasi)
| Nima | Holat |
|---|---|
| **FCM qabul qilish** | 🔒 `google-services.json` — Firebase |
| **Overlay taklif** (ekran yonadi + TTS) | ❌ 🔒 — FCM'siz ma'nosiz |
| **Offline navbat** | ✅ ulandi — `HomeViewModel` `pendingActions`, ekranda «Internet kutilmoqda — N ta amal saqlandi» |
| **BootReceiver** (reboot'dan keyin) | 🆕 `service/BootReceiver.kt` — paketlangan manifestda aapt2 bilan tasdiqlangan, **qurilmada emas** |
| Ratsiya (yozish/eshittirish) | ✅ `service/RadioManager.kt` |
| SMS yuborish (haydovchi SIM'idan) | ✅ v3 — `SmsGatewayManager.kt`; **shlyuz o'chiq** (`SMS_GATEWAY_ENABLED`, ega qarori) |
| "Nega buyurtma yo'q" ko'rsatkichi | 🆕 `ui/home/ShiftHealthRow.kt` — server uzildi / GPS to'xtadi / 20 daqiqadan beri taklif yo'q |
| Logout'dan keyin kuzatuv to'xtashi | ❌ (hozir davom etadi) |
| Crash hisoboti (release'da) | 🆕 `CrashReporter` + `POST /drivers/crash` — jonli 8/8 |
| Versiya darvozasi (eski build'ni to'xtatish) | 🆕 `GET /drivers/app-version` — uch yo'l bilan fail-open |
| Tanaffus tugmasi (butunlay oflayn chiqmasdan) | 🆕 `'break'` statusi + GPS teshigi yopildi |

## 1.8 Boshqalar
- **Zanjirli buyurtma** — Z1 **soya o'lchovi** jonli (`chain-e2e` 15/15): band haydovchi olishi mumkinmidi — faqat **yoziladi**, hali taklif qilinmaydi (Z2 = 14 kunlik o'lchovdan keyin)
- **Zona FIFO navbati** — modul bor, `getNextInQueue` **hech qachon chaqirilmaydi**
- **Broadcast dispatch** — 🔒 sizning qaroringiz
- **Prioritet = virtual metr** · **idle-time tenglashtirish** · **kunlik maqsad** · **haydovchi referali**
- **Doimiy safar** (takrorlanuvchi) · **Mening haydovchim** · **SMS kuzatuv havolasi**
- **Shaharlararo o'rindiq** — 🔒 A'da 10 model tayyor, siz o'chirgansiz
- **Pochta** — buyurtma+SLA mashinasi tayyor, "kim eltadi" ulanmagan
- **Korporativ avto-hisob** — jadval bor, safar balansdan **hech qachon yechmaydi**

---

# 2. YOZILGAN, LEKIN ULANMAGAN — *arzon yutuqlar*

Bularning kodi **bor**; faqat chaqiruvchi yoki UI yo'q.

*2026-09-12 da qayta o'lchandi — `incentives`, `queue`, `fleet` servislari o'z moduli tashqarisidan **0 marta** chaqiriladi, `getNextInQueue` yagona uchrashi o'z ta'rifi.*

| Modul | Hajm | Isbot |
|---|---|---|
| **`incentives`** | 7 endpoint | 0 chaqiruvchi; `incrementProgress()` hech qachon chaqirilmaydi |
| **`queue`** (zona navbati) | 2 endpoint + butun mexanika | 0 chaqiruvchi; faqat cron bo'sh jadvalni tozalaydi |
| **`fleet`** (avtopark egasi) | 6 endpoint | 0 chaqiruvchi, UI yo'q |
| **`sla`** | jadval bor, **modul yo'q** | 0 yozuvchi, 0 o'quvchi |
| **Zona/surge/pricing poligonlari** | 4 jadval | 🆕 `pricing_zones` da **2 zona** («Koson shahar» 2.5 km · «Koson tumani» 14 km, ikkalasi ×1.00, surge o'chiq, nuqta-poligon 5/5). `zone_pricing_rules` va `time_pricing_rules` **hamon bo'sh** |
| **`driver_daily_summary`** | jadval | ishlatilmaydi |
| **`GET commissions/{balances,summary/daily,revenue}`** | 3 endpoint | 0 chaqiruvchi |
| **`GET driver-documents/{pending,expiring}`** | 2 endpoint | 0 chaqiruvchi — hujjat muddati ogohlantirishi yo'q |
| **JAMOA smena moduli** (A) | 9 model | flag bilan o'chiq |
| **Shaharlararo** (A) | 10 model | flag bilan o'chiq |

---

# 3. 2026-09-10 DA QURILGANLAR ✅

manzil fuzzy qidiruvi (17 test) · operator alias jadvali · topilmaganlar navbati ·
ratsiya serveri · mock-GPS bloki · dispatch kill-switch · ball kill-switch ·
id-space (8 test) · `KAS_MODE=birjoy` qo'riqchisi · bosilgan rad ≠ jim taymer ·
CTI zanjirining 2 bo'g'ini · soyada qolgan 2 route · yo'q endpoint · telefon mosligi ·
audit jurnali · rol tekshiruvi · 2 xavfsizlik teshigi · systemd · zaxira · deploy skripti ·
**jonli kas1067 dan 649 haydovchi + 112 manzil**

## 3b. 2026-09-12 da qurilganlar 🆕

Zaxira (`pg_dump` → shifrlangan Telegram, **tiklash isbotlangan**) · HTTPS domen `taxi.birjoy.online` · 129 staff route'ga rol · qo'ng'iroq telemetriyasi · **onlayn vaqt** o'lchovi · halol ertalabki hisobot · surge qurolsizlantirildi · pog'onali tarif · «aytilgan narx = olingan narx» · komissiya pog'onasi + haydovchi kartasi · Koson zonalari · Android ruxsat o'lik ko'chasi · crash hisoboti · versiya darvozasi · tanaffus tugmasi · boot receiver · qo'lda biriktirish telefongacha · radius narvoni · poygada yutqazgan haydovchiga xabar · operator bir bosishda to'ldirish · qotib qolgan safardan chiqish · kuzatuv havolasi · `promos/validate` yopildi · **ikki sozlama ekrani halol qilindi** · **o'lik reyting signali** · **deploy qulfi**.

Tafsilot va isbot: `1067-taxi/PROGRESS.md`.

---

# 4. TARTIB — nimadan boshlash

| # | Ish | Nega birinchi |
|---|---|---|
| 1 | ~~Ratsiya: ilova + operator tugmasi~~ | ✅ qurildi (telefonda sinalmagan) |
| 2 | ~~Ratsiya orqali manzil belgilash~~ | ✅ qurildi — `destSource` bilan |
| 3 | **Zona FIFO navbatini ulash** | Modul yozilgan — eng arzon katta yutuq |
| 4 | ~~Offline navbat (ilova)~~ | ✅ ulandi |
| 5 | ~~No-show + firibgarlik qoidalari~~ | ✅ 7 signal yozadi (bloklamaydi — ataylab) |
| 6 | **KPI paneli** | 7 kun ma'lumot yig'ilgach rad tarkibi ma'lum bo'ladi |
| 7 | **Overlay taklif** | 🔒 Firebase |
| 8 | **Mijoz cashback hamyoni + 18 stub** | Cutover uchun |
| 9 | **F2 soya rejimi** | Cutover'dan oldingi darvoza |

🔒 **Firebase kelganda ochiladi:** FCM · overlay · ratsiya uyg'otish · uyg'otish kampaniyasi

---

## 5. 2026-09-12 dan keyin ro'yxatning ustki uchtasi

| # | Ish | Nega |
|---|---|---|
| 1 | **Real telefonda bitta safar** (`TESTING-PLAN` C1-C3) | Yuqoridagi «✅» larning birortasi ham qurilmada ishlatilmagan. Bu bajarilmaguncha qolgan hammasi taxmin |
| 2 | **Zona FIFO navbatini ulash** | Modul to'liq yozilgan, 0 chaqiruvchi — eng arzon katta yutuq |
| 3 | **Baho yig'ishning biror yo'li** | 89.4% telefon orqali keladi va baholaydigan akkaunti yo'q; shuning uchun `driver_ratings` **bo'sh**, sifat dispatch'da hisobga olinmaydi |
