# 🎨 BirJoy — DIZAYN QOIDALARI (UX/UI)

Bu qoidalar **mavhum maslahat emas**. Har biri jonli mahsulotda topilgan ANIQ xatodan chiqqan —
shuning uchun har qoidada "qaysi bug" ustuni bor. Yangi ekran yozayotgan har agent shu ro'yxatni
DoD sifatida ishlatadi.

`CLAUDE.md` §DIZAYN QOIDALARI shu faylga havola qiladi.

---

## A. Ramka va navigatsiya

| # | Qoida | Kelib chiqqan xato (2026-08-02) |
|---|---|---|
| 1 | **Bitta ekran — bitta pastki menyu.** Ekranning o'z tab-qatori bo'lsa, ilovaning umumiy menyusi o'sha ekranda chizilmaydi. | O'yin ekranida ilovaning 4 tugmasi va o'yinning 3 tabi ustma-ust chiqib, pastda ikki qator menyu turardi. |
| 2 | **Bo'sh xrom bo'lmaydi.** Tepa panel yo nomli, yo umuman chizilmaydi. Nomsiz panel joy egallaydi va ekranni kichraytiradi. | O'yin ekrani ustida sarlavhasiz bo'sh panel ~52px yeb turardi (`topbar` da `oyin` uchun nom yo'q edi). |
| 3 | **Yangi tab HECH QACHON qo'shilmaydi.** Pastki bar ≤5 element. Yangi bo'lim rail yoki "Barchasi" hub'iga tushadi. | `UY_REDESIGN_DOD.md` §3.4 IA qonuni. |
| 4 | **Har bo'limga kamida IKKI yo'l.** Bitta kartadan boshqa kirish yo'li bo'lmasa, undan pastga o'tgan odam qaytib kira olmaydi. | O'yinga faqat uy-hero'si orqali kirilardi — rail'da ham, hub'da ham yo'q edi. |

## B. Ma'lumot va haqiqat

| # | Qoida | Kelib chiqqan xato |
|---|---|---|
| 5 | **`NaN` hech qachon ekranga chiqmaydi.** Har `Date.parse`, har bo'linish qo'riqlanadi. `Math.max(0, NaN)` → `NaN`, `0` EMAS. | Mavsum sanasi `null` bo'lganda uy kartasi "⏳ NaN kun qoldi" chizardi. |
| 6 | **Sanoq FAZANI aytadi, quruq son emas.** "N kun" — nimagacha? Boshlanishigami, tugashigami? | Karta "🔥 MAVSUM OCHIQ · ⏳ 43 kun qoldi" derdi — mavsum hali boshlanmagan edi, 43 kun esa tugashigacha. Ikkalasi ham yolg'on. |
| 7 | **Prototip elementi real ma'lumotsiz jo'natilmaydi.** Ma'lumot yo'q bo'lsa — element ham yo'q. Soxta son ko'rsatishdan ko'ra bo'sh joy yaxshi. | "Bugungi maqsad" halqasi prototipda bor edi, backendi yo'q edi — to'g'ri qaror uni OLIB TASHLASH bo'ldi, keyin real ma'lumot bilan qaytarildi. |
| 8 | **Ma'lumot ko'rsatgan joy uni O'ZI yuklaydi.** Boshqa ekran ochilishiga bog'liq bo'lgan karta hech qachon ko'rinmaydi. | Bosh ekrandagi "do'stingizga rahmat" kartasi Jamoam tabi ochilmaguncha ma'lumotsiz turardi — ya'ni amalda hech qachon chiqmasdi. |
| 9 | **Va'da qilingan pul/ball REAL berilishi shart.** Push "+30 ball qo'shildi" desa, balansda ham +30 bo'lishi kerak. | Do'st-safari push'i mavsumdan tashqarida ham yuborilardi: bot ball va'da qilardi, balans 0 turardi. |

## C. Ko'rinish

| # | Qoida | Kelib chiqqan xato |
|---|---|---|
| 10 | **Jismoniy narsa = real rasm.** Sovrin, mahsulot, taom — emoji faqat *fallback*. Fallback ham **rangli fon + katta emoji**; bo'sh kulrang kvadrat TAQIQ. | "sovg'a rasmlari kichik va chiroyli emas" (`XIZMATLAR_PLAN.md` §5.5 bilan bir xil qoida). |
| 11 | **Skeleton — real layoutning nusxasi**, uch xil to'rtburchak emas. Balandligi real kartaga TENG bo'lishi shart. | "sahifa ochilishi xunuk"; hero skeletoni 216px, real karta 267px → yuklanganda sahifa sakrardi. |
| 12 | **Uzun matn kesilmaydi, 2 qatorga o'tadi** (`-webkit-line-clamp: 2`). | Uzun sovrin nomi bir qatorda o'rtasidan kesilardi. |
| 13 | **O'yin ekranlari ilovaning mavzusidan MUSTAQIL** — o'z doimiy palitrasida (hozir: yorug'). Ilova mavzusi o'zgarsa o'yin o'zgarmaydi. Bu ongli qaror, "hali qilinmagan ish" emas. | Avval qorong'i edi; ega "light tursin va yengil chaqmoqdek bo'lsin" dedi (2026-08-02) va ekran yorug'ga o'tkazildi. Qoida shunga moslandi — **mustaqillik** o'zgarmadi, palitra o'zgardi. |

## D. Javob va harakat

| # | Qoida | Kelib chiqqan xato |
|---|---|---|
| 14 | **Yozuv harakatni va'da qilsa — tugma bo'lishi SHART.** | "unga rahmat de 🤝" deb yozilgan edi, bosadigan joy yo'q edi. |
| 15 | **Har bosishda <100ms vizual javob.** Server javobini kutmasdan tugma holatini o'zgartirish; xato bo'lsa qaytarish. | "Saqlash" tugmasi jim ishlardi — bosilgani bilinmasdi. |
| 16 | **Animatsiya faqat `transform`/`opacity`**, `prefers-reduced-motion` hurmat qilinadi. (Istisno: SVG `stroke-dashoffset` — u ham reduced-motion'da o'chadi.) | Mavjud qoida (CLAUDE.md). |
| 17 | **Faqat `design/tokens` dan rang/o'lcham.** Inline stil = xato. | Mavjud qoida (CLAUDE.md). |

## E. Har ekran uchun yakuniy tekshiruv

**3 soniya testi** — ekranni ochgan begona odam 3 soniyada javob topishi kerak:
1. **Bu nima?**
2. **Menga nima?**
3. **Nima bosaman?**

Uchtasidan biriga javob yo'q bo'lsa — ekran tayyor emas.

---

## Boshqa hujjatlardagi dizayn qoidalari (takrorlanmasin)

| Hujjat | Nimani qamraydi |
|---|---|
| `UY_REDESIGN_DOD.md` §3.1–3.4 | Uy tuzilishi, Liquid Glass tabbar, mavzu tizimi shartnomasi, IA qonuni (bar ≤5) |
| `KOSON_DIZAYN_PROMPT_1.md` | O'yin kartasining emotsional maqsadi va anti-naqshlari |
| `XIZMATLAR_PLAN.md` §5.5 | Katalog/karta anatomiyasi, rasmsiz holat qoidasi |
| `ELONLAR_PLAN.md` §4.1 | Zona-identiteti doktrinasi (har bo'lim o'z shaxsiyati) |
| `RESTORAN_PLAN.md` §5 | O'lchanadigan "chiroyli" mezonlari (birinchi chizishda ≥3 karta) |
| `RAVELLA_PLAN.md` §6 | Hamkor-brendni ilova ichida ko'rsatish qoidalari |
| `MUKAMMAL_DASTUR.md` §6 | "Yashirish ≠ almashtirish" — DoD nima o'rnini bosganini aytadi |
