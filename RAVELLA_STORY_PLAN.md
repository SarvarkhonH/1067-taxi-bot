# 📹 RAVELLA HIKOYA (Story) — REJA

> Ega so'radi (2026-07-28): «story yuklashni ham qo'shamiz». Bu hujjat — **reja**, kod yozilmagan.
> Tasdiqlashingizdan keyin boshlanadi (CLAUDE.md R2: DoD kod yozishdan OLDIN yoziladi).

---

## §0. Nima quriladi (bir paragraf)

Ravella kun davomida ish jarayonini yoki tayyor bezakni **24 soatlik hikoya** qilib qo'yadi:
botga bitta rasm/video yuboradi — vaqtincha lenta paydo bo'ladi. Mijoz Ravella ekranida
logotip atrofida **amber halqa** ko'radi; bosganda to'liq ekranli ko'ruvchi ochiladi, tepada
progress-chiziqlar, chapga-o'ngga bosib o'tiladi, 24 soatdan keyin o'zi yo'qoladi. Maqsad —
katalog "muzey" bo'lib qolmasin: hikoya har kuni yangilanadigan tirik qatlam, u odamni qaytib
kelishga majbur qiladi va «bular ishlab turibdi» degan ishonch beradi.

## §1. Nega noldan yozilmaydi

Kodbazada **do'konlar uchun hikoya tizimi allaqachon ishlab turibdi** (`shopstory` flag):
`ShopStory` + `ShopStoryView` jadvallari, 24 soatlik `expiresAt`, ko'rilgan-holat halqasi
(`listStoryTray`), `/hikoya` bot-oqimi, va `shop.tsx` dagi to'liq ekranli `StoryViewer`
(progress-chiziqlar, chapga-o'ngga o'tish). Ya'ni **naqsh isbotlangan** — Ravella uchun
qaytadan o'ylash shart emas, faqat ulash kerak.

**Uchta yo'l bor edi, tanlangani — 2-si:**

| Yo'l | Nima qilinadi | Nega tanlanmadi / tanlandi |
|---|---|---|
| 1. Ravella'ga soxta MarketShop ochish | Mavjud `ShopStory` shundoq ishlaydi | ❌ Ravella do'kon emas — u bozor ro'yxatiga, qidiruvga, sotuvchi-hisobotlariga sizib chiqadi |
| **2. `RavellaStory` — alohida kichik jadval** | ShopStory'ning aynan nusxasi, `itemId` bilan bog'liq emas | ✅ Additiv, jonli do'kon-tizimiga **umuman tegmaydi**, xatosi ham faqat Ravella'da qoladi |
| 3. `ShopStory`ga `ownerKind/ownerId` qo'shish | Eng "toza" model | ❌ Jonli, ishlab turgan jadvalni o'zgartirish — shopstory oqimini sindirish xavfi, foydasi esa faqat nazariy |

## §2. Ma'lumot modeli (1 ta yangi jadval + 1 ta ko'rish-jurnali)

```prisma
model RavellaStory {
  id          Int      @id @default(autoincrement())
  photoFileId String?  // Telegram file_id — hamkor botga yuborganda
  videoFileId String?  // video ham (ShopStory bilan bir xil)
  caption     String?  // ixtiyoriy izoh, ≤200 belgi
  createdAt   DateTime @default(now())
  expiresAt   DateTime // createdAt + 24 soat
  viewCount   Int      @default(0)

  @@index([expiresAt])
}

model RavellaStoryView {
  id       Int      @id @default(autoincrement())
  storyId  Int
  memberId Int
  viewedAt DateTime @default(now())

  @@unique([storyId, memberId]) // bir a'zo — bir ko'rish (halqa holati shundan)
}
```

**Eskirish:** hech qanday yangi poller YO'Q. O'qishda `expiresAt > now` filtri — muddati o'tgani
shu zahoti ko'rinmay qoladi. Jismoniy o'chirish mavjud 15-daqiqalik tick'dagi marker-tozalash
ishiga qo'shiladi (7 kundan eski satrlar), ya'ni jadval cheksiz o'smaydi.

## §3. Hamkor tomoni (bot) — 3 ta bosish

`/ravella` → **📹 Hikoya joylash**
1. «Rasm yoki video yuboring» (sessiya-gated, `/bekor_ravella` bilan bekor)
2. Yuboriladi → «✅ Hikoya joylandi, 24 soat ko'rinadi» + ega xabar oladi
3. Ixtiyoriy: izoh so'raladi («Kerak bo'lmasa `-`»)

Qo'shimcha: **📹 Hikoyalarim** — faol hikoyalar ro'yxati, har birida `🗑 O'chirish` va
`👁 N ko'rildi`. Rasm/video `file_id` bilan saqlanadi (bayt yuklanmaydi — hozirgi karusel
bilan bir xil quvur).

⚠️ **Tuzoq (uch marta takrorlangan):** `bot.ts` dagi `:photo` handleri admin/haydovchi bo'lmagan
odamning rasmini `next()`siz yutadi; **video** uchun ham xuddi shu tekshiruv kerak bo'ladi —
`isAwaitingRavellaPhoto` ga `story` qadami qo'shiladi va **`:video` uchun ham** chetlab o'tuvchi
yoziladi (hozir video faqat market.ts'da ushlangan).

## §4. Mijoz tomoni

**Halqa (kirish nuqtasi).** Ravella ekranining tepasida, logotip o'rnida: faol hikoya bo'lsa
belgi atrofida **amber gradient halqa** paydo bo'ladi (ko'rilgan bo'lsa — kulrang). Halqa
faqat hikoya BOR bo'lganda chiziladi — bo'sh halqa bosilib, hech nima ochilmasligi eng yomon
holat. Bosilganda ko'ruvchi ochiladi.

**Ko'ruvchi (viewer).** `shop.tsx` dagi `StoryViewer` ANIQ shu vazifani bajaradi:
to'liq ekran, tepada segment-progress, chap/o'ng yarmiga bosib o'tish, 5s (rasm) yoki video
davomiyligi, tashqariga bosilsa yopiladi. **Reja: uni `design/StoryViewer.tsx` ga ko'chirish**
va ikkala ekran (do'kon + Ravella) shundan foydalanishi. Ko'chirish `shop.tsx` ga tegadi —
u faylda boshqa sessiya ishlayotgan bo'lishi mumkin, shuning uchun ko'chirish **alohida,
birinchi qadam** qilinadi va o'sha commitda do'kon-hikoyasi qayta sinaladi (regressiya bo'lmasin).
Agar to'qnashuv xavfi yuqori bo'lsa — zaxira yo'l: Ravella uchun slim nusxa (≈80 qator),
keyinroq birlashtiriladi. Qaysi biri — ko'chirish paytida ko'rinadi, egaga aytiladi.

**Ommaviy sayt.** Xuddi shu halqa va ko'ruvchi. Sayt autentifikatsiyasiz bo'lgani uchun
"ko'rilgan" holati saqlanmaydi (halqa har doim rangli) — bu to'g'ri: hikoya ommaviy kontent,
`ko'rildi` esa shaxsiy holat.

## §5. Server

- `services/ravellaStoryService.ts` (yangi, ~120 qator): `createRavellaStory`,
  `listActiveRavellaStories(memberId?)`, `markRavellaStoryViewed`, `deleteRavellaStory`,
  `cleanupExpiredRavellaStories`.
- Route'lar: `GET /api/ravella/stories` (allowGuest — sayt uchun ham),
  `POST /api/ravella/stories/:id/viewed` (requireUser), `GET /api/ravella/story-photo/:id`
  (mavjud rasm-quvuri bilan bir xil, 302 → Telegram CDN, `max-age=120`).
- `getRavellaCatalog` javobiga `hasStory: boolean` + `storySeen: boolean` qo'shiladi —
  halqa uchun **bitta qo'shimcha so'rov ham kerak bo'lmaydi**.
- Flag: alohida `ravellastory` (DEFAULT_OFF). Sabab: hikoya — Ravella'ning eng ko'rinadigan,
  eng "shovqinli" qismi; uni butun Ravella'ni o'chirmasdan to'xtata olish kerak.

## §6. Pul va xavfsizlik

- **Pul mexanikasi YO'Q.** Hikoya na tanga beradi, na sarflaydi — `CoinTxn` yo'llariga umuman
  tegmaydi. Bu tiketda pul-testi ham kerak emas.
- Joylash huquqi faqat `ravellaChats()` (hamkorlar + ega) — buyurtma tugmalari bilan bir xil
  ro'yxat, ya'ni ruxsat bitta joydan boshqariladi.
- Izoh matni HTML-escape qilinadi (ko'ruvchi ham, bot-kartasi ham).
- ⚠️ **Kontent nazorati:** hikoya darhol ommaga chiqadi. Egaga har hikoyadan nusxa yuboriladi
  (`🗑 O'chirish` tugmasi bilan) — noto'g'ri kontent bir bosishda olib tashlanadi. Oldindan
  moderatsiya (ega tasdiqlagach chiqadi) — **egadan so'raladigan qaror**, §8-bandda.

## §7. Fazalar va qabul mezoni (har biri isbot bilan)

| Faza | Nima | Qabul mezoni |
|---|---|---|
| **S0** | `StoryViewer` ni umumiy komponentga ko'chirish | Do'kon hikoyasi AVVALGIDEK ishlaydi (brauzerda ochib isbot) — regressiya yo'q |
| **S1** | Sxema (2 jadval) + flag + servis | `migrate diff` = faqat 2 CreateTable; typecheck 4/4 yashil |
| **S2** | Bot: joylash + hikoyalarim + o'chirish | Ega/hamkor rasm yuboradi → 24 soatlik satr yaratiladi (DB isboti) |
| **S3** | Mijoz: halqa + ko'ruvchi (mini app + sayt) | Halqa faqat hikoya bo'lganda; ko'ruvchi ochiladi, progress yuradi, 24 soatdan keyin yo'qoladi (`expiresAt` ni qo'lda o'tkazib isbotlanadi) |
| **S4** | Tozalash mavjud tick'ga ulanadi | 7 kundan eski satrlar o'chadi, yangi poller YO'Q (kod isboti) |
| **S5** | **Ega QABUL** → `setFlag.ts ravellastory on` | Ega telefonida ko'radi va «QABUL» deydi |

**Baho:** S0-S4 taxminan yarim kunlik ish. Eng katta noaniqlik — S0 (`shop.tsx` bilan
to'qnashuv), shuning uchun u birinchi va alohida qilinadi.

## §8. Egadan javob kutiladigan 2 ta savol

1. **Moderatsiya:** hikoya darhol chiqsinmi (tez, lekin nazoratsiz), yoki siz tasdiqlagandan
   keyinmi (xavfsiz, lekin sekin — siz uxlayotganda hikoya chiqmay qoladi)?
   *Tavsiyam: darhol chiqsin + sizga nusxa «🗑 O'chirish» tugmasi bilan. Ravella o'z brendini
   buzmaydi, tezlik esa hikoyaning butun mohiyati.*
2. **Video kerakmi?** Faqat rasm bo'lsa ish 2 barobar kam (video hajmi, davomiyligi, avto-play
   siyosati). *Tavsiyam: birinchi bosqichda faqat rasm; video S6 sifatida keyin.*
