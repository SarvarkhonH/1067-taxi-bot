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
- **Bayram kalendari:** korxona darajasida bayram kunlari (Navro'z…) —
  `tolanadigan` (kelmasa ham kunlik yoziladi) yoki `tolanmaydigan`. Default: to'lanadigan.

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
  holidays Json?, shiftTemplates Json?   // [{name,start,end}]
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
