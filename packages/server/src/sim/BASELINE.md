# P0 — REAL KOSON BASELINE (2026-08-08, jonli bazadan bir-martalik faqat-o'qish)

Manba: VPS `localhost:5432/birjoy`, faqat SELECT (ega ruxsati 2026-08-08). Bu hujjat —
Raqamli Egizakning KALIBRATSIYA-NISHONLARI. Sim shu raqamlarni qayta chiqara olmaguncha
hech qanday eksperiment yugurmaydi (master-reja, 2-qoida).

## 1. Xizmat tarixi
- Birinchi safar: **2026-06-11** · jami: **975 safar**, **166 rider** (2026-08-08 holatiga)
- Oylik: 2026-06: 156 safar / 30 rider · 2026-07: **642 / 127** · 2026-08 (8 kun): 177 / 68
- Joriy sur'at: **~20-22 safar/kun**, haftalik barqaror ~135-155 safar (9 haftadan beri plato)
- Haftalik faol rider o'sib boradi: 39 → 48 → 45 → 61 → 62 → 56

## 2. Funnel (bot → mijoz)
| Bosqich | Qiymat | Izoh |
|---|---|---|
| Bot-user (jami) | 1177 | oylik oqim: 298 / 823 / 56 — iyul-portlash, avgust sekin |
| Raqam ulagan | 854 (**72.5%**) | eski 1%-darvoza olib tashlangach keskin yaxshilangan |
| ≥1 safar qilgan | 166 (**19.4%** ulanganlardan) | eng katta yo'qotish SHU yerda |
| ≥2 safar | 97 (**58.4%** 1-safar qilganlardan) | median oraliq **1.5 kun** |
| ≥3 / ≥5 / ≥10 / ≥30 | 72 / 41 / 24 / 5 | o'rtacha 5.87, maks 91 safar |

## 3. Retention
- 1-safardan keyin (kohorta=68, 1-safari 30+ kun oldin): **D7 = 54.4%**, **D30 = 76.5%**
- Oydan-oyga: iyun→iyul **60.0%** · iyul→avg 32.3% (⚠️ avgust 8 kunlik — bu POL, oy oxirida o'sadi)

## 4. Referral
- Jami 283 ta Referral-yozuv (oylik 108 / 166 / 9) — havolalar ISHLAGAN, lekin bonus-to'lovlar
  hozir OFF (2026-08-07) va avgustda oqim deyarli to'xtagan.

## 5. O'yin (Koson O'yini) — JONLI HAQIQAT
- Chipta egalari: **1** · login: 1 · gashtak: 1 guruh/2 a'zo · hikoya: 1 · sotilgan-sovrin qatorlari: 4
- Ega tasdig'i (2026-08-08): **"ball o'yinlar hali start olmagan"** — o'yin mijozlar uchun deyarli nol.
  Sim uchun bu MUHIM: o'yin-qatnashuv kalibratsiyasi "nol-start"dan boshlanadi, taxminiy emas.

## 6. Bozor-anchor (birjoy_sim.py, avvalgi o'lchov)
1415 ≈ 2000 safar/kun · 1313 ≈ 1000 · 1067/BirJoy ≈ 20 (yuqoridagi joriy sur'at bilan mos) →
BirJoy bozor-ulushi ≈ **0.7%**.

## KALIBRATSIYA-NISHONLAR (sim shularni chiqarishi SHART) + tavsiya-toleranslar

| # | Nishon | Real qiymat | Tolerans |
|---|---|---|---|
| N1 | Oylik safar (barqaror oy, iyul) | 642 | ±20% |
| N2 | Oylik faol rider | 127 | ±20% |
| N3 | Link-rate (bot→raqam) | 72.5% | ±10 p.p. |
| N4 | Ulangan→1-safar konversiya (umrbod) | 19.4% | ±5 p.p. |
| N5 | 1-safar→2-safar konversiya | 58.4% | ±8 p.p. |
| N6 | D7 retention (1-safardan) | 54.4% | ±10 p.p. |
| N7 | D30 retention (1-safardan) | 76.5% | ±10 p.p. |
| N8 | Oydan-oyga rider-retention | ~60% | ±12 p.p. |
| N9 | Safar-taqsimot dumi (≥10 safar ulushi riderlardan) | 14.5% | ±6 p.p. |
| N10 | O'yin-qatnashuv (chipta-xaridor) | ~0 (1 kishi) | start-holat: sim ham 0dan boshlaydi |

Qabul-mezoni (L2): 10 nishondan **≥8 tasi** tolerans ichida bo'lsa kalibratsiya O'TDI.
Toleranslar egaga taklif sifatida ko'rsatildi (2026-08-08); e'tiroz bo'lmasa shu qiymatlar amal qiladi.

## Server-foydalanish siyosati (ega bilan kelishuv, 2026-08-08)
- Ega ruxsati: "serverga bemalol, agentlar taxi chaqirib ball-o'yinlarga xohlagancha tegishsin,
  FAQAT mijozlarning tangalari real". 
- Muhandis-qaror: OMMAVIY sim baribir LOKALDA yuguradi (minglab soxta a'zo jonli bazani/
  tiraj-ro'yxatlarini/statistikani ifloslantiradi va hujjatlashgan sweep-poyga xavfi bor).
  Jonli server KEYINROQ faqat KICHIK nazoratli smoke-kohorta uchun ishlatilishi mumkin
  (🧪 test-flagli a'zolar — kod allaqachon ularni tirajdan chiqaradi). Mijoz-tangasiga
  HECH QACHON tegilmaydi — bu qat'iy chegara.
