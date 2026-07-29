# MUKAMMAL DASTUR — boshidan tuzatish rejasi

**Sana:** 2026-07-27 · **Holat:** `ega tasdig'ini kutmoqda` · **Muallif:** audit + reja

Bu hujjat 2026-07-27 auditining natijasi. Har band **o'lchangan** — taxmin yo'q. Har tiketda
qabul mezoni (DoD) va uni isbotlaydigan **aniq buyruq** bor. Buyruq natijasisiz hech narsa
"tayyor" deb belgilanmaydi (CLAUDE.md R1).

---

## 0. Auditda topilgani — bir qarashda

| # | Topilma | O'lchov | Darajasi |
|---|---|---|---|
| A | Deploy + kesh tuzog'i: yo'q asset uchun Caddy `index.html` qaytaradi (`Content-Type: text/html`, `immutable` 1 yil) | Sinov: `GET /assets/index-OLDHASH123.js` → **200 + HTML** | 🔴 |
| B | 87 ta test skripti bor, CI ikkitasini yugurtiradi; `TEST_DATABASE_URL` yo'q | `ls src/scripts/test*` = 87 · `ci.yml` = typecheck + simEconomy | 🔴 |
| C | Bayroqlar boshqarilmaydi: doimiy UI-ayrilishga aylangan | **76 bayroq** (49 ON) · **22 ta `!flag` ayrilishi** | 🟠 |
| D | O'lik sxema | **20 jadval 0 satr** (113 modeldan) | 🟡 |
| E | O'lik CSS | **126 klass** hech qayerda ishlatilmaydi | 🟡 |
| F | Gigant fayllar | `admin/App.tsx` **5 383** qator · `server.ts` 2 951 · `bot.ts` 2 255 · `shop.tsx` 2 210 | 🟡 |

**Yopilgan (2026-07-27):** initData poygasi · yolg'on xato matnlari · uy taksi tugmasi · mehmon
rejimi · Do'kon bo'limining 5 yo'qolgan elementi · bo'sh kategoriyalar · `PARFUMERIYA` dublikati ·
hikoyalar · `/logo` · kritik CSS **236 KB → 125 KB** (gzip 50 KB → 25 KB).

---

## 1. QILINMAYDI — o'lchangan va rad etilgan

Bular vaqt va pulni yeydi, foyda bermaydi. Qayta muhokama qilinmaydi.

**Cloudflare qo'yish.** Toshkentdan o'lchandi: bizning Germaniyadagi server **TTFB 0.33 s**,
Cloudflare chekkasi shu provayder uchun **Moskvada** (`colo=DME`) va **0.32 s** — farq yo'q.
CF orqasidagi saytlar sekinroq: discord.com 0.62 s, medium.com 0.62 s.

**Serverni Toshkentga ko'chirish.** Mahalliy hostingdagi eng katta saytlar bizdan sekinroq:
uzum.uz **0.68 s**, olcha.uz **0.76 s**, my.gov.uz **0.92 s** — biz **0.33 s**.

**Sabab:** TCP ulanish HAR manzilga 0.07–0.18 s, mahalliylarga ham. Bu masofa emas, oxirgi
chaqirim (provayder/mobil). Geografiya bilan yutib bo'lmaydi — faqat **kamroq ulanish** va
**kamroq bayt** bilan. Shuning uchun keyingi tezlik ishi CSS/JS hajmida (P3.1).

---

## 2. P0 — xavf yopish (birinchi, boshqa hech narsadan oldin)

### T-A1 · Deploy/kesh tuzog'ini yopish
**Muammo:** `deploy/deploy.sh:22` `rsync -a --delete` eski chunk'larni o'chiradi. Caddy'da
`try_files {path} /index.html` `/assets/*` ga ham tegishli, va `@hashed` matcher o'sha javobga
`immutable, max-age=31536000` qo'yadi. Natija: eski `index.html` keshlangan mijoz JS o'rniga HTML
oladi → modul ishga tushmaydi → **abadiy oq ekran**, javob **1 yil keshlanadi**. `vite:preloadError`
self-heal ishlamaydi (u faqat dinamik importlar uchun). Hozir bizni faqat menyu tugmasidagi
`?v=<hash>` saqlab turibdi — bitta unutilgan yangilanish = jonli avariya.

**Bajariladi:**
1. Caddyfile: `/assets/*` alohida `handle` blokiga chiqariladi, SPA-fallback **yo'q** → yo'q fayl **404**.
2. `deploy.sh`: `--delete` olib tashlanadi, o'rniga oxirgi **3 build** saqlanadi (~4 MB), eskilari tozalanadi.

**DoD:**
- [ ] `curl -sI https://app.birjoy.online/assets/index-YOQFAYL.js` → **404**, `Content-Type` HTML EMAS
- [ ] Ketma-ket 2 deploydan keyin `ls /var/www/miniapp/assets/index-*.js | wc -l` → **≥2** (eskisi saqlangan)
- [ ] Eski `index.html` bilan ochilgan sessiya oq ekran BERMAYDI (eski chunk hali diskda)
- [ ] `/health` 200, jonli ilova ochiladi

**Xavf:** past — faqat statik xizmat qatlami. Orqaga qaytarish: Caddyfile'ni tiklab `systemctl reload caddy`.
**Vaqt:** ~20 daqiqa.

### T-A2 · Test bazasi — 87 testni tiriltirish
**Muammo:** `TEST_DATABASE_URL` yo'q (Neon'da edi, 2026-07-27 o'chirilgan). `_testDb` app
bazasida ishlashdan BOSH TORTADI (to'g'ri qilingan — jonli bot sweep'i test a'zolarini
poygalaydi). Ya'ni pul-mantiqni tekshiradigan 87 skript yugurmaydi.

**Bajariladi:** VPS'da `birjoy_test` bazasi + roli, `db push`, `TEST_DATABASE_URL` `.env`ga.
App bazasiga **HECH QACHON** yozilmaydi.

**DoD:**
- [ ] `psql -l` da `birjoy_test` bor, `birjoy` dan alohida
- [ ] `testBazar.ts` **3 marta ket-ket yashil** (flaky pul-testi = ishonchsiz gate, CLAUDE.md)
- [ ] Test yugurgandan keyin app bazasida TAG'li satr **0 ta**
- [ ] CI'ga qo'shilgan yoki qo'lda yurgizish qo'llanmasi PROGRESS'da

**Xavf:** o'rta — noto'g'ri URL app bazasiga yozishi mumkin. Shuning uchun avval `SELECT
current_database()` bilan isbot.
**Vaqt:** ~1 soat.

---

## 3. P1 — bayroq qarzini yopish

### T-B1 · QABUL qilingan bayroqlarni o'chirish
**Muammo:** 76 bayroq, 22 ta UI-ayrilishi. `shopv2` xatosi shundan tug'ilgan: bayroq eski
blokni yashirgan, yangisi qurilmagan, hech kim sezmagan (kategoriya karuseli, savat paneli,
sotuvchi CTA, ulashish — oylab yo'q).

**Bajariladi:** QABUL qilingan va ≥2 hafta ON turgan bayroqlar — `bazar`, `shopv2`, `bazarcart`,
`newhome`, `newprofile`, `shop`, `restoran`, `xizmatlar` — bittalab:
`!flag` shoxi o'chiriladi → bayroq tekshiruvi olib tashlanadi → `FEATURES` ro'yxatidan chiqariladi.

**DoD (har bayroq uchun alohida):**
- [ ] `grep -rn "<flag>" packages/*/src` → **0 ta natija** (butun repo, qism emas)
- [ ] Typecheck 0 xato, build yashil
- [ ] Jonli ekran o'zgarmagan — ega qabul qiladi
- [ ] Bitta bayroq = bitta commit (orqaga qaytarish oson bo'lsin)

**Xavf:** o'rta — noto'g'ri shox o'chirilsa UI yo'qoladi. Yumshatish: bittalab, har biridan
keyin jonli tekshiruv.
**Vaqt:** har bayroqqa ~20–30 daqiqa, jami ~3 soat.

---

## 4. P2 — o'lik yukni tashlash

### T-C1 · Bo'sh jadvallarni o'chirish
20 jadval, 0 satr: `Intercity*` (8 ta), `Shop`, `ShopOrder`, `Listing`, `ItemListing`,
`TradeOffer`, `TradeMessage`, `KozachaTxn`, `OfisLedger`, `PeakHour`, `CorpEmployee`,
`ServicePriceItem`, `GarajHallOfFame`.

**EGA QARORI KERAK:** Intercity (shaharlararo) rejada bormi? Bo'lsa — qoldiramiz, yo'q bo'lsa
kod+sxema+bayroq+UI birga o'chadi.

**DoD:**
- [ ] Har o'chirilgan model uchun `grep -rn "<Model>" packages/*/src` → 0
- [ ] `prisma migrate diff` O'QILGAN va PROGRESS'ga yozilgan (ustun yo'qotish onggli qadam)
- [ ] Backup olingan (`backup.ts`) — o'chirishdan OLDIN
- [ ] VPS'da `db push`, keyin `/health` + jonli smoke

**Xavf:** yuqori (sxema o'zgarishi). Shuning uchun backup + diff o'qish majburiy.
**Vaqt:** ~1.5 soat.

### T-C2 · O'lik CSS
126 klass hech qayerda ishlatilmaydi (`.crash-*`, `.duel-*`, `.box-*`, `.bk-confirm*` …).

**DoD:**
- [ ] O'chirishdan oldin har klass uchun butun-repo grep → 0 (qism grep TAQIQ, CLAUDE.md R3)
- [ ] Build yashil, kritik CSS hajmi kamaygan (raqam bilan)
- [ ] Jonli 4 ekran vizual tekshirilgan: Uy · Do'kon · Taksi · Profil

**Vaqt:** ~45 daqiqa.

---

## 5. P3 — sifat

### T-D1 · Kritik yo'lni yana qisqartirish
CSS bo'lindi (236→125 KB). Keyingi nishon: `index-*.js` **255 KB xom / 79 KB gzip**.
Tekshiriladi: og'ir bog'liqliklar, `wallet`/`components` ni lazy qilish imkoni.
**DoD:** kritik JS gzip **≤60 KB**, jonli o'lchov bilan; hech bir ekran buzilmagan.

### T-D2 · Gigant fayllarni bo'lish
`admin/App.tsx` 5 383 qator → mantiqiy bo'limlarga (mahsulot, buyurtma, do'kon, foydalanuvchi,
iqtisod). Keyin `server.ts` 2 951 → router modullariga.
**DoD:** hech bir fayl **>800 qator**; typecheck 0; admin paneli jonli ishlaydi (ega qabul qiladi).

### T-D3 · Retry siyosati
`api.ts` da 5 urinish × 1.5/3/4.5/6 s — Render "sovuq start" davridan qolgan. VPS uxlamaydi.
Uzilgan mobil tarmoqda bu 1 soniyalik xatoni **15 soniyalik muzlashga** aylantiradi.
**DoD:** 2 urinish, 400/1200 ms; jonli test — tarmoq uzilganda ekran ≤3 s ichida javob beradi.

---

## 5b. DARVOZALANGAN — o'chirilmadi, lekin hozir emas

Loyihaning o'z GATE falsafasi (Founder Bible §17): katta g'oya rad etilmaydi, unga **shart**
qo'yiladi. Kod qoladi, bayroq **OFF** bo'ladi — shunda bazadagi bayroq haqiqatni aytadi.

### `livinghome` — xaritali AI-uy (`home.tsx`, 177 qator) · bayroq OFF qilindi 2026-07-28

**Nima bo'lgan:** 2026-07-23 da `ce9ba6a` (UY_REDESIGN) yangi uy ekranini olib keldi va renderni
`newhome ? NewUyView : livinghome ? LivingHome : UyView` deb yozdi. `newhome` o'sha kuni yoqilgan
va shundan beri ON — ternary uni BIRINCHI tekshirgani uchun `LivingHome` chizilishi uchun `newhome`
o'chirilgan bo'lishi kerak edi. Hech qachon bo'lmagan. Ya'ni **5 kun davomida** bazada
`feature:livinghome = on` deb turgan, kod esa unga hech qachon yetib bormagan — bayroq yolg'on
gapirgan. `newhome` olib tashlanganda bu ko'rinib qoldi (LivingHome'ni chaqiradigan yagona joy
o'sha ternary edi).

**Qaror (ega, 2026-07-28):** kod qoladi, bayroq OFF. Qaytarish sharti: uy ekraniga xarita kerak
bo'lsa — lekin uni `LivingHome` sifatida emas, `NewUyView` ichiga qism sifatida olib kirish
(hozirgi uy ekrani QABUL qilingan, uni almashtirmaymiz).

**⚠️ YANGILANDI (ega, 2026-07-29 — TOZALASH_DOD.md Blok A1):** «umuman eski versiya qolmasin»
ko'rsatmasi bilan yuqoridagi «kod qoladi» qarori BEKOR qilindi. Butunlay olib tashlandi:
`home.tsx` fayli, `livinghome` bayroq nomi (`FEATURES`/`DEFAULT_OFF`), server quvuri
(`/api/me` + `/api/booking/info` javoblari), `shared` tiplari, admin toggle qatori va jonli
`AppState` qatori. **Qaytarish sharti O'ZGARMAYDI** — u xaritani `NewUyView` ICHIGA qism
sifatida olib kirishni nazarda tutadi, ya'ni `home.tsx`ga bog'liq emas. Kod git tarixida:
`git show c5ef1e47:packages/miniapp/src/home.tsx`.

### `intercity` — shaharlararo o'rin band qilish (8 jadval, 0 buyurtma) · bayroq allaqachon OFF

**Foydali, lekin hozir emas:** (1) tugallanmagan — `testCrashGuards` D4 topdi: mijoz bekor qilgach
o'sha reysga qayta yozila olmaydi (`already_booked`); (2) boshqa operatsiya — haydovchi ro'yxati,
marshrut, komissiya qarzi, qaytarish; (3) fokus — bozorda 6 do'kon bor, uchinchi jabha ochish
sekinlashtiradi.

**Qaytarish sharti:** bozor **50 do'kon / kuniga 30 buyurtma** ga yetganda. Ochishdan OLDIN D4
xatosi tuzatilishi shart.

## 6. Doimiy qoidalar (CLAUDE.md ga qo'shiladi)

1. **Bayroq vaqtinchalik.** QABUL'dan 2 hafta ichida bayroq ham, eski shox ham o'chadi.
   Bayroq qo'shilganda o'chirish sanasi ham yoziladi.
2. **Yashirish ≠ almashtirish.** Redizayn eski blokni yashirsa — DoD'da "o'rniga nima keldi"
   nomma-nom yoziladi. Almashtiruvchi yo'q bo'lsa, yashirish TAQIQ.
3. **Har da'vo — buyruq + xom natija.** Butun repo bo'ylab, qism grep bilan emas.
4. **Bo'sh jadval 30 kun tursa — o'chiriladi** (yoki rejaga yoziladi, nega turgani bilan).
5. **Bitta ish — bitta sessiya.** Ikki sessiya bir papkada `schema.prisma` ni ochsa,
   `db:push` bir-birini bosadi.
6. **Fayl >800 qator bo'lsa — keyingi tegishda bo'linadi.**
7. **Tezlik da'vosi o'lchovsiz aytilmaydi.** "Tezroq bo'ladi" degan gap TTFB raqamisiz qabul
   qilinmaydi (Cloudflare saboqi).

---

## 7. Tartib va vaqt

| Bosqich | Tiket | Vaqt | To'sqinlik |
|---|---|---|---|
| P0 | T-A1 deploy tuzog'i | 20 daq | — |
| P0 | T-A2 test bazasi | 1 soat | — |
| P1 | T-B1 bayroq tozalash | 3 soat | T-A2 (test to'ri kerak) |
| P2 | T-C1 bo'sh jadvallar | 1.5 soat | **ega qarori: Intercity** |
| P2 | T-C2 o'lik CSS | 45 daq | — |
| P3 | T-D1 kritik JS | 2 soat | — |
| P3 | T-D2 fayl bo'lish | 4 soat | T-A2 |
| P3 | T-D3 retry | 20 daq | — |

**Jami ~13 soat.** P0 bugun, qolgani ketma-ket.

---

## 8. Ega tasdiqlashi kerak

1. **Intercity** — rejada bormi yoki o'chiramizmi?
2. Qaysi bayroqlar QABUL qilingan deb hisoblanadi (yuqoridagi 8 talik ro'yxat to'g'rimi)?
3. P0 dan boshlaymizmi, yoki boshqa tartib?
8. **Bayroqni olib tashlashdan OLDIN server darvozalarini sana.**
   `grep -rn 'featureOn("<flag>")' packages/server/src | grep -v /scripts/`
   - **1 ta** (faqat `/api/me` payload) → UI-ayrilishi, bu qarz, **o'chiriladi**.
   - **2+ ta** (xizmat qatlamida) → bu **kill-switch**, avariyada deploysiz o'chirish yo'li,
     **QOLDIRILADI**. CLAUDE.md: "Har mexanika kill-switch flag bilan."
   2026-07-28 da shu qoidasizlik tufayli `shop`/`restoran`/`xizmatlar`/`bazarcart` ning mijoz
   darvozalari olib tashlangan edi — yarim ishlaydigan kill-switch umuman yo'qidan yomonroq,
   chunki ishlayotgandek ko'rinadi. Qaytarildi.
9. **Yoqilgan bayroq ishlayapti degani emas.** Yangi ekran eskisining OLDIGA qo'yilsa, eskisining
   bayrog'i ON qolib, kod unga hech qachon yetmasligi mumkin (`livinghome` 5 kun shunday turdi).
   Yangi shox qo'shganda eskisining bayrog'i O'SHA commit'da OFF qilinadi yoki o'chiriladi.
