# 1067 / BirJoy — RIVOJLANISH PLANI

> Tuzilgan: 2026-07-27 · Asos: shu sessiyadagi to'liq kod-audit (miniapp 12.9k satr, server 29k,
> admin 6k) + jonli o'lchovlar (kodga yozib qo'yilgan DB raqamlari).
> Bu fayl **taklif**, buyruq emas. Har bosqich egadan tasdiq talab qiladi (CLAUDE.md DoD).

---

## 0. Asosiy xulosa — bir jumlada

**Muammo qurishda emas, YETKAZISHDA.** Kodbazada 59 ta feature-flag bor. Ulardan **39 tasi ega
qabul qilgan** (`EXPECTED_ON` — "the owner-accepted record"), **18 tasi esa hech qachon qabul
qilinmagan** va prod'da o'chiq turibdi. Ya'ni yozilgan xususiyatlarning ~30% i mijozga yetib
bormagan, lekin ularning hammasi saqlanadi, typecheck qilinadi va har refaktorda o'ylab ko'riladi.

> ⚠️ **Diqqat:** `DEFAULT_OFF` (49 ta) "hozir qorong'i" DEGANI EMAS — u "DB'da aniq `on` satri
> bo'lmasa o'chiq" degani. Haqiqiy jonli holat FAQAT DB'dan bilinadi. Kodning o'z izohi
> ogohlantiradi: *"a reseeded/reset DB silently reverts each owner-accepted feature to OFF with no
> error"* — shuning uchun birinchi ish jonli holatni o'lchash (§P1.2).

Shuning uchun bu plan **yangi xususiyatlar ro'yxati emas**. U uchta narsani ko'zlaydi:
1. Bor narsani chiqarish yoki o'chirish (qarzni yopish).
2. Eng katta biznes teshigini yamash (voronkaning boshi).
3. Sifatni avtomatlashtirish — DoD qo'lda emas, mashina tekshiradigan bo'lsin.

---

## 1. Qayerdamiz — raqamlar bilan

| O'lchov | Qiymat | Nima demoqchi |
|---|---|---|
| Feature-flaglar | **59**: 39 qabul qilingan · **18 hech qachon qabul qilinmagan** | ~30% ish mijozga yetmagan |
| Prisma modellari | **109** | Ko'pi o'chirilgan o'yinlardan qolgan |
| Ad-hoc skriptlar | **160** (`src/scripts/`) | Test to'plami emas — bir martalik vositalar |
| Mini App test qamrovi | **0** | Faqat `tsc` |
| ESLint | **yo'q** | Hook-tartibi kabi xatolar qo'lda topiladi |
| `/start` bosganlar | **1060** | |
| Raqam ulamaganlar | **289 (27%)** | Shundan **286 tasi tugmani umuman bosmagan** |
| CI darvozasi | typecheck + shared vitest + iqtisod-simulyatsiya | Yaxshi poydevor, lekin UI/API qamrovi yo'q |

**Eng og'riqli raqam** — `/start` bosgan har 4 odamdan 1 tasi raqamini ulamagan, va ularning
deyarli hammasi tugmani **bosmagan ham**. Bu marketing muammosi emas, mahsulot muammosi.

---

## 2. Uchta yo'riq (har qarorda shu bilan o'lchang)

**Y1 — Yopilmagan ish yangi ishdan qimmat.** Qabul qilinmagan flag bepul emas: u kodda yashaydi,
har refaktorda o'ylanadi, har testda yuritiladi. Yangi tiket boshlashdan oldin bitta qorong'i
flagni yoq yoki o'chir.

**Y2 — Voronkaning yuqorisi pastidan muhimroq.** Do'kon, restoran, e'lonlar — hammasi
ro'yxatdan o'tgan mijoz uchun. 27% odam esa **eshikdan kirmagan**. Yuqorini yamamasdan pastga
xususiyat qo'shish — teshik chelakka suv quyish.

**Y3 — Isbot mashinadan kelsin.** Sizning DoD'ingiz 8 qoidadan iborat, chunki "tayyor" so'zi
ishonchsiz bo'lib qolgan. Yechim — intizomni oshirish emas, **tekshiruvni avtomatlashtirish**.

---

## 3. P0 — Shu hafta (poydevor, yangi xususiyat YO'Q)

### P0.1 Hujjat driftini yopish 🔴
`CLAUDE.md` va `ARCHITECTURE.md` Render+Vercel deydi; haqiqiy deploy **2026-07-25 dan Contabo VPS**
(`deploy/deploy.sh`, GH Actions SSH). Ikki hujjat bir-biriga ham zid (`prisma db push` bor/yo'q).
Har agent aynan shu fayllarni birinchi o'qiydi — noto'g'ri deploy yo'riqnomasi eng qimmat xato turi.
**Ish:** ikkala faylni VPS haqiqatiga keltirish + `deploy/MIGRATSIYA_RUNBOOK.md` ga havola.
**O'lchov:** yangi sessiya agentiga "qanday deploy qilinadi?" deb so'ralganda to'g'ri javob.

### P0.2 Async xato-teshigi 🔴
Express 4, `express-async-errors` yo'q, 255 async marshrutda 2 ta `try`. Handler yiqilsa mijoz
**javob olmaydi** (so'rov osiladi), Mini App 5 marta qayta uradi, egaga Telegram-ogohlantirish ketadi.
**Ish:** `express-async-errors` (1 qator import) yoki `wrap()` o'rovchi.
**O'lchov:** ataylab yiqiladigan test-marshrut 500 qaytarsin, osilmasin.

### P0.3 Egalik tokeni URL'dan chiqsin 🔴
`server.ts:2185` — token query'da (log/tarix/Referer'ga oqadi) va `===` bilan solishtiriladi,
holbuki 23 satr yuqorida `tokenEquals` (timingSafeEqual) turibdi va izohida aynan shu hujum
tasvirlangan. `admin/api.ts:37-41` — `?key=` URL'dan o'qiladi va **URL tozalanmaydi**.
**Ish:** stiker marshrutini sarlavhaga o'tkazish, `tokenEquals` ishlatish, `?key=` ni
`history.replaceState` bilan tozalash.

### P0.4 Restoran dublikat-buyurtmasi 🟠
`api.restoranOrder` 5 marta qayta uriladi, serverda 60s dup-qorovuli yo'q (do'kon va bozorda **bor**).
**Ish:** `retries = 1` + `shopService.ts:523` naqshini restoranga ko'chirish.

**P0 yakuni:** ~1 kunlik ish, 4 ta ildiz-xatar yopiladi. Yangi xususiyat qo'shilmaydi.

---

## 4. P1 — 2–4 hafta: voronkani yamash va qarzni yopish

### P1.1 Eshikni ochish (eng katta biznes yutug'i)
Tayyor tiketlar: **§53 `linkinapp`** (raqamni ilova ichida ulash) — 286 ta bosilmagan tugma
muammosini to'g'ridan-to'g'ri yechadi.
**Tartib:** deploy → egada preview → global yoqish → **7 kun o'lchash**.
**O'lchov (majburiy):** ulanish konversiyasi `/start` → `linked`. Hozir **73%**. Maqsad **85%**.
Agar 7 kunda o'zgarmasa — sabab tugmada emas, keyingi qadamga o'tmaymiz, qidiramiz.

### P1.2 Flag inventarizatsiyasi 🔴 (eng ko'p qiymat beradigan tozalash)
**Avval o'lchang:** jonli DB'dan `feature:*` satrlarini olib, `EXPECTED_ON` bilan solishtiring
(`scripts/auditFlags.ts` shuning uchun bor). Bu 39 ta "qabul qilingan" flag ROSTDAN yoniqmi degan
savolga javob beradi — DB reset bo'lgan bo'lsa ular jimgina o'chgan bo'lishi mumkin.
**Keyin:** 18 ta qabul qilinmagan flagning **har biri** uchun bitta qaror: **yoq / o'chir /
muzlat (sana bilan)**. Sanasiz "keyinroq" = o'chirish.
**Ish:** `FLAG_AUDIT.md` — jadval: flag / nima qiladi / jonli holati / oxirgi tegilgan sana / qaror.
**O'lchov:** qabul qilinmagan flaglar **18 → ≤5**. O'chirilgan har flag bilan birga uning kodi,
modellari va testlari ham ketadi.
**Kutilayotgan yon-foyda:** 109 Prisma modelining kamayishi, bundle kichrayishi, sweep tezlashishi.

### P1.3 Sifat darvozasi
- **ESLint + `react-hooks`** qoidalari (hozir yo'q). Shu sessiyada `useBackButton` ni erta
  `return` dan keyin qo'yish xatosi qo'lda topildi — linter uni bepul topadi.
- **Vitest** miniapp uchun: avval faqat sof funksiyalar (`util.ts`, formatlash, savat hisobi).
- CI shield'ga ikkalasini qo'shish.
**O'lchov:** CI qizil bo'lmasdan hook-tartibi xatosi main'ga o'tolmasin.

### P1.4 Mini App audit tuzatishlari
Shu sessiyada topilgan: savat/manzil kalitlari foydalanuvchiga bog'lanmagan (umumiy telefonda
begona savat), cashout chegaralari mijozda nusxa, toast taymerlari bir-birini o'chiradi,
~46 joyda xato yutiladi (abadiy skeleton).

---

## 5. P2 — 1–3 oy: chuqurlik, kenglik emas

### P2.1 Bitta vertikalni oxirigacha
Do'kon, Restoran, Xizmatlar, E'lonlar, Bozor — beshtasi ham qorong'ida yarim tayyor.
**Maslahat: bittasini tanlang va uni 100% qiling.** Tanlash mezoni — Koson'da qaysi biriga
haqiqiy talab bor. Qolgan to'rttasi P1.2 da muzlaydi yoki o'chadi.
Sabab: yarim tayyor 5 ta vertikal = 5 barobar saqlash xarajati, 0 barobar daromad.

### P2.2 O'lchov qatlami
Hozir muhim raqamlar (konversiya, qaytish, safar/mijoz) faqat qo'lda SQL bilan olinadi.
**Ish:** admin panelda bitta "Sog'liq" ekrani — kunlik: yangi ulanganlar, faol mijoz,
safar soni, tanga emissiyasi, naqd chiqim, voronka bosqichlari.
**Nega:** P1.1 dagi kabi "yoqdik va o'lchadik" tsikli busiz ishlamaydi.

### P2.3 Telegram imkoniyatlarining qolgani
Shu sessiyada 6 tasi yozildi (fullscreen, requestContact, BackButton, addToHomeScreen,
shareToStory, isActive+CloudStorage). Qolganlari **faqat P1 o'lchovlari talab qilsa**:
`BiometricManager` (cashout himoyasi), `MainButton` (native CTA), `lockOrientation`,
`shareMessage`. Ro'yxat uchun emas, ehtiyoj uchun.

### P2.4 Texnik qarz
- 109 model → ishlatilmaganlari migratsiya bilan olib tashlash (P1.2 dan keyin)
- 160 ad-hoc skript → 10-15 tasi kerak, qolgani arxivga
- `packages/shared` ga ko'chirish: `inviteText`/`inviteLandingUrl` (4 ta "KEEP IN SYNC" izohi),
  cashout chegaralari

---

## 6. Nima QILMASLIK kerak (bu ham plan)

- ❌ **Yangi vertikal qo'shmaslik** (taksi/do'kon/restoran/xizmat/e'lon/bozordan tashqari) —
  qabul qilinmagan flaglar 5 dan tushmaguncha.
- ❌ **Yangi poller yozmaslik** — `bookingNotifier` sweep'i kengaytiriladi (CLAUDE.md qoidasi).
- ❌ **Pul mexanikasini murakkablashtirmaslik** — hozirgi intizom (idempotent ledger, ≤350 clamp,
  member-lock) kodbazaning eng kuchli joyi. Har yangi faucet uni zaiflashtiradi.
- ❌ **"Keyinroq qaraymiz" flagi qoldirmaslik** — sanasiz muzlatish = o'chirish.

---

## 7. Birinchi 30 kun — taklif qilinayotgan ketma-ketlik

| Hafta | Ish | Tayyorlik mezoni |
|---|---|---|
| 1 | P0.1–P0.4 (hujjat, async, token, restoran) | CI yashil, 4 xatar yopilgan |
| 1 | §52–§57 deploy + telefonda QABUL | Ega skrinshot bilan tasdiqlaydi |
| 2 | `linkinapp` global yoqish + o'lchash boshlanishi | Kunlik konversiya yozib borilyapti |
| 2–3 | P1.2: jonli flag holatini o'lchash + 18 flagga qaror | `FLAG_AUDIT.md` to'ldirilgan |
| 3 | ESLint + vitest + CI darvozasi | Hook xatosi CI'da tutiladi |
| 4 | Konversiya natijasi + bitta vertikal tanlash | 73% → ? raqami ma'lum |

---

## 8. Ochiq savollar (egaga)

1. **Qaysi vertikal haqiqiy daromad keltiryapti?** Menda bu ma'lumot yo'q — plan shusiz to'liq emas.
2. **Naqd chiqim (cashout) hajmi qancha?** Bu iqtisodning eng katta xavfi.
3. **Haydovchilar tomoni** shu planda deyarli yo'q — ular ham mijozmi yoki alohida mahsulotmi?
4. Qorong'i flaglarni o'chirishga tayyormisiz? Bu eng ko'p qarshilik keltiradigan qadam,
   lekin eng ko'p foyda beradigani ham shu.
