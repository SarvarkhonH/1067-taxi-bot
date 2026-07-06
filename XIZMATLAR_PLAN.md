# XIZMATLAR — Koson servicelari katalogi (Super Bot v1)

*Maqsad: Kosonda kimga nima kerak bo'lsa — 1067'da topadi. Katalog → qo'ng'iroq → odat → Kosonni egallash.*

---

## 1. Nega yutamiz (strategiya, 4 gap)

1. **Baza bizda.** Taxi boti allaqachon minglab Koson foydalanuvchisiga ega — yangi app yuklatish shart emas, "Xizmatlar" tugmasi shu botning ichida ochiladi.
2. **Raqobat bo'sh.** Google/2GIS Koson uchun deyarli bo'sh; hech kimda to'liq mahalliy katalog yo'q. Birinchi to'liq katalog = default odat.
3. **Ikki tomonlama loop.** Odamlar qidiradi → servicelar mijoz topadi → servicelar o'zi qo'shiladi → katalog boyiydi → yana ko'proq odam qidiradi.
4. **Monetizatsiya keyin, ishonch avval.** V1 hammaga BEPUL. VIP-joylashuv va tanga-kuponlar (SUPERAPP_PLAN Bozor arxitekturasi) katalog jonlanganidan KEYIN.

## 2. Qayerda quramiz — qaror

**1067 monorepo ichida** (yangi package YO'Q):

| Qism | Qayerda | Nima |
|---|---|---|
| Data + API | `packages/server` (Prisma/Postgres) | 2 yangi model + `/api/services/*` routelar |
| Ko'rish + qidiruv | `packages/miniapp` yangi tab | kategoriya grid → ro'yxat → karta → qo'ng'iroq |
| Kirish eshigi | bot menyu | "🔎 Xizmatlar" tugma + botda matn-qidiruv |
| Moderatsiya | ega Telegramda [✅/❌] (cashout patterni) + admin panel | pending → active |
| Eski `business-directory` (Mongo) | FAQAT data manbai | import skripti bilan ko'chiramiz, keyin arxiv |

Nega monorepo: tayyor deploy (Render/Vercel), tayyor auth (Telegram WebApp), tayyor flag tizimi, tayyor admin. Mongo'dagi alohida sayt hech qachon Koson auditoriyasiga yetmasdi — bot yetadi.

**Pul yo'q v1** — tanga/CoinTxn/withdraw'ga TEGINMAYDI. Ekonomik risk = 0. kas1067 API'ga ham teginmaydi — kas load risk = 0.

## 3. V1 scope — 2 bosqich

### B1 — Katalog (o'qish + qidiruv)
- Kategoriyalar (emoji + nom): Qurilish, Usta-servis, Go'zallik, Oziq-ovqat, Ta'lim, Tibbiyot, Transport, To'y-marosim, Boshqa…
- Xizmat kartasi: nom, telefon (1-2 ta), qisqa tavsif, teglar, manzil (ixtiyoriy), foto (ixtiyoriy).
- Qidiruv: nom + teg + telefon bo'yicha (eski Mongo'dagi regex mantiqning Postgres `ILIKE` versiyasi). VIP birinchi, keyin alifbo.
- **Bir bosishda qo'ng'iroq**: `tel:` link + "raqamni nusxalash". Har qo'ng'iroq `callCount++` — keyinchalik servicelarga "sizga N marta qo'ng'iroq qilishdi" deb isbot ko'rsatamiz (sotuv quroli).
- Botda ham: "🔎 Xizmatlar" bosilsa Mini App ochiladi; bot ichida matn yozilsa top-5 natija inline (telefon bosiladigan).

### B2 — O'z-o'zini qo'shish (self-serve + moderatsiya)
- Mini App'da "➕ Xizmatimni qo'shish" forma: kategoriya, nom, telefon (+998 validatsiya), tavsif, teglar, foto.
- Yuborilgach `status=pending` → egaga Telegram xabar [✅ Tasdiqlash / ❌ Rad] (cashout approval patterni aynan).
- ✅ → `active`, egasiga "Xizmatingiz e'lon qilindi" push. Egasi keyin o'z kartasini tahrirlay oladi (faqat o'ziniki, qayta-moderatsiya bilan).
- Spam himoya: 1 Telegram user = kunlik 2 submission, rate limit, moderatsiyasiz hech narsa ko'rinmaydi.

### B3 — Baho va sharh (reputatsiya yadrosi, V1'da SHART)
- 5 yulduz + matn (ixtiyoriy). Faqat Telegram-auth foydalanuvchi, 1 biznes = 1 baho (tahrirlash mumkin, o'chirib qayta yozish emas).
- Reyting agregati kartada keshlanadi (`avgRating`, `reviewCount`) — ro'yxat renderida JOIN yo'q, million yozuvda ham tez.
- Sharhda "shikoyat qilish" tugmasi → 3 shikoyat = avtomatik yashirish + egaga xabar (moderatsiya navbati).
- Saralash default: reyting × sharh soni (Wilson/bayes minimal: `(avg*n + 4.0*5)/(n+5)` — 2 ta 5-yulduzli yangi biznes 200 sharhli 4.8'dan tepaga chiqib ketmaydi).

### V1 EMAS (keyinga)
- To'lovlar/VIP sotish, tanga-kupon, chat/buyurtma tizimi, geo-xarita. Hammasi V2+ — avval katalog jonlansin.

## 4. Data model (Prisma, 2 model)

```prisma
model ServiceCategory {
  id       Int     @id @default(autoincrement())
  name     String
  emoji    String  @default("")
  sortOrder Int    @default(0)
  active   Boolean @default(true)
  listings ServiceListing[]
}

model ServiceListing {
  id          Int      @id @default(autoincrement())
  categoryId  Int
  category    ServiceCategory @relation(fields: [categoryId], references: [id])
  name        String
  phone       String
  phone2      String?
  desc        String   @default("")
  tags        String   @default("")     // "sement, g'isht, qurilish"
  address     String?
  photos      Json?                      // r2/telegram file idlar, shop galereya patterni
  status      String   @default("pending") // pending|active|rejected|archived
  isVip       Boolean  @default(false)
  verified    Boolean  @default(false)    // ko'k belgi — telefon tasdiqlangan/ega tanigan biznes
  workHours   String?                     // "08:00-19:00" — "Ochiq/Yopiq" hisoblanadi
  ownerTgId   BigInt?                    // kim qo'shgan (self-serve)
  viewCount   Int      @default(0)
  callCount   Int      @default(0)
  avgRating   Float    @default(0)        // kesh — har sharhda qayta hisoblanadi
  reviewCount Int      @default(0)        // kesh
  rankScore   Float    @default(0)        // bayes-saralash keshi, indexli
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  @@index([categoryId, status, rankScore])
  @@index([status, isVip])
}

model ServiceReview {
  id         Int      @id @default(autoincrement())
  listingId  Int
  listing    ServiceListing @relation(fields: [listingId], references: [id])
  tgId       BigInt                      // Telegram user — auth Mini App'dan
  authorName String                      // ko'rsatiladigan ism (displayName)
  stars      Int                         // 1..5
  text       String   @default("")
  status     String   @default("visible") // visible|hidden|reported
  reports    Int      @default(0)
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
  @@unique([listingId, tgId])            // 1 odam = 1 baho (tahrir upsert)
  @@index([listingId, status, createdAt])
}
```

Hech qanday mavjud modelga teginmaydi. `prisma db push` avval lokalda.

## 5. API (6 route, hammasi flag-gated)

```
GET  /api/services/categories                    → aktiv kategoriyalar + har birida son
GET  /api/services/list?cat=&q=&limit=&offset=   → active listinglar, VIP-first
GET  /api/services/item/:id                      → bitta karta (+viewCount++)
POST /api/services/call {id}                     → callCount++ (rateLimit)
POST /api/services/submit {…}                    → pending yaratadi + egaga xabar (rateLimit 2/kun)
GET  /api/services/mine                          → o'zim qo'shganlar (tahrir uchun)
GET  /api/services/reviews?listingId=            → visible sharhlar, sahifalab
POST /api/services/review {listingId,stars,text} → upsert (1 user = 1 baho) + agregat qayta hisob
POST /api/services/report {reviewId}             → shikoyat; 3 ta → hidden + moderatsiya
Admin: GET /api/admin/services?status= , PATCH /api/admin/services/:id (approve/reject/vip/verify/edit),
       GET/PATCH /api/admin/service-reviews (hidden/reported navbati)
```

## 5.5 DIZAYN SPETSIFIKATSIYASI — "Koson 2GIS'i" darajasi

> Mezon: foydalanuvchi ochganda "bu jiddiy platforma" deb his qilishi kerak — Uzum/2GIS/Yandex profil
> sifati. Oddiy ro'yxat + raqam = telefon kitobi = reputatsiya o'limi. Hamma rang/o'lcham
> `design/tokens.css` dan (CLAUDE.md dizayn qoidasi), shop galereya patterni qayta ishlatiladi.

### Ekran 1 — Asosiy (discovery)
- Tepa: katta qidiruv paneli ("Usta, sartarosh, sement…" placeholder aylanib turadi).
- Kategoriya grid: 2 ustun, har tile = rangli fon + ikon + nom + "56 ta" son (bo'sh emasligini darhol ko'rsatadi).
- "Haftaning eng yaxshilari" gorizontal karusel — foto + reyting + verified belgi (VIP'ning kelajakdagi sotuv joyi).
- "Yangi qo'shilganlar" qatori — katalog tirikligini ko'rsatadi.
- Har async blok skeleton bilan (<100ms vizual javob qoidasi).

### Ekran 2 — Kategoriya ro'yxati
- Karta: foto thumb (44-56px) + nom + verified + ★reyting (sharh soni) + teglar + "Ochiq · 08:00–19:00" (workHours'dan jonli hisob) + o'ng tomonda dumaloq yashil qo'ng'iroq tugmasi.
- Saralash: VIP → rankScore (bayes) → alifbo. Filter chiplari: "Ochiq hozir", "Verified", "Yangi".
- Fotosiz listing ham chiroyli: kategoriya ikonli rangli placeholder (hech qachon bo'sh kulrang kvadrat emas).

### Ekran 3 — Biznes profili (toj)
- Cover foto galereya (1/6 svaypanadi, shop 4-5 foto patterni).
- Nom + verified ko'k belgi; ostida ★4.8 · 127 baho · 2 340 qo'ng'iroq (ijtimoiy isbot raqamlari).
- 3 amal tugmasi: [Qo'ng'iroq] (primary, to'liq rang) · [Manzil] · [Ulashish] (Telegram share — viral kanal).
- Info bloki: ish vaqti (Ochiq/Yopiq jonli), manzil, teglar, 2-telefon.
- Sharhlar: yulduz taqsimoti + oxirgi 3 sharh + "Barchasi (127)" → to'liq sahifa; "Baho berish" har doim ko'rinadigan joyda.
- Pastda: "O'xshash xizmatlar" 3 karta (sessiya cho'zish).

### Ishonch tizimi (reputatsiya himoyasi)
| Element | Qoida |
|---|---|
| Verified ko'k belgi | faqat admin beradi (telefon tasdiqlangan / ega tanigan biznes) |
| Baho | faqat Telegram-auth, 1 user = 1 biznes, tahrir mumkin |
| Sharh matni | shikoyat tugmasi, 3 shikoyat = auto-yashirish + moderatsiya |
| Soxta reyting himoya | bayes rankScore (yangi 2×5★ eski 200×4.8ni yenga olmaydi) |
| Qo'ng'iroq soni | faqat serverda increment — biznesga "sizni N marta izlashdi" isboti |

### 3 soniya testi (har ekran)
1. Bu nima? — "Koson xizmatlari katalogi" (header + qidiruv darhol aytadi)
2. Menga nima? — "kerakli ustani 10 soniyada topaman, reytingi bilan"
3. Nima bosaman? — har kartada bitta dominant yashil qo'ng'iroq tugmasi

## 6. O'zgaradigan fayllar

| Fayl | O'zgarish |
|---|---|
| `packages/server/prisma/schema.prisma` | +2 model |
| `packages/server/src/services/serviceDirectory.ts` | YANGI — butun domen logikasi |
| `packages/server/src/api/server.ts` | +8 route (lazy import) |
| `packages/server/src/bot/bot.ts` | menyu tugma (flag), matn-qidiruv handler, [✅/❌] callback |
| `packages/server/src/services/featureFlags.ts` | +`xizmatlar` (DEFAULT_OFF) |
| `packages/server/src/scripts/importServices.ts` | YANGI — Mongo/Excel'dan seed |
| `packages/server/src/scripts/testServices.ts` | YANGI — DoD isbot skripti (TEST DB) |
| `packages/miniapp/src/services.tsx` | YANGI tab — katalog UI |
| `packages/miniapp/src/App.tsx`, `api.ts` | tab routing (flag), +8 metod |
| `packages/miniapp/src/design/tokens.css` | services klasslar (tokenlardan) |
| `packages/admin/src/App.tsx`, `api.ts` | moderatsiya jadvali |
| `packages/shared/src/types.ts` | Service tiplar |

## 7. Seed — eng kritik qadam (bo'sh katalog = o'lik katalog)

Launch kuni katalogda kamida **80–100 real xizmat** bo'lishi SHART:
1. `importServices.ts` — eski Mongo `businessDir` bazasidan (yoki Excel eksportidan) ko'chiradi, `status=active` bilan.
2. Yetmasa: ega + biz birga Koson bo'yicha ro'yxat tuzamiz (bozor, ustalar, dokonlar — telefon kitobidan).
3. Har seed yozuv ham keyin egasi tomonidan "bu meniki" deb olinishi mumkin (V2: claim flow).

## 8. Go-live tartibi

1. Build + typecheck + `testServices.ts` TEST DB'da yashil.
2. Deploy DARK (`xizmatlar` off) + owner-preview bilan egaga real telefonda ko'rsatish.
3. Seed import → ega katalogni ko'zdan kechiradi.
4. QABUL → flag on → botda e'lon posti ("Endi 1067'da Koson xizmatlari!").
5. 1-hafta: har kuni submission oqimini kuzatish, spam bo'lsa rate-limit qattiqlashtirish.

## 9. DoD (kod yozishdan OLDIN — ega tasdiqlaydi)

| # | Qabul mezoni | Tekshiruv buyrug'i |
|---|---|---|
| 1 | Flag off = hech qayerda ko'rinmaydi (bot menyu, Mini App tab, API 403) | curl + real render skrinshot |
| 2 | Kategoriya + qidiruv ishlaydi (nom/teg/telefon), VIP birinchi | `testServices.ts` TEST DB, 3× yashil |
| 3 | Submit → pending → ega ✅ → active bo'lib ko'rinadi, ❌ → ko'rinmaydi | end-to-end skript + egada real xabar |
| 4 | Spam himoya: 3-chi kunlik submission rad | skript isbot |
| 5 | call/view hisoblagichlar increment | curl 2× → count +2 |
| 5a | Baho: 1 user = 1 biznes (2-chisi upsert), agregat to'g'ri qayta hisob | testServices.ts: 3 user × baho → avgRating/reviewCount aniq |
| 5b | 3 shikoyat → sharh hidden + adminda ko'rinadi | skript isbot |
| 6 | Import skripti eski bazadan N yozuv ko'chirdi | skript output + son |
| 7 | typecheck + deploy DARK + bundle grep | buyruq natijalari |
| 8 | Ega real telefonda QABUL | ega so'zi |

## 10. Xavflar

| Xavf | Yechim |
|---|---|
| Bo'sh katalog — odamlar bir kirib, topolmay ketadi | Seed 80–100 yozuv LAUNCHDAN OLDIN (§7), aks holda flag yoqilmaydi |
| Spam/soxta raqamlar | 100% moderatsiya + kunlik limit + +998 format validatsiya |
| Telefon raqamlar eskiradi | callCount past bo'lganlarni davriy tekshirish (V2: "raqam ishlamayapti" tugmasi) |
| Katalog taxi UX'ini og'irlashtirishi | Alohida tab, lazy-load, taxi oqimiga 0 teginish |
| Ega moderatsiyaga ulgurmasligi | Kunlik digest + keyin ishonchli moderator qo'shish mumkin |

## 11.5 POLISH v1.1 NAVBATI (3× Sonnet konsult, 2026-07-05) — ega tasdig'i kutilmoqda

### P1 — Chaqmoq-tezlik (hammasi Small, eng katta his-farq)
| # | Ish | Nega |
|---|---|---|
| 1 | Foto thumb-tier: `ServicePhoto.thumbFileId` + proxy `?s=1` (shop'dagi tayyor pattern) | Karta thumb hozir TO'LIQ Telegram CDN faylini tortadi (100-300KB → 15-25KB, ~85-90% kam) |
| 2 | SWR modul-kesh (kategoriya+top) — shop patterni | Qayta ochishda skeleton YO'Q, bir zumda render |
| 3 | Idle prefetch App.tsx'da (chunk+data, shop kabi) | Birinchi bosishda ham tayyor turadi |
| 4 | Server: `photoCounts`ni Promise.all ichiga (hozir KETMA-KET — har listda +1 RTT); ishlatilmaydigan `count()`ni olib tashlash; kategoriya-sonlarni keshlash; `/list`+`/item`ga Cache-Control 30-60s | Har ochilishda Neon EU'ga 1-2 ortiqcha so'rov yo'qoladi |
| 5 | `<img decoding="async">` kartalar+galereyada | Arzon Androidda scroll silliq |
| Defer | `/api/services/home` birlashgan endpoint; pg_trgm GIN index | 500+ listing bo'lganda |

### P2 — UX/dizayn (bo'sh-data reallikka moslash)
1. **📞 tugma 44px + dominant glow** (hozir 36px ikon-nuqta — asosiy amal ko'zga tashlanmaydi, plan §5.5 buziladi).
2. Baho yo'q kartada kulrang «Hali baho yo'q» o'rniga **«🆕 Yangi» chip** (brand rang); accent endi per-ID (bir kategoriyada 8 karta bir xil rang emas).
3. **«Yangi qo'shilganlar» qatori** (§5.5da bor edi, kodda YO'Q) + «Eng yaxshilari» faqat haqiqiy baholar paydo bo'lgach shu nomda.
4. Detail sheet: Qo'ng'iroq to'liq-keng birinchi qator, Nusxa+Baho kichik ostida; tugma matni **«★ Baho qo'ying»** (hozirgi «★ Baho» ikkimasnoli).
5. Submit forma: telefon-format hint DOIM ko'rinadi (disabled-tugma sababsiz — drop-off nuqtasi).
6. 1-2 talik kategoriya tile'lari xira (ko'z boy kategoriyalarga yo'naladi).
7. Mikro-animatsiyalar (transform/opacity, mavjud keyframe'lar): karta stagger-in · birinchi-baho «d-stamp muhr» · sharh skeleton 2×44px (sakrash yo'q).

### P3 — Yetishmayotgan qismlar (LAUNCH-CRITICAL, Sonnet + men qo'shilamiz)
1. **«Topilmadi» → So'rov qoldirish** (demand capture): topilmagan qidiruv + ixtiyoriy izoh saqlanadi → admin «so'rovlar» ro'yxati → qaysi xizmat yetishmayotganini REAL talab ko'rsatadi, katalog talabdan o'sadi. Spam-cap submit kabi.
2. **«⚑ Raqam ishlamadi»** profil tugmasi: 2-3 unikal shikoyat → admin tekshiruv navbati (report patterni tayyor). Eskirgan raqam = katalog o'limi (§10 xavfi).
3. **Ulashish deep-link**: `t.me/<bot>?startapp=svc_<id>` → to'g'ri o'sha profil ochiladi; profil'da [Ulashish] Telegram share bilan wired. Mahalla-guruhlarga «mana ustaning raqami» forward = bepul viral.

### P4 — Post-launch (go-live'dan keyin, tartibda)
Claim flow «bu meniki» (OTP listed-raqamga) · haftalik kanal digest («hafta TOP xizmatlari») · mashhur-qidiruv chiplari · sevimlilar · taxi cross-promo (safar tugagach yaqin xizmatlar kartasi) · tanga-SINK (sharh-boost/badge — hech qanday yangi emissiya YO'Q, shop spend-patterni).

## 11.6 v1.3 — Ijtimoiy tarmoq + «1067 tekshiruvi» (2026-07-06, BAJARILDI)

Ega: «2GIS'da yana ko'p narsa bor (ijtimoiy tarmoq va h.k.), restoran/dorixona/do'kon ham qo'shishim
kerak, va 1067 jamoasi jismoniy borib tekshirib alohida baho beradi — bu tasdiqlash EMAS, alohida
tekshiruv». Ikki alohida qaror:

**1. Ijtimoiy tarmoq** — `ServiceListing.instagram/telegramUrl/facebook/website` (faqat displey,
profil sahifasida ikon-tugmalar qatori, bo'lsagina ko'rinadi). Kartada YO'Q (joy tejash) — faqat
profilda.

**2. «1067 tekshiruvi» — mustaqil audit signal, MIJOZ BAHOSI EMAS.** `inspStars` (1-5) + `inspNote`
+ `inspAt`. Muhim arxitektura qarori (ataylab qilingan, kelajakda o'zgartirilishi mumkin):
- **`avgRating`/`reviewCount`ga HECH TEGMAYDI** — ikkala signal butunlay mustaqil ustunlarda.
- **`rankScore` (bayes-saralash)ga QO'SHILMAYDI** — agar qo'shilsa, bir nechta 1067-audit ovozi
  200-sharhli haqiqiy mashhur bizneslarni jimgina bosib ketishi mumkin edi; bu qaror ochiq aytilishi
  kerak, sukut bo'yicha qilinmasligi kerak edi. Hozircha FAQAT displey — saralashga ta'sir yo'q.
- Vizual ajratish: kartada teal «🏅 1067: N★» chip (mijoz-reytingi ★ orange bilan ARALASHMASLIGI
  uchun rang ataylab farqli), profilda alohida ajratilgan blok + auditor xulosasi.
- Admin: 🏅 tugma — "stars; note" formatida, 1-5 validatsiya, bo'sh=butunlay bekor qilish (sana ham).

**Kategoriya kengaytirish** — restoran/dorixona/do'kon uchun ALOHIDA KOD KERAK EMAS EDI: admin
"📂+" tugmasi orqali istalgan yangi kategoriya qo'shadi. Shunga qaramay qulaylik uchun
`DEFAULT_CATEGORIES`ga Restoran/Kafe 🍽 va Dorixona 💊 qo'shildi (10→12, eski 10 tegilmagan;
`Do'kon-savdo` allaqachon "do'kon"ni qamrab olgan edi).

**ISBOT:** testServices **73 assertion 3× yashil** (ijtimoiy tarmoq round-trip, 1-5 validatsiya,
null→to'liq bekor qilish, mijoz-reytingiga tegilmaganligi aniq tasdiqlangan) · jonli server
`instagram`/`inspStars` maydonlarini qaytarmoqda · 12 kategoriya jonli DB'da.

## 11. V2+ ufq (hozir QURILMAYDI, faqat yo'nalish)

- **VIP joylashuv** — oyiga to'lov (qo'lda, keyin avtomat) → birinchi daromad.
- **Tanga-kupon** — service tanga qabul qiladi (Bozor ABSORB modeli SUPERAPP_PLAN'da tayyor).
- **Sharh/reyting**, **claim flow**, **buyurtma tugmasi** ("chaqirish" — taxi kabi dispatch).
- **Boshqa tumanlar** — Koson isbotlangach, qo'shni tumanlarga nusxa.
