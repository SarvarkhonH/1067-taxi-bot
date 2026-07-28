# V4 — hayot-sikli push'lari (BirJoy Market) · DoD

**Sana:** 2026-07-28 · **Holat:** kod yozilmoqda · **Bayroq:** `mktlife` (DEFAULT_OFF → DARK)

## Nima ALLAQACHON bor (qayta qurilmaydi)
Tekshirildi (`bot/market.ts:325-375`): buyurtma holati o'zgarganda xaridorga push **allaqachon
boradi** — `✅ Qabul qilindi` / `🚚 Yo'lda` / `✔ Yetkazildi` / `😔 Rad etildi` (+ tanga qaytgani),
va sotuvchi va'da bergan **ETA** ham. Javobsiz buyurtma avto-yopiladi va sabab bilan xabar beriladi
(`mktexpire`). Ya'ni **tranzaksion** hayot-sikli yopilgan.

## Shu bosqichda quriladigan ikkita push

| # | Qachon | Nima yuboriladi |
|---|---|---|
| **V4.1** | Mijoz biror narsani qidirgan, topilmagan (`MarketDemand`), **keyin o'sha mahsulot paydo bo'lgan** | «🔎 Siz qidirgan «X» endi bor» + mahsulot kartasi (mavjud `sendProductCard`) |
| **V4.2** | Mijoz ❤️ bosgan mahsulotga **chegirma qo'yilgan** (`oldPriceTanga > priceTanga`, oxirgi 24 soatda) | «💥 Sevimlingiz arzonlashdi: −N%» + mahsulot kartasi |

**Savat-tashlab-ketish push'i BU BOSQICHDA YO'Q** — savat faqat mijoz qurilmasida turadi, server
uni bilmaydi. Uni qilish uchun savatni serverga saqlash kerak (yangi API + jadval) — alohida tiket.
Bo'lmagan narsani "qildik" demaslik uchun shu yerda ochiq yozildi.

## Buzilmas cheklovlar (spam = ishonchni yo'qotish)
1. Bayroq `mktlife` — **DEFAULT_OFF**, ega QABUL bermaguncha hech kimga hech narsa bormaydi.
2. **Sokin soatlar:** faqat Toshkent vaqti bilan **09:00–21:00**.
3. **Kuniga 1 ta** hayot-sikli push (bir a'zoga), turi qanday bo'lishidan qat'i nazar.
4. **Bir tick'da ko'pi bilan 20 ta** push (portlash bo'lmasin).
5. Har push **bir marta**: `(a'zo, mahsulot)` bo'yicha idempotent marker (`AppState`).
6. **Yangi poller YO'Q** — mavjud 15-daqiqalik tick'ga ulanadi (CLAUDE.md).
7. Faqat Telegram'i ulangan a'zolarga; mahsulot **faol va zaxirada** bo'lishi shart.

## Qabul mezonlari

| # | Mezon | Tekshiruv |
|---|---|---|
| K1 | `mktlife` OFF holatida funksiya **0 ta** push qaytaradi va DB'ga tegmaydi | dry-run skript: `pushed=0` |
| K2 | Sokin soat tashqarisida (masalan 03:00) — **0 ta** push | skript soatni parametr bilan sinaydi |
| K3 | Bir a'zoga kunda 1 tadan ko'p ketmaydi | ikkinchi chaqiruvda o'sha a'zo **skip** |
| K4 | Bir (a'zo, mahsulot) juftligiga **ikkinchi marta** ketmaydi | marker bor → skip |
| K5 | Tick'da 20 tadan oshmaydi | limit sinovi |
| K6 | Faol/zaxirasi bor bo'lmagan mahsulot **hech qachon** yuborilmaydi | filtr sinovi |
| K7 | Butun-repo typecheck toza | `pnpm -r typecheck` 4/4 |
| K8 | Jonli DRY-RUN: kim nima olishi ko'rsatiladi, **hech narsa yuborilmaydi** | VPS'da skript |
| K9 | Ega QABUL bergach bayroq yoqiladi va **birinchi kun** o'lchov olinadi | `CoinTxn`/`MarketOrder` emas — push soni + ochilish |

## Holat
`in progress` — K1–K8 kod bilan yopiladi; K9 ega QABUL'idan keyin.
