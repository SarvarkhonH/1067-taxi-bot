# YANGI REJA — chalalarni yopish va oldinga yurish

**Sana:** 2026-09-10 · **Asos:** uchta mustaqil "va'da vs haqiqat" auditi

Bu hujjat tarqoq rejalarning **o'rnini bosadi**. Eskilari tarix sifatida qoladi.

---

# 1. HALOL HOLAT — uch audit raqami

| Hujjat to'plami | Bajarilgan | Nima asosida |
|---|---|---|
| MASTER + 10X_PLAN + QAROR | **35%** (qat'iy hisobda **23%**) | 113 aniq va'dadan: 26 bajarilgan · 23 qisman · 8 yozilgan-ulanmagan · **56 yo'q** |
| TELEFON + ADMIN_JAVOB + ADMIN_QOSHIMCHALAR | **~23%** | 51 va'dadan 11.5 |
| KAS_PARITET | **~40%** · BirJoySource DoD **~30%** | 27 metoddan **8 ishlaydi, 19 stub** |

**Shakl raqamdan muhimroq:** bitta blok haqiqatan tugagan (**F1-core P0 — 6/6**), qolgani to'xtagan.
Haydovchi ilovasi 4/17 · konsol signallari 1/5 · telefoniya 0 · ratsiya 0/4 · firibgarlik 1/8 ·
**TANGA 0%**.

⚠️ **GARAJ_PLAN unutilmagan** — u taksi emas, o'yin edi; qurilgan, jonli ishlagan, siz
2026-07-02 da **bekor qilgansiz**. Reja hujjati ataylab qoldirilgan.

---

# 2. NEGA CHALA QOLDI — asl sabab

`PROGRESS.md` da bu dastur haqida **bitta ham qator yo'q**. CLAUDE.md ning R7 qoidasi
("PROGRESS.md = LITERAL haqiqat") qo'llanilmagan. Ya'ni **nima qolgani hech qayerda
yozilmagan** — shuning uchun har sessiya yangidan boshlagandek tuyuladi.

👉 **Bu mening aybim.** Har sessiya oxirida PROGRESS.md yangilanishi kerak edi.
Shu rejaning 0-bandi — buni tuzatish.

---

# 3. ⛔ TO'LQIN 0 — YO'QOTISH XAVFI (hamma narsadan oldin)

Bular funksiya emas. Bular — **bugungacha qilingan hamma ish yo'qolib ketishi mumkin** degani.

| # | Xavf | Holat | Kim |
|---|------|-------|-----|
| 0.1 | **B'ning 36 commit'i faqat bitta noutbukda** — origin'ga oxirgi push **2026-05-01**, zaxira nusxa (`git bundle`) yo'q | disk buzilsa **hamma narsa ketadi** | **men** (bundle) + **siz** (push qarori) |
| 0.2 | **GitHub tokeni ochiq matnda** — `1067-taxi/.git/config` | chatda ham, diskda ham | **siz** (revoke + yangilash) |
| 0.3 | **B'ning VPS deploy quvuri yo'q** — `deploy.yml` o'lik Render'ga qaraydi; server qo'lda `nohup`, **reboot'da o'ladi** | tasodifiy qayta yuklanish = xizmat to'xtaydi | **men** (systemd unit) |
| 0.4 | **PROGRESS.md yangilanmagan** | keyingi sessiya yana yo'qotadi | **men** |

⚠️ CLAUDE.md aytadi: A'ning deploy'i `ci.yml` ichida — bu **to'g'ri**. `deploy.yml` — **B'niki**
va u eskirgan. Chalkashmang.

---

# 4. 💰 TO'LQIN 1 — PUL BUTUNLIGI

Bular **pul yo'qotish yoki ikki marta berish** xavfi. Funksiyadan oldin.

| # | Muammo | Isbot | Ish |
|---|--------|-------|-----|
| 1.1 | **B parallel valyuta chiqarishda davom etyapti** — har safar tugaganda mijozga 5, haydovchiga 10 "ball"; **clamp yo'q, CoinTxn yo'q, kill-switch yo'q**. MASTER §5.6 uni **to'xtatishni buyurgan** | `orders.service.ts:264` → `runLoyaltyHooks`; `clients.service.ts:130-134` | kill-switch qo'yish + qaror: o'chiriladimi yoki tangaga ulanadimi |
| 1.2 | **id-space to'qnashuvi** — B'ning kichik order id'lari kas id'lari bilan to'qnashadi → **CoinTxn idempotentligi buziladi** (ikki marta to'lash) | `900_000_000+id` hiylasi tashlab ketilgan branchda qolgan | ko'chirish |
| 1.3 | **`KAS_MODE=birjoy` bugun bosilsa jonli tizim buziladi** — 20 faylda **49 chaqiruv** rad etiladi (sweep, coinService, driverDebtService) | 19 stub metod | bosilmasin; 5c tugaguncha |
| 1.4 | **Mock-GPS bloki yo'q** | qidiruv 0 natija | **har qanday pul-rag'batdan OLDIN** |

---

# 5. 📊 TO'LQIN 2 — O'LCHOV (busiz qolgani taxmin)

| # | Ish | Holat |
|---|-----|-------|
| 2.1 | **Bosilgan rad ≠ jim taymer** | ✅ **bugun tuzatildi** — endi ajratib yoziladi |
| 2.2 | Hodisa oqimi: `offer_sent → accept/reject/timeout → assigned → completed/cancelled` (sabab bilan) | qisman bor (`dispatch_offer_logs`), panel yo'q |
| 2.3 | KPI paneli: tayinlash vaqti median/p95 · rad tarkibi · bekor foizi · mashina/soat | yo'q |

**7 kun ma'lumot** yig'ilgandan keyin ma'lum bo'ladi: 21.5% radning qanchasi
"haydovchi ko'rmadi" (→ FCM/overlay), qanchasi "haydovchi xohlamadi" (→ adolat/pul).
**Shu javob keyingi to'lqinlar tartibini belgilaydi.**

---

# 6. 🚕 TO'LQIN 3 — RADGA ZARBA

| # | Ish | Bog'liqlik |
|---|-----|-----------|
| 3.1 | **FCM ikkala tomon** — server chaqiradi, ilova qabul qila olmaydi (`google-services.json` yo'q) | **Firebase — sizdan** |
| 3.2 | **Broadcast dispatch** — 75s → ~15s | sizning qaroringiz |
| 3.3 | **Overlay taklif** — ekran yonadi + ovoz | FCM |
| 3.4 | **Adolat** — uzoq podacha jazosiz skip, kartada "+N/−M" | — |
| 3.5 | **KOSON TILI** — fuzzy manzil (kod A'da tayyor, B'ga ko'chiriladi) | — |

---

# 7. 🎧 TO'LQIN 4 — OPERATOR VA KUZATUV

| # | Ish | Holat |
|---|-----|-------|
| 4.1 | **CTI zanjiri** | ✅ **bugun 2 bo'g'in ulandi** (popup→ekran uzatmasi, raqam normalizatsiyasi). Qolgani: **`/ring` ni chaqiradigan narsa** (operator-helper APK yoki SIP hook) |
| 4.2 | Qo'ng'iroq holati (`answered`/`ended`) paneldan | `X-Device-Token` talab qiladi, admin JWT bilan bo'lmaydi |
| 4.3 | **Jonli xarita** | ✅ **allaqachon qurilgan** (Leaflet+OSM, tekin). Bo'sh edi — GPS oqmasdi, bugun tuzatildi. **Tekshirish kerak** |
| 4.4 | **Ratsiya (PTT)** — klip asosida, WebRTC emas | FCM |
| 4.5 | **Ratsiya orqali manzil belgilash** — tizimning yetishmayotgan bo'g'ini | 4.4 dan keyin |
| 4.6 | Nazorat signallari (5 holat) · haydovchi 360 · firibgarlik signallari | — |

---

# 8. 🧩 TO'LQIN 5 — KO'PRIK VA CUTOVER

| # | Ish |
|---|-----|
| 5.1 | Mijoz cashback hamyoni B'da (`bonus_uzs` + `bonus_logs`) — **#1 to'siq** |
| 5.2 | 19 stub metod (avvalo `listActiveBookings`, `checkClient`, `addDriverPayment`, `getMainReport`) |
| 5.3 | `phoneNorm` — A normalizatsiya qiladi, B aynan solishtiradi → "mijoz topilmadi" |
| 5.4 | **Paritet testi** + `birjoy.spec.ts` — hozir bitta metod javobi ham tekshirilmagan |
| 5.5 | **F2 soya rejimi** — jonli trafik bilan paritet isboti. **Cutover'dan oldingi yagona xavfsizlik darvozasi** |
| 5.6 | **Ikkinchi mijoz boti (@koson1067bot) hali to'liq jonli** — bitta bozorda ikki mijoz shaxsi |

---

# 9. 🏆 TO'LQIN 6 — KOSONNI EGALLASH

`KOSON_30_FUNKSIYA.md` dagi 30 funksiya. Ular **shu poydevor tayyor bo'lgandan keyin**
quriladi — aks holda chala poydevorga qurilgan bo'ladi.

---

# 10. SIZDAN QAROR (7 ta)

| # | Qaror | Nimaga to'sqinlik qilyapti |
|---|-------|---------------------------|
| 1 | **GitHub tokenini revoke qilib yangilaysizmi** | 0.2 — xavfsizlik |
| 2 | **B'ni origin'ga push qilamizmi** (zaxira uchun) yoki `git bundle` yetadimi | 0.1 — yo'qotish xavfi |
| 3 | **Firebase** ochasizmi | FCM · ratsiya · overlay · uyg'otish |
| 4 | **Broadcast dispatch** — qolgan haydovchilar "kech qoldingiz" ko'radi | 3.2 |
| 5 | **B'ning "ball" valyutasi** — o'chiriladimi yoki tangaga ulanadimi | 1.1 — pul |
| 6 | **Shaharlararo** qayta ochiladimi (siz 2026-07-23 da o'chirgansiz) | daromad |
| 7 | **SMS: haydovchi SIM'i yoki 1067 gateway** — oqma xavfi bor | marketing kanali |

---

# 11. MENING KEYINGI QADAMIM (sizdan javob kutmasdan)

Ruxsat kerak bo'lmagan, xavfsiz ishlar — shulardan boshlayman:

1. **PROGRESS.md ni yangilash** (R7 qarzi)
2. **`git bundle` zaxira nusxasi** — 36 commit uchun
3. **B uchun systemd unit** — reboot'da o'lmasin
4. **Jonli xaritani tekshirish** — GPS tuzatilgandan keyin haydovchi ko'rinyaptimi
5. **B'ning "ball" valyutasiga kill-switch** — o'chirish emas, **to'xtata olish imkoni**
6. **Mock-GPS bloki** — pul-rag'batdan oldin

Qolganlari sizning 7 qaroringizga bog'liq.
