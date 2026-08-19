# 📞 TELEFON MA'LUMOTNOMA — reja v1

> **Ega so'zi (2026-08-19):** «Xizmatlar bo'limini hali ochmadik, lekin bir muhim ish bor —
> minglab telefon bazalarini moslash kerak. Odam botga `/telefon` tugmasini bossa, kerakli
> xizmatning telefon raqamini shunchaki topsin. Admin panelga ham yasaymiz: mijoz 1067ga
> qo'ng'iroq qilsa, operator paneldan topib bera olsin. Raqamlarni hozir JSON'da guruhlardan
> scrape qilib olamiz — juda qulay qilib yasashing kerak.»
>
> **Ega qarorlari (shu sessiyada, 4 savolga javob):**
> 1. **Saqlash** → alohida `Kontakt` jadvali (xizmatlar katalogi toza qoladi)
> 2. **Kim ko'radi** → **avval FAQAT operator** (admin panel). Bot toza katalogdan javob beradi.
> 3. **Import** → «JSON beraman, sen joylashtir; keyinchalik o'zimga qo'shish qulay bo'lsin»
>    → ya'ni: birinchi partiya = skript (men VPS'da yuklayman), keyin = admin paneldan o'zi.
> 4. **Bot** → `/telefon` tugmasi, **nom bilan** qidiradi, AI yordam beradi, foydalanuvchi
>    **o'z raqamini ham qo'sha oladi** (Telegram kontakt-ulashish bilan).
>
> **Holat: REJA — kod yozilmagan, egadan TASDIQ kutilmoqda.**

---

## §0. Nima allaqachon bor (noldan qurmaymiz)

4 ta narsa tayyor, ularni QAYTA YOZMAYMIZ — ustiga quramiz:

| Bor narsa | Qayerda | Biz nima qilamiz |
|---|---|---|
| `ServiceListing` katalogi (139 faol biznes) + kategoriyalar (12 ta) | `serviceDirectory.ts` · `schema.prisma:1388-1442` | TEGILMAYDI. Qidiruvda **birinchi** turadi. |
| Telefon normalizatsiyasi `+998XXXXXXXXX` | `serviceDirectory.ts:19` `normalizeUzPhone` | Aynan shu ishlatiladi — ikkinchi implementatsiya YO'Q |
| Import naqshi (telefon bo'yicha idempotent) | `importServices.ts` · `importIshborServices.ts` | Umumlashtiriladi (bitta yadro, ikkita eshik) |
| O'zini qo'shish + ega ✅/❌ moderatsiyasi | `submitListing` (:250) · `bot/xizmatlar.ts` | «Raqamimni qo'shish» AYNAN shuni chaqiradi |
| «Topilmadi» so'rovlari jurnali | `ServiceRequest` · `adminListRequests` (:863) | Operator «topolmadim» bosganda ham shu yerga yoziladi |
| AI so'rov-kengaytirish (sinonim, so'z bo'lish) | `ai/providers/catalogFactory.ts:28` `expandTerms` | `/telefon` qidiruvi shuni ishlatadi = «AI yordam beradi» |

**Yangi jadval NIMAGA kerak:** `ServiceListing`da 30dan ortiq ustun bor — reyting, 1067-tekshiruvi
(5 mezon), VIP, foto, claim, narx. Bular **tekshirilgan biznes** uchun. Guruhdan olingan raqamda
esa 3 narsa bor: ism, raqam, nima qilishi. Minglab tekshirilmagan satrni katalogga quysak — 139 ta
tekshirilgan biznes ular ichida yo'qoladi, «Eng yaxshilari» va reyting saralashi ma'nosini
yo'qotadi. Shuning uchun **ikki qavat: toza katalog (ommaviy) + xom ma'lumotnoma (operator)**,
qidiruv esa BITTA.

---

## §1. Ma'lumot modeli — bitta yangi jadval

```prisma
model Kontakt {
  id          Int      @id @default(autoincrement())
  phone       String   @unique            // +998XXXXXXXXX — UNIQUE = dedupe ishini BAZA bajaradi
  phone2      String?
  name        String                      // "Baxodir" | "Mittisantexnik Baxodir"
  what        String   @default("")       // "santexnik, kotyol, ariston, 24/7" — erkin matn
  categoryId  Int?                        // ServiceCategory FK (avto-tasnif; noma'lum bo'lishi mumkin)
  category    ServiceCategory? @relation(fields: [categoryId], references: [id])
  address     String?
  searchText  String   @default("")       // name+what+kategoriya+raqam — kichik harf, ' normallashgan
  source      String   @default("")       // "@koson_ishbor" | "qo'lda" | "admin"
  sourceRef   String?                     // xabar id/havolasi — manbaga qaytib borish
  sourceAt    DateTime?                   // e'lon sanasi → «eskirgan» signali
  status      String   @default("active") // active | hidden | bad  (bad = operator "ishlamadi" dedi)
  verified    Boolean  @default(false)    // operator qo'ng'iroq qilib tasdiqladi
  listingId   Int?                        // ommaviy katalogga chiqarilgan bo'lsa → ServiceListing.id
  callCount   Int      @default(0)        // operator necha marta shu raqamni bergan
  lastUsedAt  DateTime?
  note        String?                     // operator izohi: "javob bermadi", "narxi qimmat"
  importBatch String?                     // qaysi import yaratgan — audit + bir bosishda qaytarish
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  @@index([status, categoryId])
  @@index([importBatch])
}
```

**Uchta qaror va sabablari:**

1. **`phone @unique`** — dublikat muammosi butunlay yo'qoladi. Bir odam guruhga 40 marta yozgan
   bo'lsa ham bitta qator bo'ladi. Bir xil JSON'ni ikki marta import qilsangiz — hech narsa
   o'zgarmaydi (idempotent). Bu minglab scrape satri uchun ENG muhim qaror.
2. **`searchText` bitta ustun** — qidiruv 5 ta ustunni OR bilan skanerlamaydi, bittasini
   skanerlaydi. `pg_trgm` GIN indeksi bilan 10 000+ satrda ham tez (mavjud `addIndexes.ts`
   naqshi bilan qo'yiladi, EXPLAIN bilan isbotlanadi).
3. **`importBatch`** — noto'g'ri partiya kelib qolsa `deleteMany({ where: { importBatch } })`
   bilan bir bosishda qaytariladi. Scrape ma'lumoti bilan ishlashda bu shart.

**Yangi jadval faqat BITTA.** «Topilmadi» so'rovlari mavjud `ServiceRequest`ga yoziladi,
kategoriyalar mavjud `ServiceCategory`dan olinadi.

---

## §2. Pul va xavfsizlik invariantlari

| # | Invariant | Sabab |
|---|---|---|
| T-1 | `CoinTxn`ga BITTA qator ham yozilmaydi, `grantRideCoins` chaqirilmaydi | Bu modul pulga umuman tegmaydi — iqtisod xavfi **0** |
| T-2 | kas1067 API'ga bitta so'rov ham ketmaydi | kas yuklama xavfi **0** |
| T-3 | Yangi poller YO'Q — sweep'ga tegilmaydi | ARCHITECTURE.md §5 qoidasi |
| T-4 | Xom kontaktlar **default'da faqat admin-auth ortida** (`requireAdmin`) | Ega qarori #2 |
| T-5 | Botda maksimum **8 natija**, offset-paginatsiya YO'Q, `q` uzunligi ≥3 | Bazani skript bilan so'rib olishning (enumeration) oldini oladi |
| T-6 | JSON fayllar git'ga **kirmaydi** (`packages/server/data/` → `.gitignore`) | Minglab odamning raqami repo tarixiga tushmasin |
| T-7 | Ommaviy eksport endpoint'i YO'Q | Bazani bir so'rov bilan olib ketish yo'li bo'lmasin |
| T-8 | Har qatorda `source`+`sourceRef` — qaysi guruh, qaysi xabar | «Bu raqam qayerdan?» degan savolga javob bo'lsin |
| T-9 | `/telefon` — yangi bayroq `telefon`, DARK; xom kontaktlarni botga ochish alohida bayroq `telefonraw` | Bir tugma bilan «operator-only» → «hamma» |

---

## §3. Qidiruv — bitta yadro, uchta eshik

`services/phoneBook.ts` (yangi) — **bitta** funksiya hamma joyni boqadi:

```ts
searchPhones(q, { limit, includeRaw }) → PhoneHit[]
```

- `q` normallashadi (kichik harf, `'`/`ʼ`/`` ` `` birxil, raqam bo'lsa faqat raqamlar).
- **AI qatlami:** mavjud `expandTerms()` (catalogFactory) — «santexnik kerak» → `["santexnik"]`,
  sinonimlar (`santehnik→santexnik`, `parikmaxer→sartarosh`, `basen→basseyn`), stop-so'zlar
  tashlanadi. Xatolikka chidamli qidiruv trigram o'xshashligi bilan («santexnk» ham topadi).
- **Ikkita manba parallel** (`Promise.all`, union-SQL emas — oddiy va xavfsiz):
  1. `ServiceListing` (status=active) — **doim**
  2. `Kontakt` (status=active) — **faqat `includeRaw`** (operator, yoki `telefonraw` ON bo'lsa)
- Saralash: 🏅 katalog (1067-tekshiruvi → verified → reyting) → ✅ tasdiqlangan kontakt →
  ko'p ishlatilgan kontakt → qolganlar.
- Natija bitta shaklda: `PhoneHit { kind: "katalog"|"kontakt", id, name, phone, phone2, what,
  categoryName, emoji, badge, sourceAt }`.

Uchta eshik: **bot `/telefon`** (`includeRaw:false`) · **admin operator** (`includeRaw:true`) ·
**Koson AI** (mavjud `xizmatProvider` — o'zgarmaydi, keyin `telefonraw` yoqilsa ulaymiz).

---

## §4. Import — bitta yadro, ikkita eshik

`services/contactImport.ts` (yangi):

```ts
importContacts(input, { batch, source, dryRun }) → ImportReport
```

**Kiruvchi JSON — 2 xil shaklni ham qabul qiladi** (sizdan qanday chiqsa shunday ishlaydi):

```jsonc
// A) Toza ro'yxat
[{ "name": "Baxodir", "phone": "90 123 45 67", "what": "santexnik 24/7",
   "category": "Usta-servis", "address": "...", "source": "@koson_ishbor", "date": "2026-07-14" }]

// B) Telegram Desktop eksporti (result.json) — TO'G'RIDAN-TO'G'RI
{ "messages": [{ "id": 4412, "date": "2026-07-14T10:22:00", "from": "Baxodir",
                 "text": "Santexnik xizmati 24/7. Tel: 90-123-45-67" }] }
//    → matndan raqam(lar) regex bilan ajratiladi, `from` = ism, matn = `what`
```

**Quvur:** parse → `normalizeUzPhone` → yaroqsizlarni chetga → partiya ichida dedupe (eng boy
satr saqlanadi) → **kalit-so'z bilan avto-tasnif** (`santexnik|kotyol|ariston` → Usta-servis,
`sement|g'isht|beton` → Qurilish, … mavjud `CAT_MAP` kengaytiriladi) → `searchText` yig'iladi →
**telefon bo'yicha upsert**.

**Upsert qoidasi (muhim):** mavjud qatorda faqat **bo'sh** maydonlar to'ldiriladi; operator
kiritgan ism/izoh/`verified` HECH QACHON qayta yozilmaydi. `what` ga yangi so'zlar qo'shiladi.

**Hisobot (dry-run ham, commit ham):**
```
📥 2026-08-19-ishbor  ·  manba: @koson_ishbor
   3 412 xabar → 1 108 raqam topildi
   ✅ 641 yangi · 🔁 402 mavjud (boyitildi) · ⚠️ 65 yaroqsiz raqam
   📂 Usta-servis 214 · Qurilish 178 · Transport 96 · … · Boshqa 41
   Namuna (yangi):  Baxodir — santexnik 24/7 — +998901234567
   Namuna (yaroqsiz): "tel: 123-45"  (9 xonali emas)
```

**Ikki eshik, bitta yadro:**
- **Skript** `scripts/importKontakt.ts <fayl.json>` — **default DRY-RUN**, yozish uchun `--commit`.
  Birinchi partiyani men VPS'da shu bilan yuklayman (siz JSON'ni berasiz).
- **Admin panel** — «📥 Import» paneli: faylni tashla → «Tekshirish» (dry-run hisobot) → ko'rasiz
  → «Import qilish». Keyinchalik o'zingiz, SSH'siz. Yoniga **«➕ Bitta raqam qo'shish»** formasi
  (ism · raqam · nima qiladi · kategoriya) — kundalik bitta-bitta qo'shish uchun.

---

## §5. Admin panel — «📞 Ma'lumot» (operator ekrani)

Mijoz 1067ga qo'ng'iroq qilib turibdi. Operatorda **bitta maqsad: 5 soniyada raqamni aytish.**
Shuning uchun bu ekran «panel» emas — **qidiruv qatori**.

```
┌───────────────────────────────────────────────────────────────┐
│ 🔎 [ santexnik                                    ]  1 108 raqam│  ← avto-fokus
├───────────────────────────────────────────────────────────────┤
│ 🏅 Mittisantexnik Baxodir              +998 99 081 40 50   [📋]│  ← katalog (tekshirilgan)
│    Usta-servis · santexnik, kotyol, ariston 24/7               │
│    ★4.8 (12) · 🏅 1067 tekshiruvi 84                           │
│    [📞 Berdim]  [❌ Ishlamadi]                                  │
├───────────────────────────────────────────────────────────────┤
│ ✅ Jamshid — santexnik                 +998 90 512 33 21   [📋]│  ← tasdiqlangan kontakt
│    📢 @koson_ishbor · 14-iyul · 📞 7 marta berilgan             │
├───────────────────────────────────────────────────────────────┤
│    Olim aka                            +998 93 774 10 02   [📋]│  ← xom kontakt
│    📢 @koson_qurilish · 2-mart ⚠️ eski                          │
└───────────────────────────────────────────────────────────────┘
                                       [😔 Topolmadim — so'rovga yoz]
```

**Operator uchun tezlik detallari** (bularsiz ekran ishlamaydi):
- Qidiruv qatori **avto-fokus**, sahifa ochilishi bilan yozish mumkin.
- `↑`/`↓` — qatorlar orasida, `Enter` — raqamni **nusxalash**. Sichqonchasiz.
- Raqam **katta va yaxlit** yozilgan (`+998 90 512 33 21`) — operator uni ovoz bilan o'qiydi.
- `[📞 Berdim]` → `callCount++`, `lastUsedAt` — keyin «qaysi raqamni ko'p so'rashadi» ko'rinadi
  (bu — katalogga qaysi bizneslarni chiqarish kerakligining REAL ma'lumoti).
- `[❌ Ishlamadi]` → `status=bad` + izoh. Baza mijozlar bilan gaplashib tozalanadi.
- `[😔 Topolmadim]` → mavjud `ServiceRequest`ga yoziladi → «📬 Topilmagan xizmat so'rovlari»
  panelida ko'rinadi (u allaqachon bor) → siz o'sha biznesni topib qo'shasiz, mijozi tayyor.
- `[⬆️ Katalogga chiqarish]` (kengaytirilgan qatorda) → `Kontakt` → `ServiceListing` yaratadi
  (`listingId` bog'lanadi). Xom raqam **tekshirilgan biznesga** shu yo'l bilan aylanadi.

---

## §6. Bot — `/telefon`

```
/telefon  (yoki «📞 Telefon» tugmasi)
   ↓
📞 Kimning raqami kerak?
Yozing — masalan: santexnik · sartarosh · gaz ustasi · dorixona
      [➕ Raqamimni qo'shish]   [🚀 To'liq katalog]
   ↓  «santexnik kerak»
📞 «santexnik» bo'yicha:

🔧 Mittisantexnik Baxodir ✅
   +998 99 081 40 50
   Usta-servis · kotyol, ariston, 24/7 · ★4.8

🔧 Jamshid — santexnik
   +998 90 512 33 21
      [🚀 To'liq profil]   [😔 Topilmadi]
```

- Raqam **oddiy matn** bilan yoziladi — Telegram o'zi bosiladigan qiladi (`tel:` hiylasi kerak
  emas, mavjud `xizmatlar` qidiruvida shu naqsh ishlayapti).
- **Hech narsa topilmasa:** so'rov `ServiceRequest`ga yoziladi + «izlab topamiz, xabar beramiz»
  + Koson AI tugmasi. Bo'sh ekran chiqmaydi (dizayn qoidasi #2).
- **«➕ Raqamimni qo'shish»** — MAVJUD `submitListing` oqimi (ikkinchi implementatsiya YO'Q):
  ism → nima qilasiz/kategoriya → raqam. Raqam bosqichida **«📱 Raqamimni ulashish»** tugmasi
  (Telegram o'zi tasdiqlaydi = raqam haqiqatan uniki) yoki boshqa raqam yozish. Yuborilgach —
  egaga ✅/❌ kartochkasi, tasdiqlansa ommaviy katalogga tushadi.
- **DARK:** `telefon` bayrog'i OFF, adminlarga preview (`xizmatlar` bilan bir xil konvensiya).
- **Ro'yxatdan o'tish tartibi:** `registerTelefon(bot)` **sinxron** va `registerBooking`dan
  **oldin** (2026-07-27 saboqi: `lazy import().then()` matn-tutqichni eng oxirga surib yuboradi
  va foydalanuvchi yozgan matn boshqa oqimga tushib ketadi).
- **Tegilmaydi:** raqam yozilganda chiqadigan «qo'lda yozib bo'lmaydi» ogohlantirishi
  (`bot.ts:680`) — bu akkaunt himoyasi, ega qarori #4 bo'yicha o'z holicha qoladi.

---

## §7. O'zgaradigan fayllar

**Server**
| Fayl | O'zgarish |
|---|---|
| `prisma/schema.prisma` | +`Kontakt` modeli, `ServiceCategory`ga teskari-relatsiya |
| `services/phoneBook.ts` | **YANGI** — `searchPhones` + operator amallari (berdim/ishlamadi/izoh/katalogga chiqarish) |
| `services/contactImport.ts` | **YANGI** — 2 shaklni parse, tasnif, upsert, dry-run hisobot |
| `services/featureFlags.ts` | +`telefon`, +`telefonraw` (ikkalasi OFF, EXPECTED_ON'ga QO'SHILMAYDI) |
| `api/server.ts` | +7 route: `/api/admin/kontakt/{search,used,bad,note,promote,one,import}` (`requireAdmin`) |
| `bot/telefon.ts` | **YANGI** — `/telefon` oqimi + «raqamimni qo'shish» sehrgari |
| `bot/bot.ts` | `registerTelefon(bot)` sinxron, booking'dan oldin + menyu qatori (bayroq ON bo'lsa) |
| `scripts/importKontakt.ts` | **YANGI** — CLI (default dry-run, `--commit` bilan yozadi) |
| `scripts/addIndexes.ts` | +`pg_trgm` kengaytmasi + `Kontakt.searchText` GIN indeksi |
| `scripts/testPhoneBook.ts` | **YANGI** — assertion testi (normalizatsiya · dedupe · tasnif · qidiruv · idempotentlik) |
| `.gitignore` | +`packages/server/data/` (xom JSON git'ga tushmaydi) |

**Shared:** `types.ts` — `PhoneHit`, `KontaktRow`, `ImportReport`, `RawContact`
**Admin:** `App.tsx` (yangi «📞 Ma'lumot» tab + `MalumotView`) · `api.ts` (+7 metod) · `styles.css`

**TEGILMAYDIGAN fayllar** (ataylab): `coinService.ts` · `cashbackService.ts` · `bookingNotifier.ts`
· `kas/client.ts` · `serviceDirectory.ts` (faqat `normalizeUzPhone` **o'qiladi**, o'zgartirilmaydi).

---

## §8. Bosqichlar va DoD (har bandning tekshiruv-buyrug'i bor)

| # | Bosqich | Qabul mezoni | Tekshiruv-buyrug'i |
|---|---|---|---|
| **P0** | Sxema | VPS bazasida `Kontakt` jadvali + trigram indeks bor | VPS: `prisma migrate diff` (o'qiladi) → `db push` → `\d "Kontakt"` chiqishi |
| **P1** | Import yadrosi | 2 shakl ham parse bo'ladi · dedupe ishlaydi · qayta import 0 o'zgarish | `npx tsx testPhoneBook.ts` — hamma assertion yashil, **3× ket-ket** |
| **P1b** | Sizning JSON'ingiz | Dry-run hisoboti ko'rsatiladi, siz «ha» desangiz commit | Dry-run chiqishi to'liq nusxa qilib beriladi |
| **P2** | Operator paneli | «santexnik» yozilganda natija <300ms · nusxalash · berdim/ishlamadi/topolmadim | Jonli admin skrinshot + `EXPLAIN ANALYZE` vaqti |
| **P3** | Import UI | Siz o'zingiz fayl tashlab import qila olasiz (SSH'siz) | Siz o'zingiz bir marta qilib ko'rasiz |
| **P4** | Bot `/telefon` | Qidiruv · «topilmadi» so'rovga yoziladi · «raqamimni qo'shish» → ega kartochkasi | Sizning shaxsiy telefoningizda, DARK preview'da |

Har bosqich: `pnpm typecheck` 3/3 toza (server+miniapp+admin). CI qalqoni (typecheck+vitest+
simEconomy/simLoyalty/simGuards) yashil bo'lmasa deploy to'xtaydi.

**Men «tayyor» demayman** — har bosqichda «READY FOR VERIFICATION» + buyruq va natija isboti
(CLAUDE.md DoD R1). «Done» — sizning so'zingiz.

---

## §9. Xavflar va ularni bartaraf qilish

| Xavf | Nima bo'lishi mumkin | Bartaraf |
|---|---|---|
| **Shaxsiy ma'lumot** — minglab odamning raqami | Kimdir «mening raqamim qayerdan?» deb so'raydi | Default'da faqat operator ko'radi (T-4) · har qatorda manba (T-8) · «o'chirish» yo'li bir bosishda · git'ga tushmaydi (T-6) |
| **Bazani so'rib olish** (enumeration) | Kimdir bot orqali butun bazani yig'ib oladi | Maks 8 natija, paginatsiya yo'q, `q`≥3, mavjud `rateLimit()` (T-5, T-7) |
| **Eskirgan raqam** | Mijoz qo'ng'iroq qiladi — javob yo'q, ishonch tushadi | `sourceAt` ko'rsatiladi («⚠️ eski») · `[❌ Ishlamadi]` bilan operator darrov belgilaydi |
| **Sxema qadamini unutish** | Yangi kod eski bazaga chiqadi → **har so'rov yiqiladi** | P0 ALOHIDA qadam: `db push` VPS'da, kod push'idan **OLDIN** (CLAUDE.md qoidasi) |
| **Qidiruv sekinligi** | 10k satrda operator kutib qoladi | Bitta `searchText` ustuni + GIN trigram · `EXPLAIN ANALYZE` bilan raqam bilan isbotlanadi |
| **Bot handler tartibi** | `/telefon` matni booking'ga tushib ketadi | Sinxron ro'yxat, booking'dan oldin (2026-07-27 saboqi kodda izoh bilan) |
| **Noto'g'ri partiya** | Yomon JSON minglab axlat satr yaratadi | `importBatch` → `deleteMany({ importBatch })` bilan bir bosishda qaytariladi + dry-run majburiy |

**Qaytarish (rollback):** `setFlag telefon off` (bot eshigi yopiladi) · admin tab yashiriladi ·
`deleteMany({ where: { importBatch } })` (partiya o'chadi). Xizmatlar katalogi va pul tizimiga
umuman tegilmagani uchun qaytarish **hech narsani buzmaydi**.

---

## §10. Sizdan kerak bo'lgan narsalar

1. **JSON fayl(lar)** — qaysi guruhlardan, qanday shaklda. Ikkala shakl ham ishlaydi
   (§4), shuning uchun formatni o'zgartirishingiz shart emas — borini bering.
2. **Tasdiq** — shu reja bo'yicha boshlaymanmi?

Fayl kelgach tartib: **P0 (sxema) → P1 (yadro+test) → P1b (sizning JSON dry-run) → P2 (operator
paneli)**. Ya'ni JSON kelgan kuni operator uni ishlata boshlaydi. P3/P4 keyin.
