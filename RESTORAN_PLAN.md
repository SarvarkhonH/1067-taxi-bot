# RESTORAN — Hamyon→Uy ko'chirish + tab joyiga taom-buyurtma (V1 = concierge, chiroyli old-tomon)

*Maqsad: tabbardagi "Hamyon" slotini bo'shatish, o'rniga Kosonda restoran/oshxonalardan taom buyurtma. Mijoz uchun Uber Eats darajasidagi CHIROYLI tajriba — orqa tomonda esa boshida AVTOMATIKA emas, ODAM (admin) ko'prik bo'ladi.*

---

## 0. Markaziy qaror — Concierge V1 (Wizard-of-Oz)

Bu darajani boshidanoq mukammal avtomatlashtirib bo'lmaydi (restoranlar Telegram botga ulanmagan, javob-tezligi noma'lum, ishonch yo'q). Shuning uchun:

- **Mijoz tomoni — TO'LIQ, CHIROYLI, real his beruvchi.** Katalog, menyu, savat, checkout, jonli holat-kuzatuv — hammasi ishlab turadi, hech narsa "demo" ko'rinmaydi.
- **Restoran tomoni — ODAM (admin/operator).** Buyurtma tushgach admin panelda "sessiya" paydo bo'ladi → operator restoranga QO'NG'IROQ QILADI → tayyorlashga rozi qilinadi/vaqt so'raladi → operator holatni QO'LDA panelda o'zgartiradi (qabul qilindi → tayyorlanmoqda → yo'lda → yetkazildi). Mijoz bu holat o'zgarishlarini jonli ko'radi (push+timeline) — lekin uni ODAM boshqaryapti, deb bilmaydi.
- Bu — real Wizard-of-Oz/concierge MVP patterni: talab va operatsion qiyinchilikni ARZON tekshiramiz, keyin (hajm oqlasa) restoran-tomonli Telegram-avtomatikaga (eski D3 reja) o'tamiz — bu ENDI V2.

Nega to'g'ri: mijoz tajribasi kuniyoq professional ko'rinadi (savdo/ishonch shu yerdan keladi), operatsion xato bo'lsa operator zudlik bilan telefon orqali tuzatadi (restoran-bot integratsiyasi kutilmagan holatlarni yutolmasdi), va eng muhimi — QANCHA odam buyurtma qilyapti, qaysi restoran ishonchli, qayerda uzilish bo'ladi — buni ko'rib, keyin avtomatlashtiramiz. Avval avtomatlashtirib, keyin talab yo'qligini bilish — teskari va qimmat.

---

## 1. Hal qiluvchi qarorlar (D1–D6)

### D1. To'lov: FAQAT NAQD (yetkazishda), so'mda.
Taom — uchinchi tomon real tannarxi. Tanga bilan to'lansa, ega restoranga real pulni cho'ntagidan to'lashi kerak bo'lardi — pul-qalqon buziladi. Intercity precedenti (real so'm, tanga emas) qo'llanadi. CoinTxn'ga umuman teginilmaydi → ekonomik risk NOL, refund logikasi kerak emas (naqd to'lanmagan holatda pul harakati yo'q).

### D2. Buyurtma oqimi — CONCIERGE (§0). Operator = admin panel + telefon.
`orderChatId`/restoran-Telegram-bot integratsiyasi V1'DA QURILMAYDI. Restoran modelida faqat `phone` kifoya. Operator UI — admin panelning yangi bo'limi "Buyurtma sessiyalari": kelgan buyurtma ro'yxati, har birida "Restoranga qo'ng'iroq qilindi" checkbox, keyin holat tugmalari.

### D3. Yetkazish: V1 — restoran o'zi yetkazadi (yoki mijoz olib ketadi).
Operator qo'ng'iroqda "yetkazasizmi yoki kelib olsinmi" so'raydi. 1067 haydovchi-tarmog'i orqali yetkazish (avvalgi D2/V2 g'oyasi) — alohida katta reja, hozir YO'Q.

### D4. Bir savat = bir restoran (Uber Eats standarti) — o'zgarmadi.

### D5. Hech qanday yangi poller YO'Q.
Operator-SLA eslatmasi (pastda §3) mavjud `bookingNotifier` sweep'iga qo'shiladi — yangi sikl yo'q.

### D6. Hamyon YO'QOLMAYDI — faqat tabbardan chiqadi.
Kod fakti: `App.tsx:101-102` — `tip`/`paydriver`/`pay`/`hamyon` deep-linklari wallet ekraniga bog'langan (bot "🙏 Haydovchiga to'lash" tugmasi). Wallet ekran sifatida qoladi (`Tab` tipida, render, deep-link) — faqat `BASE_TABS`/`DRIVER_TABS` massividan chiqadi. Bu aynan `elonlar` flagi Reyting bilan qilgan mexanizm (App.tsx:307-309). Risk ≈ 0.

---

## 2. Buyurtma hayot-sikli — CONCIERGE versiya (loyihaning yuragi)

```
pending (mijoz yubordi) ──[operator qo'ng'iroq qildi + restoran rozi]──▶ accepted
accepted ──[operator: "🍳 Tayyorlanmoqda" bosdi]──▶ preparing
preparing ──[operator: "🛵 Yo'lda" bosdi]──▶ delivering  (pickup bo'lsa: "✅ Tayyor, kutmoqda")
delivering ──[operator: "✅ Yetkazildi" bosdi]──▶ delivered

pending ──[operator: restoran rad etdi/yopiq, sabab kiritadi]──▶ rejected  → mijozga push + sabab
pending ──[3 daq ichida operator hech narsa bosmadi]──▶ ⚠ SLA-belgi admin panelda (mijozga hali ko'rinmaydi — operatorni ogohlantirish, avto-rad emas)
pending ──[mijoz, faqat pending'da]──▶ cancelled_by_user
```

Muhim farq avvalgi (bot-avtomatik) rejadan: **`expired` holati yo'q — buyurtma hech qachon o'z-o'zidan "vaqti o'tdi" bo'lib qolmaydi.** Chunki operator har doim telefon orqali RESTORANDAN REAL javob olyapti (bir necha daqiqada) — kutilmagan uzilish yo'q, faqat operator sekinlashib qolishi mumkin, shuning uchun `expired` emas, ichki SLA-ogohlantirish (§3) kifoya.

Har holat o'tishida mijozga push (bot, kas-SMS-mirror patterni: tezkor+bepul+boy format) + Mini App jonli timeline (booking3 timeline komponent patterni).

## 3. Operator SLA-nazorati (ichki, mijozga ko'rinmaydi)

- Admin panelda har `pending` sessiya "necha daqiqa kutmoqda" bilan ko'rinadi, 3 daqiqadan keyin qatorning fon rangi ogohlantirish rangiga o'tadi (design/tokens'dagi warning rang).
- `bookingNotifier` sweep'i (mavjud, yangi poller yo'q) har aylanishida `pending`dagi eski sessiyalarni tekshiradi va operator(lar)ga Telegram-eslatma yuboradi ("2 ta buyurtma 5+ daqiqadan beri kutmoqda").
- Bu FAQAT ichki nazorat — mijoz "restoran javob bermadi" ko'rmaydi, chunki hech qachon shunday holatga tushmasligi kerak (operator SLA'si shuni kafolatlaydi).

## 4. Data model (Prisma)

```prisma
model Restaurant {
  id             Int      @id @default(autoincrement())
  name           String
  category       String   @default("milliy")   // milliy|fastfood|shirinlik|ichimlik|boshqa
  phone          String                          // operator shu raqamga qo'ng'iroq qiladi (V1 yagona aloqa kanali)
  address        String?
  workHours      String?                         // "09:00-22:00" — Ochiq/Yopiq hisobi (xizmatlar patterni qayta ishlatiladi)
  deliveryFeeSom Int      @default(0)
  minOrderSom    Int      @default(0)
  pickupEnabled  Boolean  @default(true)
  prepMinutes    Int      @default(30)            // "taxminan N daqiqa" — operator checkout paytida ko'radi, qo'ng'iroqda tasdiqlaydi
  photosJson     Json?                            // logo+fon, shop galereya patterni (tg file_id)
  active         Boolean  @default(true)
  sortOrder      Int      @default(0)
  avgRating      Float    @default(0)
  reviewCount    Int      @default(0)
  orderCount     Int      @default(0)             // kelajak sotuv-quroli: "sizga N buyurtma keltirdik"
  menuItems      MenuItem[]
}

model MenuItem {
  id            Int        @id @default(autoincrement())
  restaurantId  Int
  restaurant    Restaurant @relation(fields: [restaurantId], references: [id])
  section       String     @default("Taomlar")
  name          String
  desc          String     @default("")
  priceSom      Int                                // REAL SO'M (D1)
  photoFileId   String?
  available     Boolean    @default(true)          // operator/admin qo'lda "tugadi" qiladi (V1'da restoran o'zi kira olmaydi)
  sortOrder     Int        @default(0)
}

model FoodOrder {
  id             Int      @id @default(autoincrement())
  memberId       Int
  restaurantId   Int
  itemsJson      Json     // [{menuItemId, name, qty, priceSom}] — narx SNAPSHOT
  itemsTotalSom  Int
  deliveryFeeSom Int      @default(0)
  totalSom       Int
  isPickup       Boolean  @default(false)
  address        String
  contact        String
  note           String   @default("")
  status         String   @default("pending")     // pending|accepted|preparing|delivering|delivered|rejected|cancelled_by_user
  rejectReason   String?
  calledAt       DateTime?                          // operator "qo'ng'iroq qildim" belgisi — SLA hisob shundan
  operatorId     Int?                               // qaysi admin/operator ishladi (javobgarlik izi)
  acceptedAt     DateTime?
  deliveredAt    DateTime?
  createdAt      DateTime @default(now())
  @@index([restaurantId, status])
  @@index([memberId, createdAt])
  @@index([status, createdAt])                      // SLA-sweep uchun
}
```

CoinTxn YO'Q. Kas1067 API'ga teginish YO'Q. Yangi package YO'Q.

## 5. UX — mijoz tomoni (CHIROYLI, bu yerda kompromis yo'q)

Backend concierge bo'lgani uchun front-end SIFATI ikki barobar muhim — mijoz uchun yagona "dalil" shu.

| Ekran | Mazmun | Dizayn talabi |
|---|---|---|
| Restoran ro'yxati (yangi tab) | kategoriya-chiplar, katta foto-kartalar, reyting, yetkazish haqi, Ochiq/Yopiq badge, taxminiy vaqt | hero-darajali kartalar (shop.tsx hero-carousel patterni), skeleton yuklanishda |
| Restoran sahifasi | fon-foto parallax/hero, menyu section-bo'yicha, har item [+] mikro-animatsiya bilan (transform/opacity, prefers-reduced-motion hurmat) | shop.tsx detail + galereya |
| Savat (pastki sticky bar) | doim ko'rinadi, badge-son bilan, item qo'shilganda sakrash-animatsiya | YANGI, lekin <100ms visual javob shart |
| Checkout | manzil pre-fill, telefon avto, izoh, olib-ketish toggle — 1 ekranda, ortiqcha bosish yo'q | shop 2-step buy soddalashtirilgan |
| Holat ekrani | jonli timeline, har bosqichda mikro-animatsiya + haptik (booking3 pattern), "hozir tayyorlanmoqda" degan HIS — garchi orqada odam bo'lsa ham | booking3 timeline/haptik |
| Buyurtmalarim | tarix + 1-bosishda qayta-buyurtma | shop "mening buyurtmalarim" |

Har ekran 3-soniya testidan o'tishi shart: bu nima? menga nima? nima bosaman? — ayniqsa birinchi kirishda (savdo shu yerda hal bo'ladi).

**Jalb qilish mezoni (R1/R2 DoD'ga kiradi, "chiroyli" so'zini o'lchanadigan qiladi):**
- Restoran-ro'yxati ochilganda birinchi ekranda kamida 3-4 to'liq karta ko'rinadi (bo'sh joy/skelet emas) — foto sifatsiz bo'lsa featured-restoranlar bilan boshlanadi.
- Har taom [+] bosilganda savat-badge shu zumda (<100ms) yangilanadi — kechikish sezilsa "o'lik" his beradi, bu yo'l qo'yilmaydi.
- Ranglar/shrift/bo'shliq FAQAT design/tokens'dan — yangi ekran uchun ham inline stil yozilmaydi (loyihaning umumiy qoidasi shu yerda ham amal qiladi).

## 6. Admin panel — V1'ning HAQIQIY yuragi

Avvalgi rejada admin panel "monitor" edi; concierge modelda bu **operator ish stoli**:

- **Sessiyalar navbati** (asosiy ekran): yangi buyurtmalar tepada, SLA-rang bilan (3 daq+ ogohlantirish). Bir bosishda: mijoz+manzil+telefon+taomlar+summa ko'rinadi.
- **"Qo'ng'iroq qilindi" checkbox** → `calledAt` yozadi (SLA soat shundan to'xtaydi ko'rinishda, lekin holat hali `pending`).
- **Holat tugmalari**: `[✅ Qabul qildi (ETA daqiqa kiritish)] [❌ Rad (sabab)]`, keyin `[🍳 Tayyorlanmoqda] [🛵 Yo'lda] [✅ Yetkazildi]` — bitta operator bir joydan boshqaradi, Telegramga chiqmasdan.
- **Restoran+menyu CRUD** — Do'kon admin kartalar+inline forma patterni (eng yangi: commit `e6d069d`).
- **Statistika** — restoran bo'yicha buyurtma soni, o'rtacha operator-javob-vaqti (V2'ga o'tish qarorini shu raqamlar asoslaydi: "restoran X oyiga 40 buyurtma oladi — endi to'g'ridan-to'g'ri Telegram-bot ulaymiz").
- **Kill-switch** — `restoran` flag off = tab yo'qoladi, ochiq sessiyalar admin panelda qo'lda yopiladi.

### 6.1 Ma'lumot kiritish — tezlik shart (operator kunlik shu bilan ishlaydi)

Ko'p restoran/menyu kiritish og'riqli bo'lmasligi kerak — bu ish-tezlikni belgilaydi:

- **Bulk-menyu kiritish**: bitta katta textarea'ga "nom — narx" qatorlarini joylab (nusxa-ko'chirish, masalan restoran menyusi rasmidan qo'lda yozilgan matn) → avto-parse → tahrirlanadigan jadval → "Saqlash". Har taomni birma-bir forma ochib kiritish YO'Q (Do'kon MVP'dagi kabi bitta-bittalab emas).
- **Restoran nusxalash shabloni**: yangi restoran qo'shishda "shu kategoriyadagi restorandan nusxa" (ish-vaqti, yetkazish haqi, section nomlari oldindan to'ldiriladi) — faqat farqni tahrirlash qoladi.
- **Foto tez yuklash**: Telegram orqali rasm yuborish → file_id avtomatik menyu-itemga bog'lanadi (qo'lda URL kiritish yo'q) — shop/xizmatlar foto-oqimi bilan bir xil.
- **Inline tahrirlash**: narx/mavjudlik/tavsif kartaning o'zida (modal ochmasdan) — commit `e6d069d` (do'kon kartalar+batched forma) patterni to'g'ridan-to'g'ri ko'chiriladi.
- **O'lchov mezoni (R4 DoD'ga kiradi)**: yangi restoran + 15 taomli menyu **10 daqiqadan kam** vaqtda kiritilishi kerak — ega/operator o'zi sinab, vaqt o'lchaydi.

## 7. Tiketlar + DoD

### W1 — Tab-restruktura (kichik, mustaqil)
Fayllar: `App.tsx` (BASE_TABS/DRIVER_TABS'dan wallet chiqadi, Tab tipi+render+deep-link QOLADI), `uy.tsx` (balans-qator bosiladigan + Hamyon tile).
DoD: (1) tabbarda Hamyon yo'q — skrinshot; (2) Uy balans/tile bosilsa wallet ochiladi — skrinshot; (3) bot "🙏 Haydovchiga to'lash" deep-link hali wallet+pay-sheet ochadi — real telefonda video; (4) `pnpm typecheck` toza, tabbar 4-5 tabda buzilmaydi (885b58c saboq).

### R1 — Model + API + katalog o'qish (DARK, flag `restoran` off)
Fayllar: `schema.prisma` (+3 model), `server.ts` (`/api/restoran/list|:id`), `restoranService.ts`, miniapp `restoran.tsx` (katalog+menyu, savat hali yo'q).
DoD: flag off'da tab ko'rinmaydi (prod skrinshot); flag on (owner-preview)da katalog+dizayn §5 darajasida ochiladi; typecheck; `prisma db push` LOKALDA avval.

### R2 — Savat + checkout + FoodOrder yaratish
DoD: bitta-restoran-cheklov ishlaydi; minOrderSom ostida tugma o'chiq; ish-vaqti tashqarisida bloklanadi; FoodOrder to'g'ri snapshot bilan yoziladi — har biri skrinshot/skript bilan.

### R3 — Admin sessiya-navbati + qo'lda holat-boshqaruv + SLA-belgi
DoD: yangi buyurtma admin panelda darhol ko'rinadi (real-vaqt yoki 5-10s poll); operator holat tugmalarini bossa mijoz Mini App'da jonli yangilanadi (video-isbot); 3 daq+ sessiya rang o'zgaradi; sweep operator-eslatma yuboradi (TEST_DATABASE_URL'da sinaladi, APP DB'da EMAS — qonga yozilgan saboq).

### R4 — Restoran+menyu CRUD (admin, §6.1 tezlik talablari bilan)
DoD: (1) ega admin orqali restoran+menyu+foto kiritadi — jonli skrinshot; (2) bulk-menyu-parse ishlaydi (matn joylab → jadval → saqlash) — skrinshot; (3) restoran-nusxalash shabloni ishlaydi; (4) inline-tahrirlash (modal-siz) ishlaydi; (5) **o'lchov**: yangi restoran+15 taom <10 daqiqada kiritildi — ega/operator o'zi sinaydi, vaqt yozib beradi.

### R5 — Seed + pilot + QABUL
- Koson'dan 5-8 real restoran/oshxona (telefon+rozilik) — KOD EMAS, egalik ish.
- Pilot: 1 hafta, ega/operator 3-5 real test-buyurtma qiladi (o'zi mijoz, o'zi operator) — end-to-end tekshiruv.
- QABUL mezoni: ≥10 muvaffaqiyatli real buyurtma, operatorning har buyurtmani 3 daq ichida "qabul qildi"ga o'tkaza olishi, mijoz-tomon UI 3-soniya testidan o'tishi (ega o'zi his qiladi). Shundan keyin flag hammaga ON.

Tartib: W1 → R1 → R2 → R3 → R4 → R5. Har biri READY FOR VERIFICATION + mustaqil tekshiruv, keyingisi oldingi tasdiqsiz boshlanmaydi.

### V2 (hozir QURILMAYDI, faqat reja sifatida qoladi)
Hajm operator qo'lini og'irlashtirsa: restoran-tomonli Telegram-bot (`orderChatId`, inline ✅/❌/holat tugmalari — operator o'rniga restoran o'zi bossin), so'ng haydovchi-tarmoq orqali yetkazish, so'ng tanga-chegirma (byudjet-knob ichida).

## 8. Xavflar jadvali (concierge modelga moslashtirilgan)

| Xavf | Ehtimol | Yumshatish |
|---|---|---|
| Operator bandligi | YO'Q — operator 24/7 mavjud (tasdiqlangan) | Buyurtma vaqti FAQAT restoranning o'z ish-vaqti bilan cheklanadi (`Restaurant.workHours`), operator tomonidan cheklov yo'q |
| Restoranlar telefon qo'ng'irog'iga sekin javob beradi | O'rta | Pilotda faqat 2-3 ishonchli, oldindan kelishilgan restoran; operator-javob emas endi restoran-javob real vaqtda telefonda hal bo'ladi |
| Sovuq start (mijoz ko'rmaydi) | O'rta | Launch-push (drvrank hisobot patterni), Uy'dagi yangi tile ko'rinadi |
| Naqd to'lovda kelishmovchilik | O'rta | V1: restoran/operator o'z riski (hozir ham telefon-buyurtmada shu bor) |
| Tabbar 5+ tab siqilishi | Past | 885b58c saboqdagi label-o'lchov tekshiruvi W1 DoD'da |
| Ekonomika | NOL | Tanga/CoinTxn/kas API'ga umuman teginilmaydi |

## 9. Egadan kutilayotgan qarorlar

1. Concierge-V1 (§0) ma'qulmi — boshida to'liq qo'lda, avtomatika V2? (tavsiya: HA)
2. ~~Ish-vaqti chegarasi~~ — HAL BO'LDI: operator 24/7, cheklov yo'q (faqat restoran o'z workHours'i bilan cheklaydi).
3. Operator kim bo'ladi — ega o'zi, yoki admin-huquqli boshqa xodim?
4. R5 QABUL mezonlari (≥10 buyurtma, 3-daq operator-javob, 3-soniya UI testi) ma'qulmi?
5. Pilot uchun 5-8 restoran bilan gaplashish — ega o'zi qiladimi?
