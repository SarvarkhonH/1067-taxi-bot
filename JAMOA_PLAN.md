# JAMOA — Xodimlar menejmenti (davomat + oylik + kassa)

> Maqsad: ishxona xodimlarini (operator va boshqalar) BirJoy ichida boshqarish.
> Xodim Telegram botda "Keldim"/"Ketdim" bosadi → ish vaqti yoziladi → oyligi
> soatiga qarab AVTOMATIK hisoblanadi → ega har kuni bitta xabar bilan tasdiqlaydi.
> Excel/daftar yo'q. Hammasi bitta joyda, hammasi isbotli.

---

## 1. Mahsulot ko'rinishi (nima quriladi)

### 1.1 Xodim tomonida (Telegram bot)
- Ega xodimning Telegram ID sini admin panelga kiritadi → o'sha odam botda
  **"👔 Ish"** bo'limini ko'radi (boshqa hech kim ko'rmaydi).
- Ish boshida: **"✅ Keldim"** tugmasi → vaqt yoziladi, bot javobi:
  "Xayrli ish! 09:04 da keldingiz. Smena: 09:00–18:00."
- Ish oxirida: **"🏁 Ketdim"** tugmasi → bot javobi:
  "Bugun 8 soat 56 daqiqa ishladingiz. Hisoblandi: 114 500 so'm."
- Xodim istalgan payt **"📊 Mening hisobim"** bosadi: shu oy necha kun/soat
  ishladi, qancha hisoblandi, qancha pul oldi, qancha qoldi.
- Kechikish yumshoq eslatiladi: smena boshidan 15 daq o'tib "Keldim" bosilmasa,
  botdan xodimga: "Smena 09:00 da boshlangan. Kelganingizda Keldim bosing."

### 1.2 Ega tomonida (Admin panel → yangi "Jamoa" tab)
**Ekran A — Ro'yxat (jamoa):** har xodim kartochka: ism, lavozim, oylik,
bugungi holat (🟢 ishda / ⚪ kelmagan / 🔵 ketgan), shu oy balansi.
"+ Xodim qo'shish" → forma: ism, Telegram ID, lavozim, oylik (so'm),
smena (masalan 09:00–18:00), ish kunlari (Du–Sha), eski qarz/haq (boshlang'ich balans).

**Ekran B — Xodim sahifasi:** kalendar-jadval (oy bo'yicha): har kun —
keldi/ketdi vaqti, ishlagan soat, hisoblangan pul, holat (tasdiqlangan/kutmoqda).
Pastda kassa lentasi: hisoblanganlar (+) va berilgan pullar (−), yakuniy balans.
**"💸 Pul berdim"** tugmasi: summa + izoh ("avans", "oylik", "bonus") → lenta
ga yoziladi, balans kamayadi. Xodimga botdan xabar boradi: "Sizga 500 000 so'm
berildi (avans). Qolgan: 1 214 500 so'm" — hech qanday tortishuv qolmaydi.

**Ekran C — Kunlik tasdiqlash:** egaga HAR KUN kechqurun botga bitta xabar:
"📋 Bugun: Aziza 09:04–18:02 → 114 500 · Bekzod kelmadi → 0 · ..."
Tagida **"✅ Tasdiqlash"** / **"✏️ To'g'irlash"** tugmalari. To'g'irlash admin
panelga olib boradi (vaqtni qo'lda o'zgartirish — audit-log bilan).
Tasdiqlanmagan kunlar panelda sariq belgi bilan turadi.

### 1.3 Pul matematikasi (aniq qoidalar)
- Oylik → kunlik: `kunlik = oylik / shu oydagi ish kunlari soni`
  (masalan 3 000 000 / 26 = 115 385).
- Kunlik → soatlik: `soatlik = kunlik / smena soatlari`
  (9 soatlik smena → 12 820 so'm/soat, daqiqagacha hisob).
- **Kechikdi** → faqat kelgan vaqtidan hisoblanadi (09:40 da keldi → 09:40 dan).
- **Kelmadi** → 0 so'm. Hech narsa yozilmadi.
- Kunlik hisob smena oynasi ichida qirqiladi va kunlik stavkadan OSHMAYDI
  (erta kelib kech ketsa ham avtomatik overtime yo'q — ega xohlasa qo'lda bonus beradi).
- "Ketdim" bosishni unutsa → smena tugashida avtomatik yopiladi + egaga
  tasdiqlashda "⚠️ avto-yopilgan" belgisi bilan ko'rinadi.
- Balans = boshlang'ich balans + jami hisoblangan − jami berilgan pul.
- **Bu REAL PUL hisobi — tanga (CoinTxn) tizimiga UMUMAN aralashmaydi.**
  Alohida jadval, alohida ledger. Tanga emissiya qoidalariga ta'sir yo'q.

---

## 2. Texnik reja (qaysi fayllar, qanday)

### 2.1 Yangi Prisma modellar (3 ta)
```prisma
model Employee {        // xodim
  id, telegramId (unique), name, role,
  monthlySalary Int,    // so'mda
  shiftStart "09:00", shiftEnd "18:00", workDays "12345" (Du..Ya),
  openingBalance Int @default(0),   // eski oylik/qarz shu yerga
  active Boolean, createdAt
}
model WorkSession {     // bir kunlik davomat
  id, employeeId, date (kun), checkIn, checkOut,
  minutesWorked Int, amountEarned Int,
  autoClosed Boolean, confirmedAt DateTime?,  // ega tasdig'i
  editedBy String?     // qo'lda to'g'irlangan bo'lsa
  @@unique([employeeId, date])   // bir kun — bir sessiya (idempotent)
}
model StaffLedger {     // kassa lentasi: + hisob, − to'lov
  id, employeeId, kind ("earn"|"payout"|"bonus"|"adjust"),
  amount Int, note String?, sessionId?, createdAt, createdBy
  idempotencyKey String @unique   // earn: "staffearn:<sessionId>"
}
```

### 2.2 Yangi/o'zgaradigan fayllar
| Fayl | Nima |
|---|---|
| `packages/server/prisma/schema.prisma` | +3 model (VPS'da alohida `db push` qadami!) |
| `packages/server/src/services/staffService.ts` (YANGI) | butun mantiq: checkIn/checkOut, hisoblash, ledger, kunlik xulosa |
| `packages/server/src/bot/staff.ts` (YANGI) | "Keldim/Ketdim/Hisobim" tugmalari + xodim menyusi |
| `packages/server/src/bot/bot.ts` | staff menyusini ulash (faqat Employee bo'lsa ko'rinadi) |
| `packages/server/src/api/server.ts` | `/api/admin/staff/*` routelar (requireAdmin, pul yozish requireOwner) |
| `packages/server/src/index.ts` | 15-daq tickka kunlik xulosa qo'shiladi (YANGI poller YO'Q — mavjud tick) |
| `packages/server/src/services/featureFlags.ts` | `jamoa` flag (DEFAULT_OFF, kill-switch) |
| `packages/admin/src/JamoaPanel.tsx` (YANGI) | Jamoa tab: ro'yxat + xodim sahifa + tasdiqlash (App.tsx 2.5k — shishirmaymiz, alohida fayl) |
| `packages/admin/src/App.tsx` | tab ulash |
| `packages/admin/src/api.ts` | staff endpointlar |

### 2.3 Invariantlarga rioya
- ✅ Yangi poller yo'q — kunlik xulosa mavjud 15-daq tick ichida (AppState marker
  `staffsummary:<kun>` bilan bir marta yuboriladi).
- ✅ Har pul yozuvi idempotent kalit bilan (`staffearn:<sessionId>` — qayta hisob
  ikki marta yozmaydi).
- ✅ Tanga tizimiga tegilmaydi — `CoinTxn` emas, alohida `StaffLedger`.
- ✅ Kill-switch: `jamoa` flag off → bot tugmalari va tick xulosasi o'chadi.
- ✅ Sxema o'zgarishi kod pushidan OLDIN VPS'da ongli qadam (diff o'qib, keyin push).
- ✅ Vaqt zonasi: hamma hisob `Asia/Tashkent` bo'yicha (server UTC bo'lsa ham).

---

## 3. Bosqichlar (har biri alohida tasdiq bilan yopiladi)

| # | Bosqich | Nima chiqadi | Isbot |
|---|---|---|---|
| J1 | Sxema + staffService | modellar, hisob matematikasi, unit-test (kechikish/kelmadi/avto-yopish/oy chegarasi) | vitest yashil, VPS diff o'qilgan |
| J2 | Bot oqimi | Keldim/Ketdim/Hisobim jonli | test-xodim (ega o'zi) bilan real skrinshot |
| J3 | Admin "Jamoa" tab | ro'yxat, xodim sahifa, pul berish | egaga real render skrinshot |
| J4 | Kunlik tasdiqlash | kechki xulosa + Tasdiqlash tugmasi | jonli xabar skrinshot |
| J5 | Eski oyliklar + hisobot | boshlang'ich balanslar kiritish, oylik jadval (oy oxiri xulosasi) | egadagi raqamlar bilan solishtirish |

Har bosqich: DoD oldindan → kod → typecheck → mustaqil tekshiruv →
"READY FOR VERIFICATION" → ega QABUL. `jamoa` flag faqat ega qabulidan keyin ON.

---

## 4. B2B kengayish — "BirJoy Jamoa" korxonalar uchun (Ravella va boshqalar)

> Bugun o'zimiz uchun quramiz, lekin ertaga Ravella'ga o'xshagan korxonalar
> "bizga ham kerak" desa — tayyor mahsulot bo'lib chiqadi. Bu BirJoy'ning
> birinchi B2B daromad liniyasi bo'lishi mumkin.

### 4.1 HOZIROQ qilinadigan bitta arxitektura qarori (arzon, keyin qimmat)
V1 sxemaga kun 1 dan **`Organization`** jadvali kiradi:
```prisma
model Organization {
  id, name, ownerTelegramId,       // korxona egasi
  plan ("free"|"pro"), active, createdAt
}
// Employee.orgId → Organization    (org #1 = ishxonaning o'zi)
```
Bugun hech narsani qiyinlashtirmaydi (bitta org bilan ishlaymiz), lekin ertaga
Ravella qo'shilganda sxema sindirilmaydi — shunchaki yangi org yoziladi.
Har so'rov org bo'yicha chegaralanadi (Ravella egasi faqat o'z xodimlarini ko'radi).

### 4.2 Korxona egasi nimalarga ega bo'ladi
- **Bot ichida boshqaruv** — korxona egasiga alohida sayt kerak emas: botda
  "🏢 Korxonam" bo'limi — xodim qo'shish (Telegram ID / telefon), bugungi davomat,
  pul berish, kechki tasdiqlash — hammasi o'sha bitta kechki xabar bilan, xuddi bizdagiday.
- **QR check-in (joy isboti):** har korxonaga bitta QR poster (bizda QR stiker
  pipeline tayyor — haydovchi stikerlarida ishlatganmiz). Xodim ish joyidagi QR ni
  skan qiladi → "Keldim". Uydan turib bosib bo'lmaydi. Ravella zali uchun ideal.
- **Moslashuvchan smenalar:** Ravella to'y biznesi — ish kunlari notekis.
  Kun-bakun smena belgilash ("shanba 14:00–23:00") + bir martalik ish kunlari.
- **Filiallar:** bitta korxona, bir nechta manzil (har biriga o'z QR).
- **Oylik payroll varag'i:** oy oxirida har xodim bo'yicha jadval (kunlar, soatlar,
  hisoblangan, berilgan, qoldiq) — PDF export, xodimga botdan "oylik varaqcha".
- **Jarima/bonus:** qo'lda yozish (StaffLedger `bonus`/`adjust` allaqachon rejada).

### 4.3 BirJoy ekotizimi bilan bog'lash (raqobatchida yo'q narsa)
- **Korp taksi:** `CorpAccount` allaqachon bor — korxona xodimlari ishga borish-
  kelishda korxona hisobidan taksi. Jamoa + korp taksi = bitta paket taklif.
- **Ish e'lonlari:** korxona "xodim kerak" desa — e'lon BirJoy auditoriyasiga
  (mavjud e'lonlar tizimi orqali). Ishga olish → bir bosishda Jamoa'ga qo'shish.
- **Xodim tajribasi:** xodimlar allaqachon BirJoy botida — yangi ilova o'rnatish
  shart emas. Bu eng katta ustunlik: korxona uchun joriy etish = nol ishqalanish.

### 4.4 Monetizatsiya (keyin, ega qarori bilan)
- O'zimiz: bepul (ichki vosita). Pilot (Ravella): bepul, feedback evaziga.
- Ochiq B2B: xodim boshiga oyiga ~10–15 ming so'm, birinchi oy bepul.
  Kill-switch va org-limit flaglar bilan.

### 4.5 Bosqichlarga ta'siri
- **V1 (J1–J5):** faqat `Organization` jadvali + orgId qo'shiladi — boshqasi o'zgarmaydi.
- **V2 (Ravella pilot):** bot ichi "Korxonam" boshqaruvi + QR check-in + moslashuvchan smena.
- **V3 (ochiq B2B):** o'z-o'ziga ro'yxatdan o'tish, narxlash, org-limitlar.
V2/V3 alohida reja va alohida tasdiq bilan — V1 ni kutmaydi ham, sekinlashtirmaydi ham.

---

## 5. MOSLASHUVCHAN SIYOSAT TIZIMI (ega qarori: "flexible bo'lsin, dunyo tajribasi")

> Dunyo amaliyoti (Deputy, Homebase, When I Work, Connecteam, 1C ZUP, Bitrix24)
> asosida. Hech narsa qotirilmaydi — hammasi SOZLAMA. Ierarxiya:
> **Global default → Korxona sozlamasi → Xodim sozlamasi → Kunlik istisno.**
> Xodimda bo'sh qolgan maydon korxonanikini oladi — shuning uchun 90% hollarda
> ega faqat ism + oylik kiritadi, qolgani o'zi ishlayveradi.

### 5.1 Maosh turi (payType) — har xodimga alohida
| Tur | Hisob | Kim uchun |
|---|---|---|
| `oylik` | oylik ÷ ish kunlari → kunlik → soatlik | operator, doimiy xodim |
| `kunlik` | qat'iy kunlik stavka (kelgan kuni yoziladi) | to'y ofitsianti, mardikor |
| `soatlik` | qat'iy soatlik stavka × ishlagan soat | yarim stavka, talaba |

Oylik bo'luvchi rejimi (divisorMode): `haqiqiy` (o'sha oydagi haqiqiy ish kunlari
soni — DEFAULT) yoki `qatiy` (har doim belgilangan songa, masalan 26, bo'lish —
1C uslubi, oydan-oyga bir xil kunlik stavka). Korxona tanlaydi.

### 5.2 Davomat qoidalari (dunyo standarti)
- **Grace period (kechikish kechirimi):** default 10 daq — 09:09 da kelsa 09:00
  dan hisoblanadi. 0 ga qo'yish mumkin (qat'iy rejim).
- **Yaxlitlash (rounding):** daqiqalar 5 daq ga yaxlitlanadi (sozlanadi: 1/5/10/15).
- **Tushlik:** default — smena ≥ 6 soat bo'lsa 60 daq to'lovsiz ayiriladi.
  Sozlanadi: daqiqa soni / "to'lanadigan tushlik" (ayirilmaydi) / o'chirish.
- **Overtime:** default OFF (kunlik stavka shift bilan qirqiladi). Sozlama:
  `off` / `qolda` (ega tasdiqlashda "+1 soat overtime" bosadi) / `avto ×1.5`.
  Avto rejim faqat ega ongli yoqsa — pul avtomatikasi ehtiyot flag ortida.
- **Avto-yopish:** "Ketdim" unutilsa smena oxirida yopiladi (⚠️ belgi bilan) — o'zgarmas.

### 5.3 Smena tizimi
- **Shablonlar:** korxonada nomlangan smenalar ("Ofis 09–18", "Kechki 14–23",
  "To'y 16–24"). Xodimga shablon biriktiriladi.
- **Har xodimga alohida** smena + ish kunlari (Du–Ya ixtiyoriy kombinatsiya).
- **Kunlik istisno:** ega istalgan kunga alohida jadval qo'yadi ("shanba Aziza
  14:00–23:00") yoki bir martalik ish kuni qo'shadi — Ravella'ning notekis
  to'y-jadvali aynan shu.
- **OY TAQVIMI (ega qarori 2026-07-31: "ish kunlari har oy yaratiladi"):** admin
  panelda har oy uchun taqvim-katak — ega istalgan kunni bosib turini o'zgartiradi:
  `ish` (ishlaydigan yakshanba) / `dam` (qo'shimcha dam) / `bayram` (Navro'z…).
  Haftalik naqsh (har kun ish / faqat shanba dam / shanba-yakshanba dam — istalgan
  kombinatsiya) faqat DEFAULT beradi, taqvim istisno kun-by-kun ustidan yozadi.
  Kunlik stavka bo'luvchisi ham shu taqvimdan hisoblanadi: to'lanadigan bayram
  bo'luvchini saqlaydi (oy jami AYNAN oylikka teng chiqadi), to'lanmaydigani
  bo'luvchini kamaytiradi. `shared` da `dayKindFor`/`countPayableDaysInMonth`.

### 5.4 Kun holatlari (attendance status — jahon HR standarti)
Har kun WorkSession'da `dayStatus` bo'ladi:
`ishladi` · `kelmadi` (0 so'm) · `javobli` (ega ruxsati bilan, 0 so'm) ·
`kasallik` (koeffitsient sozlanadi, default 0%) · `tatil` (yillik ta'til,
default 100% to'lanadi, yillik limit sozlanadi, default 15 kun) · `bayram`.
Ega kechki tasdiqlashda yoki panelda bir bosishda holat qo'yadi
("Bekzod bugun javob so'ragan edi" → `javobli`).

### 5.5 Pul intizomi
- **Avans limiti:** default — hisoblangan-lekin-berilmagan summaning 100% igacha;
  korxona % pasaytira oladi (masalan 50%). Balansdan ortiq berish — ogohlantirish
  bilan, lekin taqiqlanmaydi (real hayotda ega baribir beradi — minus balans ko'rinadi).
- **Jarima/bonus:** sabab-izoh MAJBURIY, xodimga botdan darhol xabar.
- **To'lov davri:** default oy oxiri; sozlama: oyning istalgan sanasi yoki
  2 marta (1 va 15). Bu faqat eslatma-ritm — pul baribir qo'lda "Pul berdim" bilan yoziladi.

### 5.6 Sxemaga ta'siri (yakuniy)
```prisma
model Organization {
  id, name, ownerTelegramId, plan, active, createdAt
  // korxona-default siyosat:
  divisorMode "haqiqiy", fixedDivisor 26, graceMin 10, roundMin 5,
  lunchMin 60, lunchPaid false, overtimeMode "off", advancePct 100,
  calendar Json?,                        // {"2027-03-21":"bayram", "2027-08-02":"ish", ...}
  shiftTemplates Json?                   // [{name,start,end}]
}
model Employee {
  id, orgId, telegramId (unique), name, role, active, createdAt,
  payType "oylik"|"kunlik"|"soatlik", monthlySalary?, dailyRate?, hourlyRate?,
  shiftStart?, shiftEnd?, workDays?,     // null = korxona shablonidan
  graceMin?, lunchMin?,                  // null = korxona default
  openingBalance Int @default(0), vacationDaysYr Int @default(15)
}
model WorkSession {
  id, employeeId, date, checkIn?, checkOut?,
  dayStatus "ishladi"|"kelmadi"|"javobli"|"kasallik"|"tatil"|"bayram",
  shiftStartOvr?, shiftEndOvr?,          // kunlik istisno
  minutesWorked, amountEarned, overtimeMin Int @default(0),
  autoClosed, confirmedAt?, editedBy?
  @@unique([employeeId, date])
}
model StaffLedger { /* o'zgarmagan — 1.2/2.1 dagidek */ }
```
Hisob mantiqi BITTA sof funksiyada: `computeDayPay(policy, session) → so'm`
(`packages/shared` da — vitest bilan har qoida qoplanadi: grace, tushlik,
kechikish, qat'iy/haqiqiy bo'luvchi, kunlik/soatlik turlar, ta'til, bayram,
avto-yopish, oy chegarasi). Pul matematikasi UI dan butunlay ajratilgan.

### 5.7 4 savolga javob (flexible qaror)
1. Kunlik stavka: DEFAULT haqiqiy ish kunlariga bo'lish; korxona sozlamasida
   qat'iy-26 rejimi bor. 2. Smena har xodimga alohida + shablonlar + kunlik
   istisno. 3. Tushlik sozlanadi (default 60 daq, ≥6 soatda). 4. Ish kunlari
   xodim-by-xodim + bayram kalendari.

---

## 6. J1 dan oldin
Xodimlar ro'yxati va eski oyliklar — J5 da kiritiladi, tayyorlab qo'ying.
J1 tarkibi: sxema (Organization/Employee/WorkSession/StaffLedger) + `computeDayPay`
sof funksiya + to'liq vitest + `jamoa` flag. Bot/panel J2–J3 da.

---

## 7. 🚀 KUCHLI JAMOA 2.0 — "oddiy davomat" dan "to'liq workforce management" ga

> Ega qarori 2026-08-05: hozirgi Jamoa (V1, jonli) ISHLAYDI, lekin oddiy. Endi
> maqsad — Deputy/Homebase/Connecteam darajasidagi kuch, lekin BirJoy botining
> o'zida: xodim uchun ham, ega uchun ham. Hech narsa qayta qurilmaydi — V1
> yadrosi (computeDayPay, StaffLedger, idempotent yozuvlar) ustiga qatlam.
> V1'dan farqi: V1 "vaziyatni yozib boradi", V2.0 "vaziyatni BOSHQARADI" —
> xodim o'zi so'rov yuboradi, ega bitta joydan hammasini ko'radi va hal qiladi.

**Allaqachon jonli (2026-08-05):** kechikish/erta-kelish/pul-olish DARHOL xabar
(kechqurunni kutmasdan) + har pul-xabarida kunlik jami — shu kunning o'zida
qurildi, pastdagi A1/B3 elementlarining boshlanishi.

### 7.1 🤖 BOT TOMONI — xodim uchun kuchli qulayliklar

**A — Real-vaqtli xabarlar (A1 jonli, qolgani navbatda)**
| # | Qulaylik | Tavsif |
|---|---|---|
| A1 ✅ | Kechikish/erta kelish/pul-olish darhol | Ega kechqurunni kutmaydi — hodisa sodir bo'lishi bilan xabar (JONLI). |
| A2 | Ertangi smena eslatmasi | Kechqurun soat 20:00 atrofida: "Ertaga smenangiz 09:00 da". Kelmay qolish sonini kamaytiradi. |
| A3 | "Ketdimni unutdingiz" darhol xabari egaga | Hozir faqat ⚠️avto belgi — endi avto-yopilgan zahoti egaga ham qisqa xabar: "Aziza Ketdim bosmadi, smena oxiriga yopildi". |
| A4 | Haftalik shaxsiy xulosa | Har dushanba xodimning o'ziga: "O'tgan hafta: 6 kun, 48 soat, 620 000 so'm". |

**B — Xodim BOSHLAYDIGAN so'rovlar (hozir bo'lmagan, eng katta bo'shliq)**
| # | Qulaylik | Tavsif |
|---|---|---|
| B1 | 🏖 Ta'til/kasallik so'rash | `/tatil` — sana oralig'i + sabab → egaga tasdiq-karta (✅/❌). Tasdiqlansa avtomatik `dayStatus` yoziladi (hozir buni FAQAT ega panelda qo'lda qiladi). |
| B2 | 🔄 Smena almashish so'rovi | "Ertangi smenamni Bekzod bilan almashtirmoqchiman" — ikkala xodim + ega tasdiqlaydi, uch tomonlama karta. |
| B3 | ⏰ Erta ketish/kech kelish oldindan xabari | "Bugun shifoxonaga borishim kerak, 11:00 da kelaman" — ega oldindan biladi, kelganda "kechikdi" degan qattiq ohang o'rniga tushunish bilan kutiladi (matnda farq qilinadi). |
| B4 | 🤒 Bitta tugma: "Bugun kasalman" | Hozir kasallik holatini FAQAT ega qo'yadi. Xodimning o'zi ham /ish menyusidan belgilay olsin (ega baribir kechqurun ko'radi/rad eta oladi). |

**C — Shaxsiy shaffoflik va motivatsiya**
| # | Qulaylik | Tavsif |
|---|---|---|
| C1 | 📊 "Mening natijalarim" | Streak (necha kun ketma-ket vaqtida kelgan), oylik intizom %, o'rtacha ish soati. |
| C2 | 🧾 Avtomatik oylik varaqcha (V2.1 dan) | Oy yopilganda PDF/rasm shaklida botga — kunlar, soatlar, hisob, olingan, qoldiq. |
| C3 | 🏆 "Oyning xodimi" (ixtiyoriy) | Eng yuqori intizom % — jamoaviy motivatsiya, ega yoqadi/o'chiradi. |
| C4 | 📅 `/jadval` — shaxsiy taqvim | Xodim o'z haftalik/oylik jadvalini (smena, dam kunlari) istalgan payt so'raydi. |

**D — Joy isboti (V2.2 dan, muhimligi oshdi)**
| # | Qulaylik | Tavsif |
|---|---|---|
| D1 | 📍 QR check-in | Ish joyidagi QR skan = Keldim. Haydovchi-QR pipeline tayyor. |
| D2 | 📸 Rasm-tasdiqli Keldim (QR'gacha oraliq) | Ish joyi rasmi ilova qilinadi — arzon, tezkor variant. |

### 7.2 🖥 ADMIN PANEL — ega uchun kuchli qulayliklar

**E — Jonli boshqaruv markazi (bosh sahifa qayta ko'rib chiqiladi)**
| # | Qulaylik | Tavsif |
|---|---|---|
| E1 | 📡 Jonli holat-kartasi | Hozir kim ishda/kech/kelmagan — avtomatik yangilanadigan (hozirgi ro'yxat statik, sahifa yangilashda). Bugungi umumiy xarajat counter yuqorida doim ko'rinadi. |
| E2 | 🔔 "Kutilayotgan ishlar" yagona navbati | Tasdiqsiz kunlar + ta'til so'rovlari (B1) + smena-almashish so'rovlari (B2) + tasdiqlanmagan jarima — BITTA ro'yxat, sidebar'da son-badge bilan («👔 Jamoa ⑶»). |
| E3 | 📈 Trend grafiklari | Oylik xarajat trendi, kim ko'p kechikadi (dataviz skill bilan) — bugungi raqam-jadvaldan grafikka. |

**F — Tezlik va ko'lam (jamoa kattalashsa kerak bo'ladi)**
| # | Qulaylik | Tavsif |
|---|---|---|
| F1 | 🔍 Qidiruv/filtr | Ism/lavozim/holat bo'yicha — 5 xodimda shart emas, 30+ da majburiy. |
| F2 | ⚡ Ommaviy amallar | Bir nechta xodimni belgilab, birdan bonus/eslatma/holat. |
| F3 | 🏗 Smena-shablon quruvchisi | "Ofis 09-18", "Kechki 14-23" tayyor shablonlar — bir bosishda xodimga biriktirish (hozir har birini qo'lda yozasiz). |

**G — Hisobot va nazorat**
| # | Qulaylik | Tavsif |
|---|---|---|
| G1 | 📄 PDF oylik varaq | CSV ustiga — chiroyli, imzo-joyi bilan (mavjud PDF pipeline). |
| G2 | 🕰 To'liq audit-jurnal tab | `editedBy` allaqachon yozilyapti — alohida "Jurnal" ko'rinishi: kim, qachon, nimani o'zgartirdi. |
| G3 | 🏅 Xodim reyting/KPI jadvali | Punctuality score, ishlagan soat — ustunlar bo'yicha saralanadigan jadval. |

### 7.3 Ustuvorlik (nimadan boshlash tavsiyasi)

**P1 — eng tez ta'sir, kichik hajm** (birinchi navbat):
A2 (ertangi eslatma) · A3 (unutish darhol xabari) · B4 (o'zi-kasal tugmasi) ·
E2 (kutilayotgan ishlar navbati — B1/B2 kelmasa ham hoziroq tasdiqsiz+jarima
uchun qurilishi mumkin) · F1 (qidiruv)

**P2 — eng katta bo'shliqni yopadi** (xodim o'zi harakatga kirishadi):
B1 (ta'til so'rash) · B2 (smena almashish) · C1 (mening natijalarim) · C4 (/jadval)

**P3 — chuqurroq, ko'proq ish talab qiladi**:
D1/D2 (joy isboti) · E1 (jonli avto-yangilanuvchi dashboard) · E3 (trend
grafiklari) · F2/F3 (ommaviy amallar, shablon quruvchisi) · G1/G2/G3

Har blok — o'z DoD'i + ega QABUL'i bilan, alohida so'rovga qadar boshlanmaydi
(CLAUDE.md qoidasi). **"P1 boshla"** yoki aniq raqam (masalan "B1 va B2 ni
qil") desangiz — o'sha bilan boshlayman.

---

## 8. J6–J10 — jamoa madaniyati qatlami (ega so'rovi 2026-08-18)

> «Eski ishchini o'chirish · ishchilarga xabarlar · qoidalar bo'limi · mukofotlar» + jamoaviy
> maqsad-bonusi. Davomat/oylik yadrosi (computeDayPay, StaffLedger) TEGILMADI — ustiga qatlam.
> Kod: `services/staffTeamService.ts` (yangi, J7–J10) + `staffAdminService.ts` (J6) +
> `bot/staff.ts` (3 tugma) + `admin/src/jamoa.tsx` (4 ekran + arxiv bo'limi).

### 8.1 J6 — 🗄 Arxiv («eski ishchini o'chirish»)
Ega qarori: **arxiv + faqat bo'sh qatorni butunlay**. Arxivdagi xodim: ro'yxatda ko'rinmaydi
(pastda yig'ilgan «🗄 Arxiv (N)» bo'limi), botda `/ish` yopiq, kechki xulosa va reytingga
kirmaydi — **lekin oylik tarixi va pul yozuvlari qoladi**, o'tgan oy hisobotlari o'zgarmaydi.
- Arxivga olishda **ochiq smena avval yopiladi** (avto-yopish faqat faol xodimni ko'radi —
  aks holda kun abadiy tasdiqsiz qolardi) + osilgan ta'til/almashish so'rovlari rad etiladi.
- Butunlay o'chirish sharti: 0 ish kuni + 0 pul yozuvi + 0 boshlang'ich balans.
- «faol» belgisi qayta yoqilsa `archivedAt` ham tozalanadi (ikki joyda ikki xil haqiqat bo'lmasin).

### 8.2 J7 — 📢 Xabarlar (ega → xodim)
`StaffNotice` (kind="xabar") + `StaffNoticeRead`. Hammaga yoki bitta xodimga; botga darhol.
Xodim: `/ish` → «📢 Xabarlar (N)» → «✅ O'qidim». Ega: panelda «3/5 o'qidi» + o'qimaganlar ismi.
Yetkazish natijasi darhol qaytariladi («❌ 1 kishiga yetmadi») — jim yutilmaydi.

### 8.3 J8 — 📖 Qoidalar
Bir jadval, `kind="qoida"` (tartiblanadi, tahrirlanadi, o'chirilgani tarixda qoladi).
`Organization.rulesVersion` har o'zgarishda ↑ → `Employee.rulesAckVersion` bilan solishtiriladi:
xodimdan **qayta «✅ Tanishdim»** so'raladi, panelda «4/5 tanishdi». Matn o'zgarmasa versiya oshmaydi.

### 8.4 J9 — 🏆 Mukofotlar (ikkalasi)
- **Pulli katalog**: `Organization.rewards` Json — nomi + summasi + izoh. Xodim sahifasida bir
  bosishda beriladi → **MAVJUD** `staffAdminPay(kind:"bonus")` (yangi pul kanali YO'Q), izoh
  `🏆 <nom>`, xodimga botdan xabar. Xodim `/ish` → «🏆 Mening mukofotlarim» da katalogni ko'radi.
- **Nishonlar** (pulsiz, saqlanmaydi — KPI'dan qayta hisoblanadi, drift bo'lmaydi):
  🥇 Oyning xodimi (≥2 kishi musobaqasi, ≥5 ish kuni, kelmagan kuni yo'q) · 💯 100% intizom ·
  📅 Kelmagan kuni yo'q · 🔥 N kun ketma-ket vaqtida (≥5). `computeStaffBadges` — shared, testli.

### 8.5 J10 — 📈 Jamoaviy maqsad-bonusi
Ega qarori: **«kunlik N ta buyurtmaga yetilsa — M so'm fond, keyin keyingi pog'ona»**.
- **O'lchov**: `DailyStat.completedRides` (kas1067'ning JAMI kunlik yakunlangan buyurtmasi;
  2026-08 jonli o'lchov: 150–207/kun). Yangi poller YO'Q — mavjud `rollupRecentDays` yozadi.
- **Qoida**: OY O'RTACHASI ≥ maqsad (bitta omadli kun mln ochmaydi). **Bugungi kun kirmaydi**
  (tugamagan kun o'rtachani ertalabdan pastga tortardi).
- **Yetib bo'lmasa ochiq aytiladi**: kerakli sur'at maqsaddan 1.5× oshsa — «bu oyda yetib
  bo'lmaydi», fantaziya raqam ko'rsatilmaydi.
- **Pul avtomatik BERILMAYDI**: kechki tick egaga «💸 Mukofotni berish» tugmali karta yuboradi
  (status faqat karta YETGACH «bajarildi» — Telegram yiqilsa karta yo'qolmaydi). Ega bosgach fond
  **ishlagan kuniga proportsional** bo'linadi (largest-remainder → yig'indi AYNAN fondga teng),
  har ulush idempotent kalit bilan. Bot tugmasi egalikni alohida tekshiradi (`mustBeOwnerTg`).
- Keyingi pog'ona avtomatik taklif qilinadi (500 → 600), lekin ega o'zi belgilaydi.

### 8.6 Sxema (bitta VPS `db push` — kod push'idan OLDIN)
`Employee` +`archivedAt`/`archiveNote`/`rulesAckVersion` · `Organization` +`rulesVersion`/`rewards`
· yangi `StaffNotice` · `StaffNoticeRead` · `StaffGoal`.
