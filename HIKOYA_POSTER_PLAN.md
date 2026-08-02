# 📸 HIKOYA-POSTER — reja + dizayn brifi

**Maqsad:** mijoz o'ziga tegishli chiroyli posterni yuklab oladi → Instagram/Telegram hikoyasiga
qo'yadi → havolasini bizga yuboradi → admin tekshiradi → 24 soat ichida ball tushadi.

Bu bir vaqtning o'zida **uchta** ish qiladi:
1. Mijozga ball (motivatsiya)
2. Bizga bepul reklama (poster brendlangan)
3. Yangi mijoz (posterda taklif-QR bor — skanerlagan odam o'sha mijozga biriktiriladi)

---

## 0. Hozirgi holat (tekshirilgan)

| Element | Holat |
|---|---|
| `oyinStoryProofBall` knobi (def 100) | ✅ mavjud — lekin **hech qayerda ishlatilmaydi** (o'lik knob) |
| `shareStory()` (Telegram Bot API 7.8) | ✅ mavjud — lekin **statik** `/invite-poster.jpg` ulashadi, shaxsiylashtirilmagan |
| `storyshare` bayrog'i | ✅ mavjud, DEFAULT_OFF |
| Serverda rasm generatsiya | ❌ **yo'q** — faqat `qrcode` (QR PNG). `sharp`/`canvas`/`satori` yo'q |
| Moderatsiya navbati | ❌ yo'q |

**Asosiy texnik qaror:** poster **brauzerda** (miniapp `<canvas>`) chiziladi, serverda emas.
Sabab: serverga rasm-kutubxonasi qo'shish = yangi native bog'liqlik + VPS'da build muammosi.
Canvas'da chizish esa bepul, bir zumda va oflayn ishlaydi. Mijoz PNG'ni **yuklab oladi**
(aynan QR kod naqshidek) — bu Instagram uchun ham, Telegram uchun ham ishlaydi.

> Telegram'ning "bir bosishda hikoyaga" (`shareToStory`) usuli rasm uchun **URL** talab qiladi,
> ya'ni serverda render kerak. **v1 doirasidan tashqarida.** Yuklab-olish yo'li ikkala
> platformada ham ishlaydi va egaviy talab aynan shu edi ("xudi qr koda qilgandek yuklab olsin").

---

## 1. Mijoz oqimi (5 qadam)

1. **Chaqiruv.** O'yin ekranida karta: «📸 Hikoya qo'y — **+100 ball**» (knobdan o'qiladi).
   Mavsumda **3 martagacha**. Nechta qolganini karta o'zi ko'rsatadi ("2 marta qoldi").
2. **Poster.** Bosilganda poster chiziladi va ko'rsatiladi. Mijoz:
   - **ismini tahrirlashi** mumkin (default — Telegram ismi; xohlasa boshqa nom)
   - **sovrinni tanlashi** mumkin (default — maqsad qilgan/eng qimmat sovrin)
3. **Yuklab olish.** «⬇️ Rasmni yuklab olish» → PNG telefon galereyasiga tushadi.
4. **Hikoyaga qo'yadi** (Instagram yoki Telegram — o'zi biladi).
5. **Havolani yuboradi.** O'sha ekranda maydon: «Hikoya havolasini joylashtiring».
   Yuborilgach holat: «⏳ Tekshiruvda — 24 soat ichida javob beramiz».

## 2. Admin oqimi

Panel → **⚡ Amallar** yonida yangi karta yoki O'yin tabida bo'lim: **📸 Hikoya-isbotlar**.

| Ustun | Nima |
|---|---|
| Kim | ism + memberId |
| Havola | bosiladigan — admin ochib ko'radi |
| Yuborilgan | vaqt + "N soat oldin" (24 soatdan oshgani QIZIL) |
| Tarix | shu mijoz mavsumda nechta tasdiqlangan |
| Amal | ✅ Tasdiqlash · ❌ Rad etish (sabab bilan) |

- Tasdiqlanganda: ball darhol tushadi + mijozga bot xabari («📸 Hikoyangiz tasdiqlandi — +100 ball!»).
- Rad etilganda: sabab bilan xabar («havola ochilmadi» / «hikoya topilmadi» / «boshqa brend»).
- **24 soat SLA:** kunlik tickda javobsiz qolgan arizalar bo'lsa egaga eslatma
  (`alertAdmins`, mavjud funksiya) — «3 ta hikoya-isbot 24 soatdan beri kutmoqda».

## 3. Ma'lumot (yangi Prisma model YO'Q)

`AppState` kaliti: **`oyin:story:<memberId>`**
```json
{ "items": [
  { "id": "s1-1754132000", "url": "https://instagram.com/stories/...",
    "at": "2026-08-02T14:00:00Z", "status": "pending|approved|rejected",
    "reviewedAt": null, "reason": null }
] }
```

**Ball qanday qo'shiladi:** `computeBallMap()` ga sakkizinchi manba sifatida
(`oyin:story:*` prefiks-skani, mavjud olti AppState skani yonida — qo'shimcha so'rov +1).
`status === "approved"` VA `at` mavsum oynasida bo'lganlar sanaladi ×`oyinStoryProofBall`.
Ya'ni ball jonli hisoblanadi, boshqa manbalar bilan bir xil — alohida grant yozuvi yo'q.

`OyinBallBreakdown` ga yangi maydon: `story: number`.

## 4. Anti-abuz (pul bo'lmasa ham, ball → tanga aylanadi)

| Qoida | Sabab |
|---|---|
| Mavsumda **3 ta** tasdiqlangan isbot | Cheksiz bo'lsa bitta odam ballni yeb qo'yadi |
| Bir vaqtda **1 ta** kutilayotgan ariza | Navbatni spam bilan to'ldirmasin |
| Havola shakli tekshiriladi (`instagram.com` / `t.me` / `facebook.com`) | Tasodifiy matn yuborilmasin |
| **Admin ko'zi majburiy** — avtomatik tasdiq YO'Q | Havola haqiqiyligini faqat odam ko'radi |
| Bir xil havola ikkinchi marta qabul qilinmaydi | Bitta hikoyani qayta topshirish |
| Rad etilgan ariza limitdan sanalmaydi | Adolat — xato qilgan yana urinadi |

## 5. Fayllar

**Yangi:**
- `packages/miniapp/src/design/poster.ts` — canvas'da poster chizish (yagona funksiya, testlanadigan)
- `packages/server/src/services/oyinStory.ts` — arizalar CRUD + limit tekshiruvi

**O'zgaradi:**
- `packages/shared/src/oyin.ts` — `OyinStoryItem`, `OyinStoryStatus`, breakdown'ga `story`
- `packages/server/src/services/oyinService.ts` — `computeBallMap`ga 8-manba
- `packages/server/src/api/server.ts` — `POST /api/oyin/story` (mijoz), `GET/POST /api/admin/oyin/stories`
- `packages/miniapp/src/oyin.tsx` — poster kartasi + yuklab olish + havola maydoni
- `packages/admin/src/App.tsx` — moderatsiya jadvali
- `packages/server/src/index.ts` — 24 soat SLA eslatmasi (mavjud tickka qo'shiladi, yangi poller YO'Q)

---

# 🎨 DIZAYN BRIFI — poster

## Texnik ramka
- **1080×1920** (9:16), PNG. Canvas'da 2× DPR bilan chiziladi (matn o'tkir chiqsin).
- Barcha rang `--oyk-*` tokenlaridan olinadi — poster o'yin ekrani bilan **bitta til**da gapiradi.
- Shrift: ilovaning o'zi ishlatadigan tizim shrifti (yuklanadigan shrift YO'Q — kechikish bo'lmasin).
- Sovrin rasmi `crossOrigin="anonymous"` bilan yuklanadi; yuklanmasa — emoji + rangli fon
  (bo'sh kulrang kvadrat TAQIQ, `DIZAYN_QOIDALARI.md` #10).

## Kompozitsiya (yuqoridan pastga)

```
┌─────────────────────────────┐
│  BirJoy                🎮   │  ← brend qatori (kichik, tepada)
│                             │
│   ┌───────────────────┐     │
│   │                   │     │
│   │   SOVRIN RASMI    │     │  ← 1080 enidan ~86%, burchagi 48px
│   │                   │     │
│   └───────────────────┘     │
│                             │
│   Air Fryer                 │  ← sovrin nomi, 72px, 900 qalinlik
│   ─────────                 │
│                             │
│   MEN 5 TA CHIPTA OLDIM     │  ← ASOSIY xabar, 96px, oltin gradient
│                             │
│   Sarvar · BirJoy o'yini    │  ← ism (tahrirlanadi)
│                             │
│   ┌──────┐                  │
│   │  QR  │  Sen ham qo'shil │  ← taklif-QR + chaqiriq
│   └──────┘  Skanerla 👆     │
│                             │
│  🗓 Tiraj: 14-sentabr       │  ← muddat — shoshilish
└─────────────────────────────┘
```

## Mazmun qoidalari

| Element | Qoida |
|---|---|
| Asosiy xabar | Faqat **bitta** jumla, 5 so'zdan oshmaydi. Uchta variantdan biri (pastda) |
| Ism | Mijoz tahrirlaydi. Bo'sh qoldirsa — ismsiz variant chiziladi (majburiy emas) |
| QR | Mijozning **o'z taklif havolasi** — skanerlagan odam unga biriktiriladi. Bu posterni ham reklama, ham taklif-quroliga aylantiradi |
| Sana | Mavsum tugash sanasi, "Tiraj: 14-sentabr" ko'rinishida |
| Narx/ball | **Ko'rsatilmaydi** — tashqi odam uchun ma'nosiz va "o'yin murakkab" hissini beradi |

## Poster matni — admin sozlaydi, mijoz tahrirlaydi (ega tuzatishi 2026-08-02)

Matn kodda QATTIQ YOZILMAYDI. Sovrin-katalog bilan **aynan bir xil naqsh**: admin panelda
ro'yxat, AppState'da saqlanadi (`oyin:postertext`), deploysiz o'zgaradi.

**Admin panelda:** "📸 Poster matnlari" kartasi — qo'shish / tahrirlash / o'chirish / yashirish.
Har qatorda o'rin-egallar ishlatiladi:

| O'rin-egal | Nimaga almashadi |
|---|---|
| `{ism}` | Mijoz ismi |
| `{chipta}` | Shu mavsumdagi chipta soni |
| `{sovrin}` | Tanlangan sovrin nomi |

Boshlang'ich uchta qator (admin keyin o'zgartiradi):
1. `Men {chipta} ta chipta oldim`
2. `Sen ham yutib ol`
3. `{sovrin} meniki bo'ladi`

**Mijoz tomonida:** tayyor matnlardan birini tanlaydi **yoki** o'z matnini yozadi
(maydon ochiq, 40 belgigacha). Ya'ni admin yo'nalish beradi, mijoz esa o'z ovozida gapiradi —
begona odamga "shablon reklama" emas, tirik odam yozganday ko'rinadi.

**Cheklov:** mijoz matni ham 40 belgi, qator-uzilish yo'q, havola/@ belgisi yo'q (poster o'z
QR'ini ko'taradi, boshqa reklama joylashtirilmasin).

## Uslub

- **Yorug'** — o'yin ekrani bilan bir xil (oq havo, qora siyoh, oltin aksent).
  Instagram tasmasida qorong'i posterlar ko'p; oq poster ajralib turadi.
- Sovrin rasmi — **qahramon**. Ekranning ~40% ini egallaydi.
- Oltin faqat **bitta** joyda: asosiy xabarda. Hamma joyda oltin = arzon ko'rinadi.
- Soya yumshoq (`0 8px 40px rgba(20,26,46,.10)`), chegara-chiziq yo'q.
- Bo'sh joy ko'p — siqilgan poster «reklama», havodor poster «brend».

## 3-soniya testi (poster uchun)
Tasmada ko'rgan begona odam 3 soniyada bilishi kerak:
1. **Bu nima?** — BirJoy'da sovrin o'ynalyapti
2. **Menga nima?** — men ham yutishim mumkin
3. **Nima qilaman?** — QR'ni skanerlayman

---

## Bosqichlar

- **P1** — poster generatori + yuklab olish (mijoz ko'radi, ball hali yo'q)
- **P2** — ariza yuborish + admin moderatsiya navbati + ball
- **P3** — 24 soat SLA eslatmasi + rad-etish sabablari

P1 alohida ham qiymatli: mijoz posterni yuklab, o'zi ulashaveradi (ballsiz ham).
