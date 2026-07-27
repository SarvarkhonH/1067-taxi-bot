# BirJoyMarket — professional katalog (30 kategoriya + mahsulot pasporti) — DoD

**Buyurtma (ega, 2026-07-27):** supermarket/mini-market darajasidagi katalog — 30 ta kategoriya
(emoji bilan) + har mahsulot uchun to'liq ma'lumot to'plami (barkod, SKU, brend, hajm, ishlab
chiqaruvchi, yaroqlilik muddati, yetkazib beruvchi…).

**Ega qarorlari (shu sessiyada):**
- Katalog BirJoyMarket'ga qo'llaniladi.
- Barkod / SKU / Yetkazib beruvchi — **faqat sotuvchi va admin ko'radi**, mijozga ko'rinmaydi.

**Jonli haqiqat (kod yozishdan oldin o'lchandi):** 175 mahsulot, 6 do'kon; kategoriyalar —
`Uy anjomlari 45`, `Aksiya 43`, `umumiy 37`, `PARFUMERIYA 27`, `Parfumeriya 22`, `Bolalar uchun 1`.
Oziq-ovqat mahsuloti **0 ta**. → Eski kategoriyalarni o'chirish 94 faol mahsulotni kategoriyasiz
qoldirardi, shuning uchun mahsuloti borlari SAQLANADI, faqat **bo'shlari** o'chiriladi.

---

## Qamrov (nima o'zgaradi)

### A. Kategoriya katalogi
30 ta kanonik kategoriya (`MARKET_CATEGORIES`, shared) → `CategoryDef` jadvaliga seed. Tartib:
`🔥 Aksiya` (merchandising, sortOrder 0) → 30 ta katalog (1–30) → mahsuloti bor eski kategoriyalar
(90+). Bo'sh eskilari o'chiriladi. `PARFUMERIYA` → `Parfumeriya` normalizatsiya.

### B. Mahsulot pasporti — 7 yangi maydon
`barcode` · `sku` · `brand` · `unit` (og'irlik/hajm) · `manufacturer` · `expiryDate` · `supplier`
Hammasi **nullable** → mavjud 175 mahsulot buzilmaydi.
Ega ro'yxatidagi qolgan 8 maydon allaqachon bor va TAKRORLANMAYDI: narx=`priceTanga`,
chegirma=`oldPriceTanga`, ombor=`stock`, rasmlar=`ProductPhoto` (5 ta), nom/tavsif/kategoriya,
mavjudlik=`active`+`stock`.

### C. Ko'rinish siyosati
| Maydon | Mijoz (miniapp) | Sotuvchi/admin |
|---|---|---|
| Brend, Hajm/og'irlik, Ishlab chiqaruvchi, Yaroqlilik muddati | ✅ ko'radi | ✅ |
| Barkod, SKU, Yetkazib beruvchi | ❌ ko'rinmaydi | ✅ |
| Barkod bo'yicha qidiruv | ✅ ishlaydi (ko'rsatmasdan) | ✅ |

---

## Qabul mezonlari (har biri buyruq+natija bilan isbotlanadi)

| # | Mezon | Tekshiruv buyrug'i | Kutilgan natija |
|---|---|---|---|
| K1 | `MARKET_CATEGORIES` — aynan 30 ta, slug'lar noyob | `node -e` shared bundle'dan uzunlik+Set hajmi | `30 / 30` |
| K2 | 7 yangi maydon `Product` modelida, hammasi optional | `grep -n "barcode\|sku\|brand\|unit\|manufacturer\|expiryDate\|supplier" packages/server/prisma/schema.prisma` | 7 satr, hammasi `?` |
| K3 | Sxema mos: `prisma migrate diff` faqat shu 7 ustun + 1 indeksni ko'rsatadi | `pnpm --filter server exec prisma migrate diff --from-url $DATABASE_URL --to-schema-datamodel prisma/schema.prisma --script` | faqat `ALTER TABLE "Product" ADD COLUMN` × 7 + `CREATE INDEX` |
| K4 | `cleanPatch` yangi maydonlarni validatsiya qiladi (uzunlik cheklovi, barkod 8–14 raqam, sana ISO) | typecheck + `_tmpKatalogTest.ts` (yolg'on/uzun/xato qiymatlar) | noto'g'ri kirish → maydon tushib qoladi, satr buzilmaydi |
| K5 | Butun-repo typecheck toza | `pnpm -r typecheck` | 4/4 paket `0 error` |
| K6 | Seed skripti IDEMPOTENT: 2-marta yugurtirilsa 0 o'zgarish | `tsx seedMarketCategories.ts --apply` ×2 | 2-yugurishda `yangi=0 · yangilandi=0` |
| K7 | Seed'dan keyin: 31 faol `CategoryDef` (Aksiya+30) + mahsuloti bor eski kategoriyalar, **hech bir mahsulot kategoriyasiz emas** | seed hisoboti (orphan tekshiruvi ichida) | `kategoriyasiz mahsulot: 0` |
| K8 | `PARFUMERIYA` dublikati yo'q | seed hisoboti | `PARFUMERIYA → Parfumeriya: 27 ko'chirildi`, keyin 0 |
| K9 | Admin-panel: qo'shish+tahrir formasida 7 maydon bor, kategoriya select'da 30+ variant | jonli admin skrinshot (ega) | ko'rinadi va saqlanadi |
| K10 | Miniapp mahsulot-detalida "Xususiyatlar" jadvali (faqat to'ldirilgan maydonlar) | jonli miniapp skrinshot (ega) | brend/hajm/ishlab chiqaruvchi/muddat ko'rinadi |
| K11 | Barkod/SKU/yetkazib beruvchi mijoz javobida YO'Q | `curl /api/shop/market \| grep -c "barcode\|sku\|supplier"` | `0` |
| K12 | Qidiruv brend va barkod bo'yicha topadi | miniapp qidiruvga brend nomi | mahsulot chiqadi |
| K13 | Pul mantig'iga tegilmagan | `git diff --stat` — `coinService/cashback/booking*` fayllari yo'q | 0 satr |

## Xavf-nazorat
- Sxema o'zgarishi ALOHIDA ONGLI qadam: `migrate diff` → ega tasdig'i → lokal `pnpm db:push` → keyin
  kod push (CLAUDE.md). Kod pushdan oldin push qilinmaydi.
- Seed skripti default **DRY-RUN**; `--apply` faqat ega aytganda.
- Karusel `CategoryDef.name` ni `Product.category` satriga NOM bo'yicha solishtiradi
  (shop.tsx:1243) — nomlar bir-biriga aynan mos bo'lishi K7 bilan isbotlanadi.

## Bajarilgan tekshiruvlar (2026-07-27)

| # | Holat | Isbot |
|---|---|---|
| K1 | ✅ | `MARKET_CATEGORIES` — 30 ta yozuv, slug'lar noyob (seed chiqishida 30 satr) |
| K2 | ✅ | `schema.prisma`: barcode/sku/brand/unit/manufacturer/expiryDate/supplier — hammasi `?` |
| K3 | ✅ | `migrate diff`: `ALTER TABLE "Product" ADD COLUMN` ×7 + `CREATE INDEX "Product_barcode_idx"` |
| K4 | ✅ | `tsx src/scripts/testProductPatch.ts` → **23 o'tdi · 0 yiqildi** |
| K5 | ✅ | `pnpm -r typecheck` → 4/4 paket Done, 0 xato |
| K6 | ⏳ | DRY-RUN toza ishlaydi; idempotentlik `--apply` ×2 dan keyin isbotlanadi (ega tasdig'i kutilmoqda) |
| K7 | ⏳ | DRY-RUN: `kategoriyasiz mahsulot: 27 → «PARFUMERIYA»×27` — apply'dan keyin 0 bo'lishi kerak |
| K8 | ⏳ | DRY-RUN: `«PARFUMERIYA» → «Parfumeriya»: 27 mahsulot` — apply kutilmoqda |
| K9 | ⏳ | Admin-panel parol talab qiladi (kirmadim) — **ega QABUL beradi** |
| K10 | ✅ (demo) / ⏳ (jonli) | `#shopdemo`: to'liq pasport → 4 satrli jadval · 3 kun qolgan → «30.07.2026 · 3 kun qoldi» · pasportsiz → jadval YO'Q · kartada «Coca-Cola · 1.5 L» |
| K11 | ✅ | `listActiveProducts` javobida barcode/sku/supplier YO'Q (kod: shopService.ts) — jonli `curl` deploydan keyin |
| K12 | ⏳ | Server (`getMarketHome`) + client filtriga brend qo'shildi; `#shopdemo` mock-serveri qidiruvni filtrlamaydi → faqat jonli tekshiriladi |
| K13 | ✅ | `git status`: coinService/cashback/booking* fayllarga tegilmagan |

## ⚠️ TOPILGAN ikki masala (kod emas, INFRA)

1. **Lokal `.env` eski bazaga qaraydi.** `DATABASE_URL` → Neon; jonli baza esa 2026-07-25
   cutover'dan beri VPS'dagi `localhost:5432/birjoy` (deploy/MIGRATSIYA_RUNBOOK.md). Shu sababli
   bu hujjatdagi barcha "jonli" raqamlar — **Neon nusxasidan**, jonli haqiqat boshqacha bo'lishi
   mumkin. `db:push` va seed **VPS'da** yugurishi shart.
2. **27 mahsulot karuselda ko'rinmaydi** (`PARFUMERIYA` ≠ `Parfumeriya`) — seed tuzatadi.

## Holat
`ready for verification` (kod qismi) · DB qadami — ega tasdig'ini kutmoqda.
