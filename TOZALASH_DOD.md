# 🧹 TOZALASH — eski qoldiqlarni yo'q qilish · DoD

**Ega topshirig'i (2026-07-29):** «umuman eski versiya qolmasin, faqat eng oxirgi versiya ishlashi
kerak … barcha qoldiqlar, eski linklar, eski usullar ketadi». Doira ega tomonidan tasdiqlangan:
**(1) kod-qoldiqlar** + **(2) bazadagi eski jadvallar**.

> Bu hujjat kod yozishdan OLDIN yozildi (CLAUDE.md DoD qoidasi #2). Ega tasdiqlamaguncha
> birorta ham qator o'zgartirilmaydi.

---

## 0. NIMA O'LCHANDI (taxmin emas — buyruq + natija)

| O'lchov | Natija | Buyruq |
|---|---|---|
| Har bir Prisma modeli kodda ishlatiladimi | **20 model faqat `backup.ts`da** (runtime kodda umuman yo'q) | `for m in $(grep "^model " schema.prisma \| awk '{print $2}'); do grep -rl "prisma.$lc\b" src; done` |
| Yetim jadvallardagi jonli qatorlar | **551 qator**, **~1,2 MB** (baza jami 44 MB → 2,7%) | jonli psql, `pg_total_relation_size` |
| GarajCar egalari | **84 mashina / 57 ega**, oxirgi faollik **2026-07-02** (27 kun) | `SELECT count(*), count(DISTINCT "memberId"), max("updatedAt")` |
| Yetim modellar sxemada | **300 qator / 2074** (14%) | schema.prisma tahlili |
| `Member`da ularga `@relation` | **YO'Q** — faqat bo'sh `memberId` ustuni, FK yo'q → toza uzilish | `sed -n '/^model Member/,/^}/p' \| grep -iE "garaj\|trade\|mechanic"` |
| O'lik flag qatorlari | **3 ta** (`garajx`, `kozacha`, `motorolami`) — kodda nom YO'Q, DB'da qator BOR | `grep -c '"$f"' featureFlags.ts` + `SELECT key FROM AppState WHERE key LIKE 'feature:%'` |
| Yetim miniapp fayllari | `home.tsx` (177 qator) — hech qayerdan import qilinmagan | import-grafik skaneri |
| **Tungi zaxira holati** | 🔴 **JSON qatlami BUZUQ** (`blockEvent` parity xatosi), pg_dump ishlaydi | `/var/log/birjoy-backup.log` + `ls /root/backups` |

---

## 🔴 BLOK 0 — ZAXIRA TUZATISH (BLOKLOVCHI, birinchi)

Jadval o'chirishdan **oldin** hal bo'lishi shart. Tekshiruvda topildi:

```
❌ backup.ts is out of sync with schema.prisma:
   missing from backup (data would be LOST): [ 'blockEvent' ]
```

`deploy/backup-cron.sh` ikki qatlamli: (1) `pg_dump` — **ishlayapti** (oxirgi: `pg-2026-07-29T20-00-01Z.dump`,
11 MB); (2) `backup.ts` JSON snapshot — **2 kechadan beri yiqilyapti**, oxirgi muvaffaqiyatli
snapshot **28-iyul**. Skript `fail()` chaqiradi → ega har kecha Telegram alert oladi.

**Ish:** `packages/server/src/scripts/backup.ts` — `tables` xaritasiga `blockEvent` qo'shiladi.

**Isbot:** VPS'da qo'lda yugurtirish → `✅ NNNNN rows across 111/111 tables`, so'ng
`ls -t /root/backups/snapshot-*.json | head -1` bugungi sanani ko'rsatadi.

---

## 🟢 BLOK A — KOD-QOLDIQLAR (xavfi past)

| # | Nima | Fayl | Dalil | Xavf |
|---|---|---|---|---|
| A1 | O'lik `home.tsx` + `livinghome` quvuri | `miniapp/src/home.tsx` (o'chirish) · `server/src/api/server.ts` (`livinghome` flagini `/api/me` va `/api/booking/info` javoblaridan olib tashlash) · `featureFlags.ts` (nom) · `admin/src/App.tsx` (toggle qatori) | `App.tsx` `NewUyView`ni `./uy`dan import qiladi, `home.tsx`ni **hech qachon** import qilmaydi → render bo'lmaydi. Flag klientga uzatiladi, klient uni ishlatmaydi | Past — o'lik yo'l |
| A2 | 3 o'lik flag qatorini DB'dan o'chirish | jonli `AppState` | `garajx`/`kozacha`/`motorolami` — `featureFlags.ts`da nom **0 marta**, `setFlag.ts` ular bilan xato beradi | Past |
| A3 | Yetim modellarni `backup.ts` + `restore.ts`dan olib tashlash | `scripts/backup.ts`, `scripts/restore.ts` | Parity-qorovuli BLOK B bilan bir commitda bo'lishini talab qiladi | Past (qorovul ushlaydi) |
| A4 | `testMoneyShield.ts`dagi `tradeOffer`/`tradeMessage` tozalash | `scripts/testMoneyShield.ts` | TradeOffer 0 qator, runtime kodda yo'q | Past |
| A5 | Eskirgan hujjatlarni haqiqatga keltirish | `ARCHITECTURE.md`, `PROGRESS.md` | ARCHITECTURE §7 Phase 3 `KozachaTxn`/`OfisLedger`ni sanaydi — ular **allaqachon sxemada yo'q**; `mahallaService.ts` «o'chirilgan» deyilgan — **mavjud va ishlatiladi** (`shopService.ts`) | Past |

---

## 🟡 BLOK B — BAZADAGI YETIM JADVALLAR (ehtiyotkorlik talab qiladi)

**20 jadval, 551 qator, ~1,2 MB.** Hech biri runtime kodda ishlatilmaydi (faqat `backup.ts`).

| Jadval | Qator | Jadval | Qator |
|---|---|---|---|
| GarajRideDrop | 147 | MemberMechanicSkill | 11 |
| GarajCar | 84 | MemberCar | 9 |
| MemberGarajMeta | 77 | GarajExhibitionEntry | 8 |
| GarajStreak | 38 | MahallaGroup | 7 |
| GarajCraftJob | 36 | MahallaGroupMember | 4 |
| GarajBazaarListing | 34 | GarajPart | 3 |
| GarajFlip | 34 | GarajPartListing | 1 |
| GarajAuction | 18 | TradeOffer | 0 |
| GarajExhibitionVote | 15 | TradeMessage | 0 |
| GarajAuctionBid | 13 | MahallaWeeklyResult | 12 |

**TARTIB MUHIM** (teskarisi botni yiqitadi):

1. **Avval kod** — `schema.prisma`dan 20 model + `backup.ts`/`restore.ts` ro'yxatlaridan olib
   tashlanadi, **bitta commitda** (parity-qorovuli mos kelmasa yiqiladi). Deploy. Bu bosqichda
   jadvallar DB'da **hali turadi** — ilova ularni shunchaki bilmaydi (zararsiz).
2. **Keyin, alohida ongli qadam** — VPS'da yangi `pg_dump` olinadi, so'ng `DROP TABLE`.

> ⚠️ Nega bu tartib: `prisma generate` modelni o'chirsa, `backup.ts` `prisma.garajCar`ga murojaat
> qilib **kompilyatsiyadan o'tmaydi** → tungi zaxira butunlay yiqiladi. Shuning uchun ikkisi bir
> commitda.

**Ega qarori kerak — 57 kishida 84 «mashina» bor.** CLAUDE.md'dagi mavjud siyosat:
«Refund policy: NO auto-refund; pay manually if a customer complains». Bu siyosat kuchida
qoladimi, yoki o'chirishdan oldin ularga xabar/kompensatsiya berilsinmi — **sizning qaroringiz**.
O'chirilgan ma'lumot `pg_dump`dan qaytarilishi mumkin, lekin bu qo'lda ish.

---

## ⛔ TEGILMAYDI — va nega (eng muhim bo'lim)

Har bir «eski ko'rinadigan» narsa qoldiq emas. Quyidagilar **ataylab saqlanadi**:

| Nima | Nega tegilmaydi |
|---|---|
| **Intercity 4 «yetim» jadval** (`IntercityRouteStop`, `IntercityRefund`, `IntercityDriverPenalty`, `IntercityWaitEntry`) | Xususiyat **butun va real ma'lumotli** (34 shahar, 3 marshrut), faqat `feature:intercity` off. O'chirilsa, flag yoqilganda ishlamaydi. Bu «o'lik» emas — «uxlab yotgan» |
| **`BroadcastRecipient`** | «0 to'g'ridan-to'g'ri havola» ko'rinadi, lekin `adminOps.ts:429`da **nested-create** orqali ishlatiladi. O'chirilsa ommaviy-xabar tarixi yo'qoladi. *(Bu aynan yolg'on-musbatga misol — shuning uchun har model qo'lda tekshirildi)* |
| **`booking.tsx`** (543 qator eski oqim) | `booking3.tsx:314`da `flagOff` holatida **tirik zaxira**. `booking3` hozir ON, lekin bu — yagona rollback yo'li. Faqat ega «booking3'ni abadiy» deb tasdiqlasa o'chiriladi |
| **`GO_MAP`dagi 29 «ishlatilmaydigan» alias** | Server hozir 11 ta `go=` qiymati yuboradi, lekin **eski bot xabarlaridagi tugmalar foydalanuvchi Telegram tarixida abadiy qoladi**. Alias o'chirilsa, o'sha tugma «Uy»ga tushadi (buzilmaydi, lekin noto'g'ri ekran) |
| **27 ta `bot.hears` eski tugma-nomi** | Foydalanuvchi telefonidagi **keshlangan reply-klaviatura** hali eski nomlarni yuboradi. O'chirilsa, o'sha tugma «tushunarsiz so'rov» beradi |
| **`Mahalla` katalogi** + `seedMahalla.ts`/`testMahalla.ts`/`dumpMahallaCatalog.ts` | `mahallaService.ts` **mavjud va `shopService.ts` ishlatadi** (ARCHITECTURE.md bu yerda eskirgan). Faqat `MahallaGroup*` (guruh-o'yin) o'lik |
| **Render/Vercel'dagi 14 boshqa loyiha** | Bu repo'ga aloqasi yo'q (`durak-server`, `delivery-backend`, `1067-taxi-client`…). ID solishtirib tasdiqlangan |
| **`CoinTxn` / `RideReward` / pul izlari** | O'zgarmas audit — **hech qachon o'chirilmaydi** (BUZILMAS qoida) |

---

## TARTIB

```
BLOK 0 (zaxira)  →  BLOK A (kod)  →  BLOK B/1 (sxema+backup, bitta commit)  →  BLOK B/2 (DROP)
     ↑ har bosqich alohida deploy + jonli isbot; oldingisi yashil bo'lmasa keyingisi boshlanmaydi
```

BLOK B/2 (`DROP TABLE`) — kechasi past-trafik oynada (Toshkent 01:00–04:00), yangi `pg_dump`dan keyin.

---

## DoD — har satr buyruq+natija bilan isbotlanadi

| # | Qabul mezoni | Tekshiruv buyrug'i |
|---|---|---|
| 1 | Tungi zaxira **ikkala** qatlami ishlaydi | VPS: `bash /opt/app/deploy/backup-cron.sh` → `111/111 tables` + `ls -t /root/backups/snapshot-*.json` bugungi sana |
| 2 | 4 paket typecheck toza | `pnpm -r typecheck` → 4/4 Done |
| 3 | Pul-matematikasi buzilmagan | `pnpm --filter @t1067/shared test` → 42/42 · `tsx src/scripts/simEconomy.ts` → BUZILMAS ✅ |
| 4 | Butun repo'da yetim modelga havola **0** | `grep -rn "garajCar\|memberGarajMeta\|tradeOffer\|mahallaGroup" packages/*/src` → bo'sh |
| 5 | 3 o'lik flag qatori yo'q | jonli: `SELECT key FROM "AppState" WHERE key IN ('feature:garajx','feature:kozacha','feature:motorolami')` → 0 qator |
| 6 | `home.tsx` yo'q, `livinghome` quvuri yo'q | `ls packages/miniapp/src/home.tsx` → yo'q · `curl api/me` javobida `livinghome` kaliti yo'q |
| 7 | 20 jadval DB'da yo'q | `\dt` da yo'q · `pg_database_size` kamaygan |
| 8 | **Jonli tizim buzilmagan** | `/health` ok · botdan real buyurtma → `[dispatch] … ok=true` · Mini App 4 tab ochiladi · `journalctl` 0 yangi xato |
| 9 | Intercity **hali butun** | `SELECT count(*) FROM "IntercityCity"` → 34 (o'zgarmagan) |
| 10 | PROGRESS.md literal haqiqat | §76 yoziladi: nima o'chirildi, nima ataylab qoldirildi, nechta qator |

---

## ROLLBACK

| Bosqich | Qaytarish |
|---|---|
| BLOK A/B1 (kod) | `git revert <commit>` → CI → deploy (~3 daq) |
| BLOK B2 (DROP) | `pg_restore -d birjoy -t <jadval> /root/backups/pg-<sana>.dump` — faqat o'sha jadvallar, qolgan ma'lumotga tegmasdan |

---

## EGA QARORLARI (2026-07-29, tasdiqlangan)

| # | Savol | Ega qarori |
|---|---|---|
| 1 | 84 «mashina» / 57 ega — oldin xabar/kompensatsiya? | **«to'liq yuqot»** — qo'shimcha xabar YO'Q, mavjud siyosat (shikoyat qilsa qo'lda to'lash) kuchida qoladi |
| 2 | `booking.tsx` (eski buyurtma oqimi zaxirasi) | **QOLDIRILADI** — zapas g'ildirak. 16/16 API metodi hali joyida (tekshirilgan), ya'ni tirik rollback yo'li |
| 3 | Intercity (1 137 qator, 34 shahar, flag off) | **QOLDIRILADI** — uxlab yotgan xususiyat, xarajati ~0 |

**Yakuniy doira:** 20 yetim jadval + `home.tsx`/`livinghome` + 3 o'lik flag qatori + eskirgan
hujjat da'volari ketadi. `booking.tsx`, Intercity (kod+7 jadval), `BroadcastRecipient`, Mahalla
katalogi — **tegilmaydi**.
