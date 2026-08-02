# BIRJOY O'YINI v9.2 — "KOSON O'YINI" (SODDALASHTIRILGAN, 4-QADAM + ONBOARDING)

*2026-08-01 · v9.0: Mystery Box olib tashlandi, progress-tavsiya/countdown/imkoniyat-%/g'oliblar-
tarixi qo'shildi. v9.1 — ega tuzatishi: VIRAL — bosh maqsad, taklif ENG KATTA mukofot bo'lib
QOLADI (40+120, o'zgarmagan), USTIGA do'stning har safari (kam yursa ham) taklifchiga +10 doimiy
oqim qaytarildi — murakkab % emas, oddiy flat son ("do'sting yursa — senga +10"). Bu oqimning
o'zi ham taklif-motivatsiyasi: faol do'st = doimiy daromad. Jamoam paneli ham qaytdi.*

---

## 0. SO'NGGI O'ZGARISH

Ega bahosi: Viral 9.5/10, Gamifikatsiya 9/10, Iqtisod 8/10, **Tushunarlilik 6.5/10** — asosiy
muammo shu oxirgisi.

| ❌ Olib tashlandi | Sabab |
|---|---|
| Referral **%**-ulush (foiz-hisob) | "% juda murakkablashadi" — LEKIN doimiy oqim g'oyasi SAQLANDI, faqat flat songa almashdi (+10/safar). Ega yakuniy tasdig'i: "o'zi safar qilishi VA birovni safarga undashi — eng muhim joyi; 'do'stingiz safar qildi, sizga ball qo'shildi' + 'sen Azizga yordam beryapsan' — mukammal kuchli g'oya" — bu YORDAM ZANJIRI (§2.1) endi rejaning yuragi |
| **Mystery Box** butunlay | "Ball→Chipta→Sovrin allaqachon bor, yana Box qo'shsang yana random, yana animatsiya, yana tushuntirish" — ega. Golden Ticket/Double Ball/Cashback Booster ham shu bilan ketdi |
| Mahalla-reytingi (1-mavsum) | Allaqachon 2-mavsumga surilgan edi — ega qayta tasdiqladi: "Arabxona yutsa — mening nima foydam? Hech qanday, faqat kanal-post bo'lib qolsin" |
| Ortiqcha push | Box-FOMO/sprint-push yo'q; yordam-zanjiri pushi QOLADI lekin jilovlangan (bir do'st = kuniga max 1, `notifyOnce`) |

| ✅ Qo'shildi | Nega arzon (aynan soddalashtirish tufayli) |
|---|---|
| **Progress-tavsiya** ("320 ball qoldi — 2 do'st + 3 safar") | Ball-manbalar aniq flat sonlar (referral 40/120/10, safar 30, login 2) — arifmetika sodda va halol hisoblanadi, % yo'q |
| **Countdown** (kun:soat:daqiqa) | Mavjud mavsum-tugash sanasidan oddiy hisoblash |
| **Aniq imkoniyat-%** ("438 chiptadan sizniki 3 — 0.68%") | Allaqachon rejalashtirilgan N-limit hisoblagichdan bepul — sizning/jami nisbat |
| **G'oliblar-tarixi** ("O'tgan oy: Aziz Sh. — Blender yutdi") | Har mavsum yakunida yozib boriladi, 2-mavsumdan haqiqiy tarix ko'rinadi |
| QR Status Card | Saqlanadi — ega o'zi "TOP-3 g'oya" deb baholadi |

*(v9.0 da "Jamoam" panelini son-hisobotga qisqartirish taklif qilingan edi — ega RAD ETDI:
doimiy +10 oqim qaytgani bilan panel yana to'liq ma'noga ega, §6.4 da to'liq qaytarildi.)*

---

## 1. FOYDALANUVCHI KO'RADIGAN 4 QADAM (asosiy pitch — 15 soniyada tushunarli)

> 1. **BirJoy Mini Appga kiring.**
> 2. **Ball yig'ing** — safar qiling, do'st chaqiring. Do'stingiz har yurganda ham sizga ball.
> 3. **Ballni chiptaga almashtiring.**
> 4. **Oy oxiridagi jonli tirajda real sovrin yutish imkoniyatiga ega bo'ling.**

Shundan boshqa hamma narsa — hikoya-isbot, sprint, homiy, admin-knoblar — **ICHKI qatlam**:
qiziquvchi/faol foydalanuvchi keyinroq kashf qiladi, lekin birinchi ekranda, marketing-postda,
start-xabarida FAQAT shu 4 qadam bor.

### 1.1 ONBOARDING — qanday o'ynashni O'RGATISH (GIF + qisqa yozuv + hintlar)

O'yin birinchi ochilganda **4 ta mini-slayd** (4-qadam pitchning vizual ko'rinishi): har birida
kichik animatsiya/GIF + BITTA qator yozuv, "O'tkazib yuborish" har doim ko'rinadi, jami <15 soniya:

| Slayd | Animatsiya (kichik, yengil) | Yozuv (bitta qator) |
|---|---|---|
| 1 | Taksi yurib, ball sanagichi o'sadi | "Safar qil — har safarga +30 ball" |
| 2 | Ikki telefon, o'rtada 🤝, ikkalasida ball o'sadi | "Do'st chaqir — u yursa senga ham ball tushadi" |
| 3 | Ball → 🎟 chiptaga aylanadi | "400+ ball = chipta. Chipta — ishtirok, g'alaba emas" |
| 4 | 🎁 tiraj barabani, sovrinlar | "Oy oxiri — jonli tiraj. Real sovrinlar!" |

**Kontekst-hintlar** (har ekranda birinchi kirishda BIR marta, kichik balonchik): vitrinada
"Chipta olganingda ball yechiladi", Jamoamda "Taksi KO'P chaqiradigan tanishingni chaqir — u
senga eng ko'p yordam beradi", reytingda "Har hafta top-3 bonus oladi". Ko'rilgani localStorage +
`oyin:onboard:<id>` markerda — qayta chiqmaydi.

### 1.2 SAHNA-BA-SAHNA (ega uchun qisqa xarita — har ekran nima qiladi)

1. **Uy kartasi** (`uy.tsx`): ball + o'rin + countdown + "Do'st chaqir" tugma. Bir qarash — bir
   tushuncha: "men qayerdaman, nima qilay".
2. **O'yin ekrani** (`oyin.tsx`): 4-qadam + mening ballarim qayerdan kelgani (safar/do'st/bonus).
3. **Vitrina** (`vitrina.tsx`): 5 sovrin kartasi — har birida progress, aniq imkoniyat-%,
   countdown, "eng tez yo'l" tavsiyasi, g'oliblar-tarixi.
4. **Chipta xaridi**: tasdiq-oyna ("640 ball yechiladi, chipta №databaza-raqami, ishtirok —
   g'alaba emas") → muvaffaqiyat-ekran.
5. **Jamoam**: do'stlar ro'yxati + kunlik minnatdorchilik-kartasi ("Aziz bugun 3 safar 🔥 sizga
   +30 olib keldi") + "Uyg'ot" + jami-hisobot.
6. **Reyting**: oy/hafta top-50 + mening o'rnim doim ko'rinadi.
7. **QR status-karta**: "N-o'rindaman, sen nechanchisan?" — ulashish tugmasi.
8. **Hikoya-isbot**: karta → Story → skrinshot botga → tasdiq → +100.
9. **Tiraj kuni**: vitrina qizil "muzlagan" holatda, jonli video havolasi.
10. **Mavsum yakuni**: yutuq/konvertatsiya xulosasi ("qoldiq 180 ball → 90 tanga") + keyingi
    mavsum anonsi.

## 2. BALL JADVALI (soddalashtirilgan)

| Harakat | Ball | Cheklov |
|---|---:|---|
| Telefon tasdiqlash | 20 | 1 marta |
| Birinchi taksi safari (hayotda) | 80 | 1 marta |
| Oddiy taksi safari | 30 | CHEKSIZ (kunlik cap yo'q) |
| Do'st telefon uladi (taklifchiga) | 40 | CHEKSIZ, telefon-dedup |
| Do'st birinchi safarini qildi (taklifchiga) | 120 | CHEKSIZ, kas tasdig'i |
| **Do'stimning har safari (taklifchiga)** | **+10** | **CHEKSIZ, flat — % emas** |
| Kunlik kirish (miniapp ochish) | 2 | kuniga 1 |
| Sovrinni ulashish | 5 | kuniga 1 |

Bor-yo'g'i **8 ta qator** — hammasi bitta valyutada (ball), hammasi `BONUS_ECON_KNOBS` orqali
admin panelidan sozlanadi (§7.1).

### 2.0 BALL IERARXIYASI — qaysi harakat eng ko'p beradi (ega qarori 2026-08-02)

Bu **dizayn qonuni**, shunchaki raqamlar emas: harakat qanchalik **ijtimoiy** (bizga yangi odam
yoki yangi ko'z olib kelsa) — shuncha ko'p ball beradi. Yolg'iz qilinadigan ish eng kam beradi.

| O'rin | Harakat | Nega shu o'rinda |
|:--:|---|---|
| 🥇 **1** | **Hikoya joylash** (story + admin tasdig'i) | Bizga tashqi auditoriya olib keladi — mijozning butun tanishlari ko'radi. Eng qimmat harakat, shuning uchun eng ko'p ball |
| 🥈 **2** | **Do'stning safari** | Yangi mijoz **va** yangi safar — ikki tomonlama foyda. Yordam zanjirining yuragi (§2.1) |
| 🥉 **3** | **O'z safari** | Asosiy biznes, lekin bir martalik qiymat — faqat o'sha safar |
| **4** | **Ulashish** (ilova ichida) | Eng arzon harakat, isbot talab qilmaydi — shuning uchun eng kam |

**⚠️ Hozirgi raqamlar bu tartibga ZID** (tekshirilgan, `packages/shared/src/economy.ts:240-250`):

| Harakat | Hozir | Bo'lishi kerak | Izoh |
|---|--:|--:|---|
| Hikoya (1-o'rin) | 100 | **150** | Eng yuqori bo'lib qolishi kerak, farq sezilarli bo'lsin |
| Do'st safari (2-o'rin) | **10** | **40** | ❌ hozir o'z safaridan 3× KAM — tartib teskari |
| O'z safari (3-o'rin) | 30 | 30 | o'zgarmaydi |
| Ulashish (4-o'rin) | 5 | 10 | eng past bo'lib qoladi, lekin ko'rinarli bo'lsin |

Ya'ni **bitta o'zgarish yetarli emas — ikkitasi kerak**: do'st-safari 10 → 40 (asosiy tuzatish)
va hikoya 100 → 150 (1-o'rinni mustahkamlash). Qolgan ikkitasi tartibga o'zi mos.

**Nega do'st-safari o'z safaridan ko'p bo'lishi shart:** shunda taklif qilish **dominant
strategiya** bo'ladi. Mijoz "o'zim yuraymi yoki do'st chaqiraymi" deb o'ylaganda javob aniq —
do'st chaqirish foydaliroq. Bu aynan viral halqani tezlashtiradi.

**⚠️ Yangi xavf va uni yopish (majburiy, shu o'zgarish bilan BIRGA):**

Do'st-safari 40 ga chiqsa, 20 ta faol do'sti bor odam oyiga ~8000 ball yig'adi — bu bitta sovrinning
BARCHA chiptalarini sotib olishga yetadi (masalan voucher: 15 o'rin × 600 = 9000). Pul tomonda xavf
YO'Q (mavsum yopilishida odam boshiga eng ko'pi 500 tanga — `seasonClose` clamp), lekin **sovrin
adolati buziladi**: bitta odam butun tirajni egallab oladi.

Yechim: **bitta odam bitta sovrinning eng ko'pi N ta chiptasini oladi** — yangi knob
`oyinMaxTicketsPerPrize` (def **3**). `buyTicket` da tekshiriladi, `OyinBuyResult.reason` ga
`own_limit` qo'shiladi, vitrinada "Sizniki: 3/3 — limitga yetdingiz" ko'rinadi.

Bu qoida ierarxiyaning o'zini buzmaydi: ko'p ball yig'gan odam **boshqa** sovrinlarga chipta oladi,
ya'ni ko'p ball hali ham foydali — lekin bitta sovrinni monopoliya qila olmaydi.

### 2.1 YORDAM ZANJIRI — o'yinning YURAGI (ega: "mukammal kuchli g'oya, katta urg'u")

O'yinning eng muhim joyi: **o'zi safar qilishi VA birovni safarga undashi.** Taklif eng katta
bir martalik mukofot (40+120=160), USTIGA do'stning har safari doimiy +10 oqim — kam yursa ham
tomchilab keladi, faol yursa daryo bo'ladi. Bu ikki tomonlama, uchala tomon ham KO'RIB TURADI:

- **Taklifchiga** (har do'st-safarda): *"🤝 Do'stingiz Aziz safar qildi — sizga +10 ball
  qo'shildi!"* (push, `notifyOnce`, bir do'st = kuniga max 1 — 20% blok saboqi).
- **Do'stga** (o'z safar-tugash kartasida, YANGI xabar emas): *"+30 ball senga · 🤝 sening
  safaring Azizga ham +10 ball berdi — sen unga yordam beryapsan."*
- **Adminga**: faoliyat-jadvalida (§7.2) har juftlik — kim kimga qancha yordam berdi.

Nega bu viralni portlatadi: (1) taklif hali ham dominant harakat — 160 ball ≈ 5 ta o'z safari;
(2) doimiy oqim taklifchini do'stini FAOL QILISHGA undaydi ("yur, birga yuramiz"); (3) do'st o'zi
yordam berayotganini ko'rib, o'zi ham taklifchi bo'lishga o'tadi (ikkinchi doira — oilaviy
aloqalar tugagach ham tarmoq davom etadi); (4) hammasi flat va sodda — % yo'q, jadval yo'q,
"do'sting yursa senga +10" — bitta gap.

## 3. SOVRIN-NARX KATALOGI (1-mavsum)

| Sovrin (real narx) | Ball-narx | Dona | Kimning kurashi |
|---|---:|---|---|
| 30k voucher | 600 | 15 | Oddiy + 1-2 do'st — OMMA, kirish darajasi |
| Choy serviz (~120k) | 1000 | 5 | Oddiy + 3-4 do'st |
| Dazmol (~180k) | 1500 | 4 | Faol safarchi + do'stlar |
| Blender (~350k) | 2200 | 3 | Faol (persona ~1170) |
| **Air Fryer (~800k)** | 3200 | 1 | Super-taklifchi/whale — 1-mavsum cho'qqisi |

Jami **28 chipta-o'rin**. (🚲 Velosiped — kelgusi "Velosiped Mavsumi"ga saqlangan, §17.1.)

### 3.1 Persona-ballar (yangilangan, box/% siz)

| Persona | Hisob | Oylik ball | Yetadi |
|---|---|---:|---|
| Oddiy (5 safar) | 150+login 30+ulashish 20 | ~200 | Voucher (600)ga yetmaydi — **do'st chaqirish shart**, ega tanlagan dizayn |
| Oddiy + 2 faol do'st | 200 + 2×160 + 2×4 safar×10 | **~600** | **Voucher✓ — "2 faol do'st = voucher", marketing gapi tayyor** |
| Yangi odam (do'st orqali, 4 safar) | 20+80+3×30+40 | ~230 | Voucher'ga yaqin |
| Faol (12 safar+4 faol do'st) | 360+4×160+4×4×10+90 | ~1250 | Serviz✓, Dazmolga yaqin |
| Super-taklifchi (5 safar+15 faol do'st) | 150+15×160+15×4×10+90 | ~3240 | **Air Fryer (3200)✓ — cho'qqiga yo'l TAKLIF orqali** |
| Whale (60 safar+10 do'st) | 1800+10×160+10×4×10+90 | ~3890 | Air Fryer✓ + qo'shimcha chipta |

Faqat safar bilan hech qanday sovringa yetib bo'lmaydi (do'st chaqirish majburiy yo'l — viral
dizayn), "2 faol do'st = voucher" esa eng sodda va'da. Cho'qqi (Air Fryer) super-taklifchiga
whale'dan oldinroq ochiladi — o'yin aynan taklifni eng yuqori baholaydi.

## 4. CHIPTA QOIDASI + KO'RSATISH (YANGI 4 element bilan)

- Ball bir umumiy hovuz — max-sovrin cap YO'Q, bir necha marta chipta sotib olish ochiq (har
  chipta alohida raqamlangan).
- Chipta YECHILADI (ball kuyadi), qaytarilmaydi — **chipta = ishtirok, g'alaba emas** (har
  kartada majburiy matn).
- Har sovrinda qat'iy N-limit — reserve→tekshir→rollback atomik hisoblagich
  (`economyService.ts`dagi withdraw-byudjet naqshi ko'chiriladi) — parallel so'rovda ham
  HECH QACHON oshmaydi.

**Har sovrin kartasida 4 yangi element:**

```
AIR FRYER — 800 000 so'm
████████░░░░░░░  2340 / 3200 ball
🎟 Sizniki: 3 · Jami: 438 chipta · Imkoningiz: ≈0.68%
⏳ 18 kun 4 soat 11 daqiqa qoldi
💡 Eng tez yo'l: 2 ta do'st + 3 ta safar (860 ball qoldi)
🏆 O'tgan mavsum g'olibi: — (1-mavsum, hali yo'q)
```

1. **Aniq imkoniyat-%** — sizning-chipta / jami-chipta-shu-sovringa, real vaqtda yangilanadi
   (N-limit hisoblagichidan bepul olinadi).
2. **Countdown** — kun:soat:daqiqa, mavjud mavsum-tugash sanasidan.
3. **Progress-tavsiya** — sodda arifmetika: `qolganBall`ni avval do'st-blokka (160 ball/do'st)
   bo'ladi, qoldig'ini safar-blokka (30 ball/safar) — natija "N do'st + M safar" qilib
   ko'rsatiladi. Hech qanday AI kerak emas, faqat aniq son.
4. **G'oliblar-tarixi** — har mavsum yakunida yoziladi (`oyin:winners:<season>`); 1-mavsumda
   bo'sh — "hali yo'q" ko'rsatiladi (xato emas, kutilgan holat), 2-mavsumdan haqiqiy ism chiqadi.

## 5. QR STATUS KARTA (o'zgarmadi — "TOP-3 g'oya")

**Texnik:** `qrcode` npm + `genDriverStickers.ts`dagi branded-karta naqshi, `referralService.ts`
`inviteLink(code)`ga bog'langan. Bot orqali (`sendPhoto`) yuboriladi + miniappda "Yuklab olish".

**Matn — reyting-asosli:** "Men Koson O'yinida Air Fryer poygasida **N-o'rindaman**. Sen
nechanchisan?" — generatsiya vaqtida jonli o'rin o'qiladi, statik-kesh yo'q.

## 6. ICHKI QATLAM (4-qadam pitchga kirmaydi — faol foydalanuvchi keyinroq kashf qiladi)

### 6.1 Jonli reyting + haftalik sprint

Oy/hafta reyting (individual) — o'rin ko'rinadi. Haftalik sprint (Du–Ya top-3 → +100 ball bonus,
kanal-POST — shaxsiy push emas, spam-hissa qo'shmaydi). Bir odam 4 haftada max 2 marta.

### 6.2 Hikoya-isbot bonusi (ixtiyoriy, foydalanuvchi o'zi boshlaydi — push emas)

Odam QR-status kartasini (§5) Telegram Story qilib qo'yadi, skrinshotini botga yuboradi. Kod-
asosi TAYYOR: `bot.ts:458-501` (`:photo` handler) + haydovchi-rasm `dphoto:ok|no` naqshidan
ko'chirilgan `storyproof:ok|no` (owner Telegramda bosadi). **Cheklov:** mavsumda max 3 marta,
submissionlar orasida min 8 kun. Har tasdiqlangan — **+100 ball**.

### 6.3 Haftalik aylanma-vazifa (kanal-post, `campaignService` orqali, kod o'zgarmaydi)

| Hafta | Vazifa | Ball |
|---|---|---:|
| 1 | "3 kunlik zanjir" — ketma-ket 3 kun ≥1 safar | +50 |
| 2 | "Yakshanba x2" — bir kunlik barcha ball 2x | — |
| 3 | "Do'stlar poygasi" — haftada eng ko'p yangi do'st (top-5) | +150 |
| 4 | "Kechqurun soati" — 19:00-22:00 safarlar bonusi | +10/safar |

### 6.4 JAMOAM paneli (yordam-zanjirining interfeysi — §2.1 ga xizmat qiladi)

*"Jamoam (7): Aziz ✅ bugun yurdi +10 · Malika 💤 5 kun jim → [Uyg'ot]"* — kim yurdi (qancha
keldi), kim jim. **"Uyg'ot" bot xabar YUBORMAYDI** — tayyor matn bilan Telegram share ochadi
("Malika, yur birga — menga ball, senga sovg'a"): spam-riski nol. Pastida jami-hisobot: "7 kishi
taklif qildingiz — jami +1240 ball keldi (640 bir martalik + 600 safar-oqimi)".

**🧲 Minnatdorchilik-kartasi (psixologik magnit, ega tavsiyasi):** do'st bir kunda bir necha
safar qilsa, panelning tepasida kunlik-JAMLANGAN karta: *"Aziz bugun 3-safarini qildi 🔥 —
sizga bugun +30 ball olib keldi"*. Foydalanuvchi do'stining faolligini ko'rib minnatdorchilik va
do'stona iliqlik his qiladi — bu retention emas, MUNOSABAT mexanikasi. Texnik jihatdan bepul:
o'sha kunlik `CoinTxn` yozuvlaridan `groupBy(referral, kun)` — yangi saqlash yo'q. (Push EMAS —
faqat panel-karta; push-qoida o'zgarmaydi: bir do'st = kuniga max 1.)

**🎯 Kimni chaqirish HINTI (ega g'oyasi):** bo'sh/kam-jamoali holatda va ulashish-oqimida doimiy
maslahat: *"Taksi KO'P chaqiradigan tanishingizni chaqiring — u sizga eng ko'p yordam beradi"*.
Bu oddiy matn, lekin nishonlashni o'zgartiradi: eng qimmatli taklif — allaqachon faol yuruvchi
odam (birinchi safarni kutish shart emas, oqim darhol boshlanadi).

### 6.5 Homiy (Sponsor)

Faqat vizual — admin panelidan brend (nom+rasm), sozlanmasa BirJoy default. `AppState`
`sponsor:current` = `{name, photoUrl?, photoFileId?, active}` (`RavellaItem` naqshi). Foydalanuvchi
uchun yangi tushuncha emas, faqat logotip.

## 7. ADMIN NAZORAT MARKAZI (butunlay ichki, dasturchi/ega uchun)

### 7.1 Har ball-qiymati — live knob

`BONUS_ECON_KNOBS` (`economy.ts:142-235`) ga `"Koson O'yini"` guruhi — §2 dagi 8 ball-son
(jumladan do'st-safar-oqimi +10). Admin panel (`App.tsx:749-778`) avtomatik chizadi, admin-kod
kerak emas.

### 7.2 Kim-nima-qildi jadvali (yangi qurilish)

`CoinTxn` asosida `GET /api/admin/oyin/activity` — sana, a'zo, harakat turi, ball. Hozir bunday
ko'rinish yo'q (tekshirilgan).

## 8. BYUDJET (Mystery Box/referral-% olib tashlangani bilan kamaydi va soddalashdi)

| Sovrin/fond | Dona | Real pul |
|---|---|---:|
| 30k voucher | 15 | (emissiya 450k tanga) |
| Choy serviz | 5 | 600k |
| Dazmol | 4 | 720k |
| Blender | 3 | 1.05M |
| Air Fryer | 1 | 800k |
| Oylik top-3 tanga | 3 | (emissiya 180k) |
| Konvertatsiya 50% | — | (emissiya ~30-50k) |
| **JAMI real pul (buyum)** | | **~3.17M** (homiy tannarxda ~2.2-2.5M) |
| **JAMI emissiya (tanga)** | | ~670k 🔽 (v8.0: ~970k — Mystery Box fondi ≤300k yo'qoldi) |

## 9. TAYMLAYN (30 kun) — o'zgarmadi

Kun 1 START · 2-7 jonli post · haftalik sprint/vazifa tsikli (§6.1/§6.3) · Kun 14 NAZORAT/KILL ·
25-27 hikoya-isbot eslatma · 28-29 chipta yopiladi · Kun 30 TIRAJ SHOU · Kun 31 yakun+konvertatsiya.

## 10. TEXNIK REJA (schema YO'Q, poller YO'Q — v8.0 dan SEZILARLI kichikroq)

| # | Fayl | O'zgarish |
|---|---|---|
| 1 | `shared/src/economy.ts` | `BONUS_ECON_KNOBS`ga 8 yangi knob (§7.1, jumladan do'st-safar-oqimi +10) — box/buff/% knoblari YO'Q |
| 2 | `shared/src/oyin.ts` (yangi) | Sovrin-katalog (§3), tiplar |
| 3 | `services/oyinService.ts` (yangi ~350 satr, v8.0: ~500) | `getBall`, `buyTicket` (N-limit reserve/rollback), `getBoard`, `getVitrina` (§4 ning 4 elementi: %, countdown, tavsiya, tarix), `drawExport`+`recordSeasonWinners`, `sprintCheck`/`seasonClose` |
| 4 | `services/sponsorService.ts` (yangi ~40 satr) | `AppState sponsor:current` CRUD |
| 5 | `services/referralQrService.ts` (yangi ~60 satr) | `qrcode`+`genDriverStickers.ts` naqshi |
| 6 | `bot/bot.ts` | `:photo` handlerga hikoya-isbot filiali + `storyproof:ok|no` |
| 7 | `api/server.ts` | `/api/oyin/{state,vitrina,board,taklifларим,qr-card}` (GET) · `/ticket`,`/share`,`/storyproof` (POST) · `/api/admin/oyin/activity` |
| 8 | `bookingNotifier.ts` | `:685-707` mavjud do'st-safar bloki yonida: (a) safar-tugash kartasiga ball qatori + "🤝 Azizga ham +10" yordamchi-qatori (o'sha kartada, yangi xabar EMAS); (b) taklifchiga +10 grant (idempotent, `bookingId` kalit); (c) taklifchiga push (`notifyOnce`, bir do'st = kuniga max 1) |
| 9 | `index.ts` tick | Sprint + limit-postlar + haftalik-vazifa + 28/31-kun — idempotent |
| 10 | `miniapp`: `oyin.tsx`, `vitrina.tsx`, `uy.tsx` | §1 (4-qadam), §4 (countdown/tavsiya/%/tarix), skeleton, token-stil |
| 10b | `miniapp`: onboarding (oyin.tsx ichida) | §1.1: 4 mini-slayd (yengil CSS-animatsiya/kichik GIF ≤200KB har biri, token-stil), kontekst-hintlar, localStorage+`oyin:onboard:<id>` marker |
| 10c | `miniapp`: Jamoam paneli | §6.4: minnatdorchilik-kartasi (kunlik `groupBy`, yangi saqlash yo'q) + kimni-chaqirish hinti |
| 11 | `packages/admin/src/App.tsx` | Faoliyat-jadval tab + Homiy-kartochka |
| 12 | `featureFlags.ts` | `oyin` DEFAULT_OFF |
| 13 | `channelService` | Start/sprint/limit/tiraj postlari |

~~`oyinBoxService.ts`~~, ~~`oyinBuffService.ts`~~, ~~`cashbackService.ts` booster-in'eksiyasi~~ —
**olib tashlandi** (Mystery Box bilan birga).

**DoD (qisqargan, box/buff/% bandlari yo'q):**
- D1 flag OFF = hech narsa ko'rinmaydi
- D2 ball hisobi 3 real kishi uchun psql qo'lda = API
- D3 safar-ball CHEKSIZ (kod-cap yo'q)
- D4 do'st-ball uch manba: ulash 40 (1×/do'st) + birinchi-safar 120 (1×/do'st) + har-safar +10
  (CHEKSIZ, har safar uchun aynan 1 marta — `bookingId`-idempotent, psql bilan isbot)
- D4b yordamchi tomonida "🤝 Azizga ham +10" qatori ko'rinadi (real render); jamoasiz odamda bu
  qator YO'Q
- D5 chipta: max-sovrin cap yo'q, takroriy xarid ishlaydi, idempotent, N-limit to'lganda rad
- D6 tiraj-eksport muzlatish 3× → 1 natija, g'oliblar `oyin:winners:<season>`ga yoziladi
- D7 poller/schema diff yo'q
- D8 **push-turlari soni cheklangan**: grep bilan barcha yangi shaxsiy-push chaqiruvlari
  sanaladi (kutilgan: 2 tur — yordam-zanjiri "do'stingiz safar qildi +10" [bir do'st = kuniga
  max 1, `notifyOnce`] va hikoya-isbot tasdiq/rad; sprint/vazifa CHANNEL-post, shaxsiy emas)
- D9 tanga limitlari: 41%/21k/101k rad
- D10 14-kun metrika skripti bitta buyruqda
- D11 ega/xodim: chipta/sprint/top-3/tiraj dan chetda
- D12 flag ON dan keyin REAL MIJOZ akkauntida ko'rinadi
- D13 `oyin:` prefiksi AppState tozalash ro'yxatlarida yo'q
- D14 emissiyalar clamp-TASHQARI, jami bitta SELECT'da ≤670k
- D15 konvertatsiya: ≥1 safarlilarga, max 500 tanga/odam, idempotent
- D16 vitrina-matn: chipta soni har doim aniq raqam + "ishtirok, g'alaba emas" har kartada
- D17 knob-o'zgarishi 60s ichida API javobiga ta'sir qiladi
- D18 admin faoliyat-jadvali to'g'ri ko'rinadi
- D19 homiy: sozlanmaganda "BirJoy" default
- D20 shaxsiy QR-karta <2s, jonli o'rin bilan (statik-kesh yo'q)
- D21 hikoya-isbot: mavsumda max 3, orada min 8 kun
- 🆕 D22 **imkoniyat-%**: sizning/jami hisob to'g'ri, real vaqtda yangilanadi (yangi chipta
  sotilganda hammaning % pasayadi — bitta psql tekshiruvi bilan isbot)
- 🆕 D23 **countdown**: server `seasonEndAt` bilan mos, soniyagacha aniq
- 🆕 D24 **progress-tavsiya**: arifmetika qo'lda tekshiriladi (masalan qolgan=650 →
  "2 do'st + 3 safar" to'g'ri chiqadi: 650÷160=4 qoldiq 10 emas — misol qayta hisoblanadi
  aniq kodda, bu DoD build vaqtida haqiqiy songa moslashtiriladi)
- 🆕 D25 **g'oliblar-tarixi**: 1-mavsumda bo'sh-holat to'g'ri (xato emas), `drawFinal`dan keyin
  yozuv paydo bo'ladi
- 🆕 D26 **onboarding**: birinchi ochilishda 4 slayd chiqadi, "O'tkazib yuborish" ishlaydi,
  ikkinchi ochilishda CHIQMAYDI (marker); har GIF/animatsiya ≤200KB (bundle-hajm isboti)
- 🆕 D27 **minnatdorchilik-kartasi**: do'st bir kunda 3 safar qilganda karta "3-safarini qildi —
  +30" deb JAMLAB ko'rsatadi (psql: kunlik CoinTxn yig'indisi = karta soni)
- 🆕 D28 **kimni-chaqirish hinti**: bo'sh-jamoa holatida va ulashish-oqimida matn ko'rinadi
  (real render isbot)
- Tekshiruv to'liq READ-ONLY. Mustaqil tekshiruv (kod yozmagan sub-agent) har D-satrni
  file:line+natija bilan → "READY" → ega telefonda QABUL → flag ON.

## 11. BIRINCHI 7 KUN — o'zgarmadi (v8.0 §17)

## 12. PROGNOZ — o'zgarmadi (v8.0 §15)

## 13. KELGUSI MAVSUM / IXTIYORIY G'OYALAR (1-mavsumda QURILMAYDI)

### 13.1 🚲 Velosiped Mavsumi
Alohida temaviy spotlight-kampaniya, bugungi tizim (ball/chipta/N-limit/tiraj) to'liq qayta
ishlatiladi, faqat katalog almashadi.

### 13.2 🏘 Mahalla Poygasi ("Arabxona vs Markaz")
Kod-grounding saqlanadi: `Member.mahallaId` JONLI va 39 mahallaga to'ldirilgan (V1.5 bozor,
`mahallaService.ts` — hali repo'da, ARCHITECTURE.md'dagi "o'chirilgan" yozuvi eskirgan);
`MahallaGroup`/`MahallaWeeklyResult` ("W5") schema'da bor-lekin-servissiz, TEGILMAYDI. Yangi
migratsiya kerak emas — mavjud `mahallaId`dan `groupBy`.

### 13.3 🎁 Mystery Box (agar kelajakda qaytarilsa)
Kod-asosi tayyor turadi: `boxService.ts` (`weightedPick`+`openBox`, generik) + `RouletteWheel.tsx`
UI. Hozircha OLIB TASHLANDI (§0) — sabab murakkablik, real ehtiyoj emas.

### 13.4 📈 Referral-% varianti (flat +10 o'rniga foiz — agar kelajakda kerak bo'lsa)
Doimiy oqim hozir flat +10 bilan JONLI (§2.1). Agar kelajakda "faol do'st ko'proq bersin"
foiz-varianti kerak bo'lsa — `shopCashbackPct`/`ravellaCashbackPct` knob-shakli tayyor turadi.

## 14. EGA QARORLARI (qisqargan ro'yxat)

1. Do'st-safar oqimi **+10** (flat) — son tasdiqmi? (5 yoki 15 ham bo'lishi mumkin — admin-knob,
   keyin ham o'zgartirasiz.)
2. Voucher 15 / Serviz 5 / Dazmol 4 / Blender 3 — nisbat tasdiqmi?
3. Haftalik aylanma-vazifa (§6.3): 4 tadan tartib/sonlar tasdiqmi?
4. Hikoya-isbot tasdiqlash: faqat Telegram-tugma (tavsiya) yoki + web-admin ro'yxat ham?
5. G'oliblar-tarixida ism qanday ko'rinsin — to'liq ism+familiya (misolingizdagidek), yoki
   ism+bosh harf (masalan "Aziz Sh.")?
6. Homiy: 1-mavsum uchun nomzod bormi?
7. Boshlanish/homiy-uchrashuv sanasi?

*v9.2 · Tasdiq bilan §10 DoD-birinchi topshiriq fayliga aylanadi.*
