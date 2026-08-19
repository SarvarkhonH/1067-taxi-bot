# ADMIN PANEL — 3 SAVOLGA JAVOB

**Sana:** 2026-08-19 · **Rejim:** faqat-o'qish (kod o'qildi + jonli bazadan faqat `SELECT`) · **Kod o'zgartirilmadi.**

Har da'voda ishonch belgisi: **[TASDIQ]** = fayl:qator bilan o'z ko'zim bilan tekshirilgan · **[EHTIMOL]** = mantiqiy xulosa, jonli o'lchov bilan tasdiqlanmagan.

---

## 0. UCH JUMLADA JAVOB

1. **Kartalar ko'rinmaydi**, chunki «Kartalar & Tiraj» ekrani *karta ro'yxati* emas — u **TIRAJ ro'yxati**, va uning ikki qoidasi (xodim kartasi chiqariladi + 100% sotilmagan sovrin chiqariladi) bazadagi **6 ta kartaning hammasini** filtrdan o'tkazmaydi. Baza bo'sh emas, panel esa «Hali birorta karta chiqarilmagan» deb **yolg'on** yozadi. **[TASDIQ]**
2. **G'olibni panel TANLAMAYDI** — butun kodda tiraj yo'lida bitta ham tasodifiy son yo'q; **bloger jismonan tortadi, siz raqamni qo'lda kiritasiz**, panel faqat tekshiradi va bayonnoma yozadi. Lekin **bugungi holatda bu oqim oxirigacha ISHLAMAYDI** — 4 ta sovrin matematik qulfda. **[TASDIQ]**
3. **Farazingiz qisman to'g'ri:** «hech narsa bo'lmaydigan» tugmalar bor, lekin sabab siz o'ylagan emas — **485 ta bosiladigan elementdan o'lik marshrut 0 ta** (api ↔ server 100% mos), muammo shundaki **~105 ta tugma xatoni JIM yutadi yoki YOLG'ON «bajarildi» deydi**, 58 tasi esa umuman ekranga chiqmaydi. **[TASDIQ]**

---

# 1. NEGA ADMIN PANELDA OLINGAN KARTALAR KO'RINMAYDI

## 1.1 To'g'ridan-to'g'ri sabab

Siz **«🎮 O'yin mavsumi → 💳 Kartalar & Tiraj»** ekranini ochasiz. Yuqorida «Chiqarilgan karta: **0**», pastda jadval o'rnida «**Hali birorta karta chiqarilmagan**» yozuvi turadi.

**Bu yozuv yolg'on.** Jonli bazada **6 ta karta bor** va ularning hammasi bitta odamda — **member #26 = Sarvarxon (@Sarvarxonh), ya'ni sizda**. **[TASDIQ — jonli SELECT]**

Ekran kartalarni yashirmaydi, chunki u **karta reyestri emas, TIRAJ HUJJATI** — jonli efirda o'qiladigan ro'yxat. Undan ikki qoida bo'yicha kartalar chiqarib tashlanadi, va hozirgi holatda bu ikki qoida **barcha kartani** chiqaradi:

### Sabab №1 — XODIM QOIDASI (hozir 100% ishlaydi) **[TASDIQ]**

`oyin` bayrog'i **DARK** (o'chiq) bo'lgani uchun karta sotib olishga **faqat admin/ega** qodir:

```
oyinService.ts:1682   if (!preview && !(await featureOn("oyin"))) return { ok: false, reason: "off" };
server.ts:1502        const oyinPreviewOf = (res: Response): boolean => isAdmin(res.locals.telegramId as string);
```

Tiraj ro'yxati esa **aynan shu odamlarning kartasini** tashlab yuboradi:

```
oyinService.ts:2196   if (staffMembersD.has(memberId)) { excludedStaff += inSeason.length; return []; }
oyinService.ts:2132   function isStaffUser(tu) { return isAdmin(tu.id) || tu.isAdmin === true; }
```

**Bu tuzilmaviy zid:** sotib ola oladiganlar to'plami (`env.adminIds`) ⊆ chiqariladiganlar to'plami (`env.adminIds ∪ DB.isAdmin`). Ya'ni **bayroq o'chiq turgan butun davr mobaynida reyestr matematik jihatdan bo'sh bo'lishi SHART.** Bu tasodif emas.

### Sabab №2 — «100% SOTILSIN» QO'RIG'I (bayroq yoqilgandan keyin ham davom etadi) **[TASDIQ]**

```
economy.ts:329          { key: "oyinMinSellPct", …, def: 100, … }
oyinService.ts:993-997  minSellOf → pct=100 da minSell = limit (AYNAN)
oyinService.ts:2167     if (minSell > 0 && sold < minSell) { skippedKeys.add(p.key); … }
oyinService.ts:2204     if (skippedKeys.has(t.prizeKey)) return [];
```

Sovrin **TO'LIQ** sotilmasa uning **hamma** kartasi reyestrga tushmaydi. 50 o'rinli sovrinning 49 ta sotilgan kartasi ham ko'rinmaydi. Bu qoida **oddiy mijoz kartasiga ham** tegadi — ya'ni bayroqni yoqib, mijozlar karta sota boshlagandan keyin ham siz aynan shu «sotilyapti, panelda yo'q» holatini yana ko'rasiz. **[TASDIQ]**

## 1.2 Zanjir jadvali — ekrandan bazagacha

| Bosqich | Manzil | Nima bo'ladi |
|---|---|---|
| Ekran | `admin/src/oyin/Kartalar.tsx:19` | `adminApi.oyinDraw()` chaqiriladi |
| API | `admin/src/api.ts:208` | `GET /api/admin/oyin/draw` |
| Route | `server/src/api/server.ts:2485` | `res.json(await drawExport())` — hech narsa o'zgartirmaydi, bayroq tekshirilmaydi |
| Servis | `oyinService.ts:2136` | `drawExport()` — 6 ta `oyin:tickets:` qatorini o'qiydi |
| **Filtr 1** | `oyinService.ts:2193` | chetlatilgan a'zo → `excludedBanned` |
| **Filtr 2** | `oyinService.ts:2196` | **xodim/ega → `excludedStaff` — bizning 6 karta SHU YERDA tushadi** |
| **Filtr 3** | `oyinService.ts:2201` | sinov kartasi → `excludedTest` |
| **Filtr 4** | `oyinService.ts:2204` | 100% sotilmagan sovrin → `skippedPrizes` |
| Natija | — | `{ tickets: [], excludedStaff: 6 }` |
| Render | `Kartalar.tsx:75` | `Chiqarilgan karta: 0` |
| Render | `Kartalar.tsx:152` | «Hali birorta karta chiqarilmagan.» ← **yolg'on gap** |
| Render | `Kartalar.tsx:157` | «… **6 ta xodim kartasi**» ← haqiqat, lekin **bo'sh jadvaldan PASTDA**, eng mayda shriftda |

## 1.3 Panel o'zi bilan ZID raqam ko'rsatadi **[TASDIQ]**

Bitta panelning **besh** joyida «Chiqarilgan karta» **filtrsiz** manbadan (`oyin_sold:` hisoblagichi) chiqadi va **6** deb yozadi; **bitta** joyda esa filtrlangan manbadan **0** chiqadi:

| Joy | Manba | Fayl:qator | Raqam |
|---|---|---|---|
| Tab yonidagi rozetka | `vitals.cardsIssued` | `Konsol.tsx:53` | **6** |
| Yuqoridagi vital-panel «Kartalar» | `vitals.cardsIssued` | `Konsol.tsx:161` | **6** |
| Nazorat → ball voronkasi (BOSILADI!) | `vitals.cardsIssued` | `Nazorat.tsx:124` | **6** |
| Nazorat → statistika | `vitals.cardsIssued` | `Nazorat.tsx:192` | **6** |
| **Kartalar ekrani** | `exp.tickets.length` | `Kartalar.tsx:75` | **0** |

Manba: `oyinService.ts:4490-4494` — `cardsIssued += sold`, **hech qanday filtr yo'q**.

Eng yomoni: `Nazorat.tsx:124` dagi «Chiqarilgan karta 6» qatori **bosiladi** va sizni aynan «0» ko'rsatadigan ekranga olib boradi. Ya'ni panel siz uchun bajarilmaydigan va'da beradi. **[TASDIQ]**

## 1.4 Kartalarni HOZIROQ qayerda ko'rasiz (kod o'zgartirmasdan) **[TASDIQ]**

1. **◍ Odamlar → 🏆 Reyting** → «Karta» ustuni (`Odamlar.tsx:85`). Bu ustun **filtrsiz**.
2. O'sha ro'yxatdan odamni bosing → yon oyna **«Kartalari (N)»** — karta №, sovrin, olingan vaqt, har biriga **♻️** bekor tugmasi (`Odamlar.tsx:255`, `:271`). Bu yo'l `myTickets` dan o'qiydi, xodim/100% filtri **YO'Q**.
3. **⚙ Sozlama & Audit → 🧪 Men** — o'z kartalaringiz soni va `🧹 Kartalarimni tozalash (N)` tugmasi (`Sozlama.tsx:367`, `:386`).

## 1.5 Sabab EMASLIGI isbotlangan narsalar

| Nomzod | Verdikt | Isbot |
|---|---|---|
| 403 / 500 / tarmoq xatosi | **YO'Q** | So'rov yiqilsa ekran qizil `ErrBox` ko'rsatadi, «0» emas — `Kartalar.tsx:32`, `ui.tsx:263` **[TASDIQ]** |
| `oyin` bayrog'i admin route'ini to'sadi | **YO'Q** | `server.ts:2485` da `featureOn("oyin")` tekshiruvi umuman yo'q **[TASDIQ]** |
| Mavsum almashgani uchun kartalar o'chgan | **YO'Q** | `oyin:tickets:` arxivlanmaydi — karta **abadiy** (`oyinService.ts:3809-3811`) **[TASDIQ]** |
| Mavsum filtri kartani chiqarib tashlagan | **YO'Q** | Kodda mavsum filtri **umuman yo'q** — `parseTickets` davrni bilmaydi (`oyinService.ts:181`). Bu alohida nuqson: UI «Ro'yxat FAQAT joriy mavsumni qamraydi» (`Kartalar.tsx:159`) deb **yolg'on** yozadi **[TASDIQ]** |

## 1.6 Nima qilinishi kerak (ega qarori uchun)

- **Bugun, kodsiz:** kartalarni **Odamlar → Reyting** dan ko'ring. Reyestrni bo'shatish uchun kod o'zgarishi shart.
- **Tuzatish (tavsiyam):** `OyinDrawExport` ga ikkinchi ro'yxat qo'shilsin — `excludedTickets` (kim · qaysi sovrin · **nega**: xodim / chetlatilgan / sinov / chegaraga yetmagan). `tickets` massivi va **hash o'zgarmasin** (tiraj hujjati butunligi buzilmasligi shart), Kartalar ekranida ikkinchi jadval chizilsin. **Xodimni tiraj ro'yxatiga QAYTARIB QO'YMANG — bu qoida to'g'ri; muammo faqat ko'rinuvchanlikda.**
- **Darhol:** `Kartalar.tsx:152` dagi «Hali birorta karta chiqarilmagan» matni haqiqatga keltirilsin va `Nazorat.tsx:192` / `Konsol.tsx:53` dagi bir xil sarlavha **«Sotilgan karta»** deb qayta nomlansin — hozir bitta panel ikki xil raqam ko'rsatadi.

---

# 2. ADMIN PANELDA QANDAY G'OLIBNI E'LON QILAMAN

## 2.0 ENG MUHIM FAKT — panel g'olibni TANLAMAYDI **[TASDIQ]**

Butun kodda tiraj yo'lida **birorta tasodifiy son yo'q**. `Math.random` faqat hikoya-id (`oyinService.ts:2599`), gashtak-kodi (`:2992`) va id uchun ishlatiladi; `getDrawList` → `adminRecordWinner` oralig'ida (3283–3400) **umuman yo'q**.

Kodning o'z izohi (`oyinService.ts:3340-3342`): dastur g'olibni **tanlamaydi, faqat TEKSHIRADI**.

**Ya'ni:** raqamni **bloger jismonan tortadi** → siz uni panelga **qo'lda yozasiz** → panel uch narsani tekshiradi (raqam muzlatilgan ro'yxatda BORmi · ro'yxat muzlatilganmi · mukofot chegaraga yetganmi) va **bayonnoma** yozadi. Ishonch vositasi = **SHA-256 hash + ochiq karta reyestri**, seed emas.

## 2.1 OLDINDAN SHARTLAR — beshtasi ham bajarilishi SHART

| # | Shart | Kodda qayerda | Buzilsa nima bo'ladi |
|---|---|---|---|
| 1 | Mavsum **sozlangan** | `oyinService.ts:3295` | `null` → «Ro'yxat ochilmadi» |
| 2 | Mukofot `active` + `queued!==true` + `willDraw` + g'olibi yo'q | `Kartalar.tsx:43` | Qator ro'yxatda **umuman ko'rinmaydi** |
| 3 | `sold ≥ minSell` **VA** `cards.length ≥ minSell` **VA** `cards.length > 0` | `oyinService.ts:3331` | `not_ready` |
| 4 | Ro'yxat **MUZLATILGAN** | `oyinService.ts:3353` | `not_frozen` |
| 5 | Kiritilgan raqam ro'yxatda **BOR** | `oyinService.ts:3356` | `not_in_list` |
| + | Token **EGA** (operator emas) | `server.ts:2659` `requireAdmin, requireOwner` | 403 → **ekranda HECH NARSA** |
| + | Bu mukofotga bayonnoma hali yozilmagan | `oyinService.ts:3346` | `already` |

`minSell = ceil(limit × oyinMinSellPct / 100)`, hozir `pct = 100` → **hamma o'rin sotilishi shart**. **[TASDIQ]**

Mavsum fazasi (`active`/`ended`) g'olib yozishga **ta'sir qilmaydi** — `adminRecordWinner` da faza tekshiruvi yo'q. **[TASDIQ]**

## 2.2 RUNBOOK — telefondan bajariladigan 12 qadam

**1) Kiring — EGA paroli bilan.**
`admin.birjoy.online` → parol. ⚠️ Operator tokeni bilan tugma bosilsa server 403 qaytaradi, panel esa **hech nima ko'rsatmaydi** (`Kartalar.tsx:186` da `.catch` yo'q). «Bosdim, hech narsa bo'lmadi» holati aynan shu.

**2) Chap menyu → BOSHQARUV → 🎮 «O'yin mavsumi»** (`App.tsx:123`).
Yangi konsol ochiladi (`App.tsx:5068` `const OYIN_KONSOL = true;` → `:5071` `<Konsol />`). Eski «🎬 Mukofot kuni» bloki o'lik kod — uni ko'rmaysiz.

**3) Yuqoridagi modul tugmalaridan «💳 Kartalar & Tiraj»** (`Konsol.tsx:39` → `:102`).

**4) Nima ko'rasiz:** 4 ta raqam — «Chiqarilgan karta», «Tirajga tayyor», «Tiraj ro'yxati 🔒/🔓», «G'oliblar» (`Kartalar.tsx:75-81`).
Pastda **«🎬 Mukofot kuni»** kartasi. Tayyor mukofot bo'lmasa u yerda faqat matn turadi:
*«Mukofot HAMMA kartasi sotilganda tirajga tayyor bo'ladi. Hozircha to'lgani yo'q.»* (`Kartalar.tsx:100`) — **tugma umuman chiqmaydi.**

**5) «🔒 Ro'yxatni muzlatish» — o'ng yuqorida, BOSING** (`Kartalar.tsx:86-95`).
Tasdiq oynasi: *«Shu lahzadan HECH KIM (siz ham) karta qo'sha olmaydi. Ro'yxatda N ta karta»*. Bosgach: «🔒 Ro'yxat muzlatildi» + Telegramga alert.
⚠️ Muzlatish **GLOBAL** — bitta kalit `oyin:freeze` (`oyinService.ts:635`). Bitta mukofot uchun muzlatsangiz **hamma** mukofotga karta xaridi to'xtaydi (`oyinService.ts:1691`).

**6) Tayyor mukofot qatorida «Ro'yxatni ochish»** (`Kartalar.tsx:205`).
Qator ostida chiqadi: `Ro'yxat: N ta karta · M tasi chiqarilgan · hash abc123…(faqat 16 belgi) · 🔒 muzlatilgan` (`Kartalar.tsx:197-202`).

**7) Jonli efirga ro'yxatni oling:** pastdagi «💳 Karta reyestri»da mukofot chipini bosing → **«⬇ CSV»** (`Kartalar.tsx:137`). Kartalarni SHU ro'yxatdan chop eting.

**8) Bloger qutidan raqam tortadi.**

**9) O'sha qatorda «🏆 G'olibni qayd etish»** (`Kartalar.tsx:206`) →
- 1-oyna: *«<mukofot>» — bloger tortgan karta RAQAMI:* — raqamni yozing;
- 2-oyna: *Bayonnoma: bloger ismi, guvohlar, video havolasi:* — matn (bo'sh ham bo'ladi).
⚠️ **«Rostdanmi?» tasdiq oynasi YO'Q** — ikkinchi promptda OK bosilishi bilan yozuv ketadi va **qaytarib bo'lmaydi** (`oyinService.ts:3372` `create`, upsert emas). **[TASDIQ]**

**10) Muvaffaqiyat:** toast `🏆 G'olib qayd etildi: №X — Ism`, pastda «🏆 G'oliblar» jadvali (mukofot · g'olib · nechtadan · tortilgan · hash · topshirish), Telegramga admin-alert «🎬 BAYONNOMA yozildi …» (`server.ts:2665`).

**11) Mukofot topshirilgach:** «🏆 G'oliblar» jadvalida **«Topshirildi»** tugmasi → foto havolasi so'raydi (`Kartalar.tsx:118-124`).

**12) Tirajdan keyin «🔓 Muzlatishni bekor qilish»ni BOSING** — aks holda hech kim boshqa hech qanday mukofotga karta ololmaydi.

## 2.3 QAYSI JOYDA UZILADI — va ekranda qanday ko'rinadi **[TASDIQ]**

`Kartalar.tsx:188` — 6 ta sababdan **faqat bittasi** o'zbekchaga o'girilgan:

| Server sababi | Ekranda ko'rinishi | Nima qilish kerak |
|---|---|---|
| `not_in_list` | «⛔ Bu raqam ro'yxatda YO'Q — qayta tekshiring» | Raqamni qayta o'qing |
| `not_ready` | **«⛔ not_ready»** — tarjimasiz | Xodim kartasi tozalansin (2.5-bo'lim) |
| `not_frozen` | **«⛔ not_frozen»** | Avval 🔒 muzlating |
| `already` | **«⛔ already»** | Bayonnoma bor — qayta urinMANG |
| `write_failed` | **«⛔ write_failed»** | Baza xatosi — **QAYTA URING**, bayonnoma hali YO'Q |
| `unknown_prize` | **«⛔ unknown_prize»** | Mukofot topilmadi |
| 403 / 500 / tarmoq | **HECH NARSA** — toast yo'q, tugma faqat qayta yonadi | Ega tokeni bilan kiring |

Eski panelda bu 6 sabab to'liq tarjima qilingan edi (`App.tsx:6864-6869`), lekin `OYIN_KONSOL = true` tufayli o'sha ekran ko'rinmaydi. **[TASDIQ]**

## 2.4 G'OLIB QAYD ETILGACH NIMA BO'LADI

- **Bayonnoma:** `oyin:winner:<prizeKey>` (nom, telefon, gno, memberId, drawnAt, listHash, poolSize, note) — `oyinService.ts:3365-3371`. **Ustidan yozib bo'lmaydi.**
- Shu sovrinning qolgan kartalari `result:"lost"`, g'olibniki `"won"`.
- **Telegram:** adminlarga darhol alert.
- **Mijozga push:** `seasonDrawNotify` → «🏆 SIZ YUTDINGIZ!» / «🎬 Tiraj bo'ldi» — **15 daqiqalik tikda**.
  ⚠️ **`oyin` bayrog'i DARK bo'lsa push UMUMAN KETMAYDI** — `oyinService.ts:3661` `if (!(await featureOn("oyin"))) return`. Panel bu haqda **hech qayerda ogohlantirmaydi**. **[TASDIQ]**
- **Audit jurnaliga TUSHMAYDI** — `server.ts:2659-2668` da `writeAudit` yo'q, holbuki muzlatish va karta bekor qilish yoziladi. Eng qaytarilmas amal — izsiz. **[TASDIQ]**
- **G'oliblar jadvali uchun CSV yo'q** (karta reyestrida bor). **[TASDIQ]**
- **To'liq hash panelda hech qayerda ko'rinmaydi** — faqat 16 va 12 belgi kesilgan holda (`Kartalar.tsx:200`, `:115`), nusxa tugmasi yo'q. Ya'ni «hash'ni kanalga chiqaring» protokolini panel bilan bajarib bo'lmaydi. **[TASDIQ]**

## 2.5 BUGUNGI HOLATDA ISHLAYDIMI? — **YO'Q** **[TASDIQ — jonli baza bilan]**

Jonli o'lchov: **6 karta, hammasi sizniki**. Bu **4 ta sovrinni matematik jihatdan ABADIY qulflagan**:

| Sovrin | `limit` | Sizning kartangiz | Maksimal `cards.length` | `minSell` | Tiraj |
|---|---|---|---|---|---|
| uzum-tecno-spark-go-3-0 | 2 | 1 | 1 | 2 | **HECH QACHON** |
| air31-simsiz-quloqchinlari | 20 | 1 | 19 | 20 | **HECH QACHON** |
| uzum-samsung-a26-5g-2 | 124 | 1 | 123 | 124 | **HECH QACHON** |
| uzum-ac-artel-6 | 813 | 2 | 811 | 813 | **HECH QACHON** |

**Mexanizm:** `oyin_sold:` hisoblagichi sizning xaridingizni **SANAYDI** (`oyinService.ts:1628` `reserveSoldSlot`), `getDrawList` esa uni ro'yxatdan **CHIQARADI** (`:3318`), tayyorlik sharti esa **ikkalasini** talab qiladi (`:3331`). Ya'ni sovrin 100% sotilsa ham `cards.length = limit − 1 < minSell = limit`.

Ustiga: `willDraw` (panel tayanadigan maydon, `oyinService.ts:1224`) **faqat `sold`** ga qaraydi — ya'ni panel sovrinni **«📦 to'lgan — tiraj kutmoqda»** deb **yashil** ko'rsatadi, siz jonli efirda raqam va bayonnomani yozasiz, oxirida **«⛔ not_ready»** olasiz. Bu **eng qimmat lahzada** yuz beradi. **[TASDIQ]**

Bundan tashqari bayroq DARK — bugun g'olibni majburan yozib qo'ysangiz ham **mijozga hech qanday xabar bormaydi**.

## 2.6 QULFNI OCHISH — panel bilan, kodsiz, 3 yo'l **[TASDIQ]**

**Yo'l A (eng tez, o'z kartangiz).** ⚙️ Sozlama & Audit → **🧪 Men** → ismingizni qidiring → «Bu menman» → **«🧹 Kartalarimni tozalash (N)»** (`Sozlama.tsx:373-386`). Har karta `adminCancelTicket` → `releaseSoldSlot` → **o'rin bo'shaydi, ball qaytadi**.
⚠️ Bu tugma hech biri bekor qilinmasa ham yashil «✅ 0 ta karta bekor qilindi» deydi (`Sozlama.tsx:383`) — natijani `Odamlar` dan tekshiring.

**Yo'l B (boshqa xodim kartasi).** ◍ Odamlar → 🏆 Reyting → ismni qidiring → qatorni oching → «Kartalari» jadvalida **♻️** (`Odamlar.tsx:271`). Bitta-bitta.

**Yo'l C (tirajni BUGUN o'tkazish kerak bo'lsa).** ⚙️ Sozlama → **🎚 Ball jadvali** → `oyinMinSellPct` ni shunday tushiring-ki `minSell ≤ ro'yxatdagi karta soni` bo'lsin. Misol: limit 20, ro'yxatda 19 → **95** qo'ying → `minSell = 19` → tiraj ochiladi. **Tirajdan keyin 100 ga qaytaring.**

**Ehtiyot bo'ling:** 🎁 Mukofotlar → mukofotni oching → «♻️ Kartalarni bekor qilish (N)» (`Mukofotlar.tsx:339-345`) — u sovrinning **HAMMA** kartasini o'chiradi, faqat xodimnikini emas. Tiqilinch uchun ishlatmang.

**VPS kerakmi? — YO'Q.** Panel yetadi.

## 2.7 To'liq ishlashi uchun kerak bo'lgan 4 shart

1. `oyin` bayrog'ini yoqing → mijozlar karta sotib olsin;
2. kamida bitta mukofotning **hamma** joyi sotilsin;
3. o'sha sovrinda **xodim/ega kartasi bo'lmasin** (A/B/C yo'li bilan tozalansin);
4. muzlating → bloger tortsin → raqamni kiriting.

Faqat shu holatda oqim oxirigacha ishlaydi. **Mexanizm butun** — to'siq ma'lumot (sotuv) va yuqoridagi tiqilinch.

---

# 3. «ADMIN PANELDA ISHLAMAYDIGAN FUNKSIYALAR JUDA KO'P»

## 3.1 Faraz to'g'rimi? — QISMAN. Sonlar bilan.

**Tekshirilgan:** `packages/admin/src` bo'ylab **485 ta `onClick`** (aniq grep natijasi) + `api.ts` ↔ `server.ts` marshrut solishtiruvi.

```
App.tsx        230        oyin/*.tsx      115
jamoa.tsx       53        v2/*.tsx         35
ravella.tsx     18        design/*.tsx     34      = 485
```

| Verdikt | Soni | Ulush |
|---|---|---|
| 🔴 **O'LIK** — ekranga umuman chiqmaydi | **58** | 12% |
| 🔴 **BO'SH** — v2 da ekran yozilmagan (22 manzil) | **22 manzil** | (opt-in panel) |
| 🟠 **YOLG'ON** — xato bo'lsa ham «✅ bajarildi» deydi | **7** | 1.4% |
| 🟡 **JIM** — 403/500 da ekranda hech nima | **~62** | 13% |
| 🟡 **QISMAN** — ishlaydi, lekin natijani noto'g'ri aytadi | **28** | 6% |
| ✅ **ISHLAYDI** | **~330** | 68% |
| ⛔ **Buzuq marshrut (api ↔ server mos emas)** | **0** | **0%** |

**Asosiy xulosa:** *«tugma serverga bormaydi»* degan muammo **YO'Q**. `api.ts` dagi **268 ta metodning har biriga** `server.ts` da mos route bor — **0 ta mos kelmaydigan** (skript bilan tekshirildi). Shu jumladan 50 ta `oyin*` metodi ↔ 51 ta `/api/admin/oyin/…` route. **[TASDIQ]**

**Haqiqiy muammo:** tugma **ishlaydi, LEKIN natijasini aytmaydi yoki YOLG'ON aytadi.** Shuning uchun tuyg'u «ishlamayapti».

## 3.2 TO'LIQ JADVAL (verdikt bo'yicha tartiblangan)

### 🔴 O'LIK — ekranga umuman chiqmaydi

| Ekran | Tugma | Sabab | Fayl |
|---|---|---|---|
| O'yin (eski) | **58 ta tugma** — OyinPrizeBoard(9), OyinActivityView(9), OyinMeBlock(7), OyinControlCard(7), OyinGashtakBlock(6), OyinCardsBlock(4), OyinTodayCard(3), OyinDrawCard_(3), StoryModerationCard(2), SeasonSettings(2), Sponsor(2), Knobs(2), boshqa(2) | `OYIN_KONSOL = true` → `OyinTabLegacy` hech qachon render bo'lmaydi. **ATAYLAB** (rollback yo'li, CLAUDE.md R6). Jonli bundle'ga ham tushmaydi | `App.tsx:5068`, `:5071`, `:5075-7366` |
| v2 panel | **22 manzil** (buyurtmalar, operator, obzvon, moliya, tranzaksiya, yechishlar, qarzlar, integrity, dokon, xizmatlar, elonlar, ravella, bosh, pik, puls, referallar, topshiriq, xabarlar, bilim, flaglar, jurnal, tokenlar) | 26 nav e'lon qilingan, ekran 4 ta. Qolgani «Bu ekran hali v2'ga ko'chirilmagan» plashkasi | `v2/nav.ts:22-83`, `v2/AdminV2.tsx:58-63` |
| v2 panel | **O'yin bo'limi butunlay** | `nav.ts` da `oyin` id'si **umuman yo'q** — `admin_ui=v2` bo'lsa o'yin konsoliga kirib bo'lmaydi | `v2/nav.ts` (yo'q), `App.tsx:123` (v1'da bor) |
| Do'kon → Buyurtmalar | **Savat (MarketOrder) buyurtmalari** | Server route bor, panel **hech qachon chaqirmaydi** — mijoz savat orqali bergan buyurtmalar panelda ko'rinmaydi | `server.ts:855`, panelda 0 chaqiruv |

### 🟠 YOLG'ON — xato bo'lsa ham «bajarildi» deydi

| Ekran | Tugma | Sabab | Fayl |
|---|---|---|---|
| O'yin → Hikoyalar | **✅ Tasdiqlash / ❌ Rad** | Server javobining `ok` maydoni **umuman o'qilmaydi**; `{ok:false}` + HTTP 200 kelsa ham «✅ Tasdiqlandi — ball darhol tushdi, mijozga xabar ketdi» deydi. Aslida ball tushmagan, xabar ketmagan, auditda iz yo'q | `Hikoyalar.tsx:28-29`, `oyinStory.ts:206` |
| Do'kon | **⏸ To'xtatish / ▶️ Ochish** | Xato yutiladi, keyin shartsiz «⏸ Do'kon to'xtatildi — yangi buyurtma qabul qilinmaydi». Aslida do'kon OCHIQ. **Eng xavflisi** | `App.tsx:1806-1811` |
| E'lonlar | **🗑 O'chirish** | `.catch(() => undefined)` → shartsiz «🗑 O'chirildi». Server tomonda ham `classifiedService.ts:368-375` tranzaksiya yiqilsa `{ok:true}` qaytaradi | `App.tsx:3136-3138` |
| E'lonlar | **🗑 Rasmlarni tozalash** | Xuddi shunday | `App.tsx:3129-3130` |
| Haydovchi missiyalari | **🗑 O'chirish** | Server `{ok:false, reason:"not_found"}` qaytarsa ham «🗑 O'chirildi» | `App.tsx:3363-3365`, `driverMissionService.ts:121` |
| Ravella | **Kategoriya qo'shish** | `r.ok` tekshirilmaydi → «✅ Kategoriya qo'shildi» | `ravella.tsx:64-66` |
| O'yin → Sozlama | **🧹 Kartalarimni tozalash** | `done === 0` bo'lsa ham yashil «✅ 0 ta karta bekor qilindi» | `Sozlama.tsx:377-383` |

### 🟡 JIM — bosasiz, ekranda mutlaqo hech nima

| Ekran | Tugma | Sabab | Fayl |
|---|---|---|---|
| O'yin → Kartalar | **🔒 Ro'yxatni muzlatish** | `.catch` yo'q → 403/429/500 da toast ham, xato ham yo'q | `Kartalar.tsx:92-95` |
| O'yin → Kartalar | **🏆 G'olibni qayd etish** | `.catch` yo'q — jonli efirda eng xavfli joy | `Kartalar.tsx:186-189` |
| O'yin → Kartalar | **Topshirildi** | `.catch` ham, `.finally` ham yo'q | `Kartalar.tsx:123` |
| O'yin → Mukofotlar | **Ommaviy amallar (3 ta)** | `bulkAct` da `try{}finally{}`, **catch yo'q**. Route'da `rateLimit(10)` — katalogni ommaviy tahrirlashda 429 real | `Mukofotlar.tsx:85-99`, `:221-223` |
| O'yin → Mukofotlar | **🙈 Yashirish / 👁 Qaytarish** | `.catch` yo'q + `disabled={busy}` yozilgan, lekin `setBusy(true)` hech qachon chaqirilmaydi | `Mukofotlar.tsx:335-337` |
| O'yin → Mukofotlar | **♻️ Kartalarni bekor qilish / 🗑 O'chirish / Tarixdan qaytarish** | `.catch` yo'q | `Mukofotlar.tsx:341`, `:350`, `:670` |
| O'yin → Sozlama | **🔄 Yangi mavsum** | `.catch` yo'q | `Sozlama.tsx:102-104` |
| O'yin → Sozlama | **Qoralama «Eslatma» maydoni** | Muvaffaqiyatda **ham** jim (byudjet maydoni toast beradi, bu bermaydi) | `Sozlama.tsx:119` |
| O'yin → Sozlama | **＋5 000 / ＋1 000 ball** | `.catch` yo'q | `Sozlama.tsx:329` |
| Do'kon | **mahsulot o'chirish / yoqish-o'chirish / rasm tozalash / sharh o'chirish** | `.catch(() => undefined)` + shartsiz `load()` | `App.tsx:2234`, `:2392`, `:2440`, `:2489` |
| Kampaniyalar / AI-bilim / Kategoriya / Xizmatlar | **12 ta yozuv tugmasi** | `.catch(() => undefined)` | `App.tsx:1568`, `:1569`, `:1702`, `:1703`, `:2138`, `:2636`, `:2637`, `:2873`, `:2980`, `:2999`, `:3014`, `:3369` |
| Tokenlar / Korporativ | **7 ta tugma** (operator/shopseller token, revoke, corpCreate/Report/Balance/AddEmployee) | catch **umuman yo'q** → unhandled rejection | `App.tsx:956`, `:971`, `:984`, `:996`, `:1005`, `:1013`, `:1024` |
| **Obzvon** | **holat belgilash + izoh** | Optimistik UI o'zgaradi, `callUpdate` yiqilsa catch yo'q → ekranda «qo'ng'iroq qilindi», bazada YO'Q, sahifa yangilanmaguncha bilinmaydi | `App.tsx:3498-3507` |
| Integrity / Chat / Shaharlararo / Pik | **6 ta tugma** | catch yo'q | `App.tsx:1443`, `:2066`, `:2067`, `:4449`, `:4960`, `:7543` |
| Jamoa / Ravella | **5 ta tugma** | catch yo'q | `jamoa.tsx:1159`, `:1160`, `ravella.tsx:203`, `:250`, `:274` |

### 🟡 QISMAN — ishlaydi, lekin natijani noto'g'ri aytadi

| Ekran | Element | Sabab | Fayl |
|---|---|---|---|
| **BUTUN PANEL** | **🧾 Audit jurnali** ochilishi | `if (a.err) return` **`useMemo` dan OLDIN** → React hook soni kamayadi → «Rendered fewer hooks» → ErrorBoundary yo'q (butun `admin/src` da 0 ta) → **OQ EKRAN**. Faqat server xato bergandagina | `Sozlama.tsx:194` vs `:196` |
| Jamoa | OrgSettings | Xuddi shu sinf: `if (!org) return` dan **keyin** `useState` | `jamoa.tsx:782` vs `:825` |
| O'yin → ⌘K palitra | **17 buyruqdan 9 tasi** | Faqat modulni ochadi, sub-tab/filtr uzatmaydi: «Excel'dan yuklash» → Katalog (sehrgar emas), «Shubhali odamlar» → Reyting (filtrsiz), «Audit jurnali» → «Ishga tushirish» | `Konsol.tsx:190-208`, `:70` |
| O'yin → Kartalar | **«🏆 G'olibni qayd etish» tugmasi** | Ro'yxat **muzlatilmagan** holatda ham faol — faqat bosgandan keyin `not_frozen` bilanbiladingiz. Eski panelda to'g'ri edi (`App.tsx:6907` `disabled={… || !list.frozenAt}`) | `Kartalar.tsx:206` |
| O'yin → Nazorat | **📋 Navbatdan ochish** | 403 (owner_only) ni «⛔ Bajarilmadi — qayta urinib ko'ring» deb ko'rsatadi. Qayta urinish hech qachon yordam bermaydi | `Nazorat.tsx:33-34`, `:58-60` |
| O'yin → Komentariyalar | **🗑 O'chirish** | Qaytarib bo'lmaydigan amal, **tasdiq oynasi yo'q**. Faylning o'z izohi: «"🗑 O'chirish" **abadiy**» (`:80`) | `Komentariyalar.tsx:68` |
| Foydalanuvchilar | **📱 Telegram'ni bunga ulash** | **Ma'lumot buzadi:** ro'yxatdagi **BIRINCHI** telegramni oladi, qaysi qator bosilganidan qat'i nazar. «Ali» deb qidirib 3-Ali'ga bossangiz 1-Ali'ning akkaunti ko'chadi. Audit yozuvi yo'q | `App.tsx:3718`, `:3810` |
| Dashboard | **🚨 anomaliya bloki** | `anomalies()` yiqilsa blok **umuman chiqmaydi**, panel «hammasi joyida» ko'rinadi. Bu 4 ta karta (economy/ballDist/growth/moderation) **qayta ham so'ralmaydi** | `App.tsx:328-335`, `:343` |
| 21 ta ro'yxat | — | Xato → «bo'sh ro'yxat». Masalan Referallar: `rows=[]` da «Jami 0 · To'langan 0 · Mukofot 0» soxta nollar | `App.tsx:1565`, `:2030`, `:7370` va 18 ta boshqa |
| 18 ta ro'yxat | — | Xato → abadiy «Yuklanmoqda…» / spinner | `App.tsx:530+535`, `:1439+1466`, `ravella.tsx:49+58` va boshqa |
| Rol darvozasi | 36 tab | «operator» tokenli foydalanuvchi **to'liq 36 tabni** ko'radi, lekin 124 ta `requireOwner` route unga 403 beradi — va 403 yuqoridagi jim handlerlarga tushib yo'qoladi | `App.tsx:185-201`, `server.ts:327-333` |
| v2 → bo'sh ekran | Sarlavha | Yorliq emas, **xom marshrut-id** chiqadi («yechishlar», «dokon») | `v2/AdminV2.tsx:35` |
| v2 → almashtirish | `#v2` / `#v1` | Panel **ochiq turganda ishlamaydi** — faqat sahifa yuklanganda o'qiladi, **F5 shart**, hech qayerda aytilmagan | `main.tsx:14`, `:24-26` |

### ✅ ISHLAYDI — nimaga ishonch qilish mumkin

| Soha | Holat | Isbot |
|---|---|---|
| **Marshrut qatlami** | **100% butun** — `api.ts` dagi 268 metodning har biriga server route bor | Skript: 0 ta mos kelmaydigan **[TASDIQ]** |
| **Server darvozalari** | To'g'ri ishlaydi — `requireAdmin`/`requireOwner`/`requireShopWrite` chetlab o'tilmaydi | `server.ts:327-333` **[TASDIQ]** |
| **v1 panel — 36 ekran** | Hammasi mavjud va ochiladi; jonli DEFAULT panel shu | `App.tsx:66-135`, `main.tsx:39` **[TASDIQ]** |
| **O'yin konsoli — 10 ekran** | Konsol, Mukofotlar, Odamlar, Kartalar, Nazorat, Sozlama, Reja, Gashtak, Hikoyalar, Komentariyalar — hammasi ochiladi va yuklanadi | `oyin/*.tsx`, `Konsol.tsx:100-112` **[TASDIQ]** |
| **O'qish ekranlarida xato ko'rinadi** | `oyin/*` va `v2` da `useLoad`+`ErrBox` naqshi — xato JIM YUTILMAYDI, qizil quti + «qayta urinish» | `oyin/ui.tsx:248-268` **[TASDIQ]** |
| **Mukofot katalogi** | Yaratish, tahrirlash, rasm yuklash, Excel import, navbat — `try/catch`+toast bilan | `Mukofotlar.tsx:277-299` **[TASDIQ]** |
| **Odamlar ekrani** | `act()` helperi to'g'ri: `try/catch/finally` + toast | `Odamlar.tsx:182-191` **[TASDIQ]** |
| **Gashtak** | `run()` helperi to'g'ri | `Gashtak.tsx:80-88` **[TASDIQ]** |
| **Puls / Moliya** | Xato holati to'g'ri render qilinadi | `App.tsx:3969`, `:4053` **[TASDIQ]** |
| **Tiraj mexanizmi** | Muzlatish, hash, bayonnoma, `create` (upsert emas), `P2002` ajratilishi — **texnik jihatdan to'g'ri qurilgan** | `oyinService.ts:3343-3383` **[TASDIQ]** |
| **Bayonnoma butunligi** | Ustidan yozib bo'lmaydi, mavsum almashganda o'chmaydi, CI qalqoni bilan mahkamlangan | `simGuards.ts:37-39` **[TASDIQ]** |

## 3.3 Nega bu «juda ko'p» bo'lib tuyuladi

1. **Xato = jimlik.** `.catch(() => undefined)` naqshi `App.tsx` da **67 marta** uchraydi. Loyihaning o'zi buni xato deb yozib qo'ygan: `oyin/ui.tsx:248` — *«Xato JIM YUTILMAYDI. Eski panelda ko'p joyda `.catch(() => setRows([]))` bor edi … YOLG'ON tinchlik»*. Yangi konsol bu qoidaga amal qiladi, eski panel esa yo'q. **[TASDIQ]**
2. **Yolg'on tasdiq.** 7 ta tugma bajarilmagan ishni «bajarildi» deb yozadi. Bu jimlikdan **yomonroq**.
3. **ESLint umuman yo'q.** Repoda `.eslintrc*` fayli yo'q, `package.json` larda `"lint"` skripti yo'q, CI faqat `typecheck` + vitest yugurtiradi. `react-hooks/rules-of-hooks` **hech qachon ishlamagan** — shuning uchun Audit-jurnal hook bug'i topilmay qolgan. **[TASDIQ]**
4. **Ikki panel, ikki haqiqat.** `admin_ui=v2` yoqilgan brauzerda 26 manzildan 22 tasi bo'sh, O'yin bo'limi esa umuman yo'q.

## 3.4 Tavsiya qilingan tartib (mening muhandis sifatidagi ustuvorligim)

| # | Ish | Nega birinchi |
|---|---|---|
| 1 | `Sozlama.tsx:196` `useMemo` ni `if (a.err) return` dan yuqoriga ko'chirish + `<Konsol/>` atrofiga ErrorBoundary | Butun panelni oq ekrandan qutqaradi, 1 qatorlik o'zgarish |
| 2 | 7 ta YOLG'ON toastni haqiqatga keltirish (`ok` tekshirish) | Panelga ishonchni tiklaydi |
| 3 | `App.tsx:3718` Telegram-ulash tuzatilsin | Yagona ma'lumot buzadigan xato |
| 4 | `willDraw` ni haqiqiy hovuzdan hisoblash (`oyinService.ts:1224`) + 6 sababni tarjima qilish | Tirajni ishlaydigan qiladi |
| 5 | `oyin/ui.tsx` dagi `useAct()` helperi butun panelga tarqatilsin | 62 ta jim tugmani bitta manbadan tuzatadi |
| 6 | ESLint + `react-hooks/rules-of-hooks` CI `shield` ishiga qo'shilsin | Bu sinf xatolar qaytmasin |
| 7 | v2 haqida ONGLI qaror: tugatish yoki tashlash | Hozir ikki xil haqiqat yaratyapti |

---

# 4. JONLI HOLAT (bazadan olingan raqamlar)

| Ko'rsatkich | Qiymat | Manba |
|---|---|---|
| Bazadagi jami karta | **6** | `oyin:tickets:26` — butun bazada `oyin:tickets:` prefiksli **bitta** qator **[TASDIQ]** |
| Karta egasi | **member #26 = Sarvarxon @Sarvarxonh, +998906391026 (EGA)** | `TelegramUser` **[TASDIQ]** |
| Boshqa odamlarda karta | **0** | **[TASDIQ]** |
| Karta raqamlari | 729478, 729485, 729486, 729487, 729491, 729492 | **[TASDIQ]** |
| Sovrinlar bo'yicha | uzum-ac-artel-6 = 2 · a26-5g = 1 · tecno-spark = 1 · air31 = 1 · elektr-choynak = 1 (bu sovrin katalogdan **o'chirilgan**) | **[TASDIQ]** |
| Global karta hisoblagichi | `oyin:ticketno = 729492` (729475 dan boshlangan → 18 raqam berilgan, 6 tasi tirik) | **[TASDIQ]** — ~12 ta karta bekor qilingan, audit izi tekshirilmadi **[EHTIMOL]** |
| Mavsum | **s2 «Qaynoq Yoz»**, 2026-08-10 17:28 +05 → 2026-09-25, faza `active` | **[TASDIQ]** |
| `oyin` bayrog'i | **DARK** — bazada `feature:oyin` qatori **umuman yo'q**, `featureFlags.ts:182` DEFAULT_OFF | **[TASDIQ]** |
| `oyinMinSellPct` | **100** (`bonus:econ`) → `minSell = limit` | **[TASDIQ]** |
| Katalog | 35 aktiv sovrin, eng arzon 55 ball | kontekst **[EHTIMOL]** |
| G'oliblar | **0** — `oyin:winner:*` bo'sh | **[TASDIQ]** |
| Tiraj ro'yxati | `GET /api/admin/oyin/draw` → `{"tickets":[], "excludedStaff":6}` | **[TASDIQ]** |
| Muzlatish | `{"frozen":false, "ticketCount":0}` | **[TASDIQ]** |
| Ball to'plagan a'zolar | **869** — hech biri karta sotib **OLOLMAYDI** (bayroq DARK) | **[TASDIQ]** |
| Abadiy qulflangan sovrinlar | **4 ta** (2.5-bo'limdagi jadval) | **[TASDIQ]** |

**Muhim izoh:** ball hech kimga «yozib berilmaydi» — u har so'rovda safar/buyurtmalardan **qayta hisoblanadi** (`oyinService.ts:320-355`). Ya'ni bayroqni mavsum tugashidan **oldin** yoqsangiz, 869 a'zoning balli to'liq paydo bo'ladi va hech narsa yo'qolmaydi. Kechikish faqat mavsum tugagandan **keyin** yoqilsa zarar qiladi. **[TASDIQ]**

---

# 5. QAMRALMADI

| Nima | Nega |
|---|---|
| **Jonli panelni brauzerda ochib bosib ko'rish** | Faqat-o'qish topshirig'i + parol yo'q. Barcha «ekranda nima ko'rasiz» da'volari **manba kodidan** o'qildi |
| **Jonli deploy qilingan bundle** (`/var/www/admin/assets/*.js`) grep qilinmadi | SSH yozuv-rejimida ishlatilmadi. Xulosalar `main` shoxobchasidagi manba kodiga tegishli. CLAUDE.md DoD R4 bo'yicha bu **isbot emas** |
| **`oyin.css` (26 KB)** | `pointer-events` / `z-index` / scrim ustma-ustligi tugmani **ko'rinib turib bosilmaydigan** qilishi mumkin — tekshirilmadi. Agar «bosilmayapti» degan holat bo'lsa, alohida audit kerak |
| **`design/*.tsx` (34 onClick)** va **jamoa.tsx ning ko'p qismi (53 onClick)** | Qamrov admin panel + o'yin edi |
| **Server handlerlarining ICHKI mantiqi** | Faqat route mavjudligi + middleware zanjiri tekshirildi. «Route bor» ≠ «route to'g'ri ishlaydi» |
| **~12 ta yo'qolgan karta raqamining taqdiri** | `AdminAuditLog` jadvali o'qilmadi |
| **Ega brauzerida `localStorage.admin_ui` qiymati** | Faqat siz ko'ra olasiz: DevTools → Application → Local Storage. Agar `"v2"` bo'lsa — o'yin konsoli siz uchun mavjud emas, `#v1` + **F5** qiling |
| **`sim/playFullGame.ts` simulyatsiyasi** | Yugurtirilmadi. U 2-savoldagi tiqilinchni allaqachon 🔴 deb belgilagan (`:790-806`), lekin CI qalqonida yurmaydi |

---

# 6. RAD ETILGAN DA'VOLAR (tekshirdim — noto'g'ri chiqdi)

| Da'vo | Verdikt | Nega |
|---|---|---|
| «Topshirildi» tugmasi yolg'on tasdiq beradi | **RAD** | Tugma faqat mavjud+parse bo'ladigan bayonnoma qatorida chiziladi; `{ok:false}` shoxobchasiga **erishib bo'lmaydi**. Qoladigan nuqson yengilroq: `.catch` yo'qligi (jim) |
| v2 dagi «Jonli» ekrani va 8 ta tugma `operatorAssist` flagi ortida o'lik | **RAD** | Jonli bazada `feature:operatorAssist = on` (2026-07-29). Tugmalar **tirik** |
| «Kartalar ko'rinmaydi» — `feature:oyin` yo'qligi bug | **RAD** | Bu **ongli biznes qarori** (DARK until QABUL), kod nuqsoni emas. Va mijoz «yopiq eshikka urilmaydi» — o'yin ekrani unga **umuman ko'rinmaydi** |
| Yetim karta №729478 mijozga «tirajga tushadi» deb yolg'on va'da beradi | **RAD** | `willDraw` mijozda faqat **bekor tugmasini** yashiradi; «tirajga tushadi» degan matn yo'q. Qoladigan nuqson kosmetik (sovrin nomi o'rniga xom kalit) |
| v2 dagi bo'sh ekranlar «bo'sh sahifa» | **RAD** | Sarlavha + halol matn + **ishlaydigan** «← Eski panelga qaytish» tugmasi bor |
| «chatops roli uchun v2 majburiy» (kod izohi) | **RAD** | `main.tsx:39` da rol tekshiruvi **yo'q**; operator v1 ichidagi `OperatorConsoleShell` ga tushadi (`App.tsx:184`). **Izoh kodga zid — o'zi tuzatilishi kerak** |
| 58 ta o'lik tugma egani chalkashtiradi | **QISMAN RAD** | Ular **ekranga chizilmaydi va jonli bundle'ga ham tushmaydi** (tree-shake tekshirildi) — ega ularni ko'rmaydi. Zarar faqat kod o'qiyotgan agentga |

---

## YAKUNIY BAHO — xushomadsiz

**Yaxshi:** marshrut qatlami 100% butun (0 ta buzuq api↔route), server darvozalari to'g'ri, tiraj mexanizmi texnik jihatdan to'g'ri qurilgan (hash, muzlatish, ustidan-yozib-bo'lmaslik), yangi o'yin konsolining o'qish ekranlari xatoni ochiq ko'rsatadi.

**Yomon:** panel **ishonchsiz gapiradi** — 7 joyda yolg'on tasdiq, ~62 joyda mutlaq jimlik, 5 joyda bir xil sarlavha ostida ikki xil raqam, 1 joyda butun panelni o'ldiradigan hook xatosi. Bular kod **buzuqligi** emas, **xabar berish** qatlamining yo'qligi — shuning uchun tuzatish arzon, lekin ishonchni tiklash qimmat.

**Eng shoshilinch:** `Sozlama.tsx:196` (oq ekran) va `oyinService.ts:1224` (`willDraw` — jonli efirda portlaydi).
