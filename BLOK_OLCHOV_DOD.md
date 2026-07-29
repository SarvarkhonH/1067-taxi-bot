# BLOK-O'LCHOV DoD — «kim, qaysi xabardan keyin bloklади?»

**Holat:** `not started` — egadan TASDIQ kutilmoqda (kod yozilmagan).
**Sana:** 2026-07-29 · **Tiket:** BLK-1

---

## 1. MUAMMO (o'lchangan haqiqat, 2026-07-29)

| O'lchov | Raqam | Manba |
|---|---|---|
| Jami TelegramUser | 1 104 | jonli DB |
| `blockedAt` to'ldirilgan | 87 (7.9%) | jonli DB |
| Ulardan 07-12 18:00da aniqlangani | **86** | `blockedAt` bo'yicha guruhlash |
| Undan keyin aniqlangani | 1 (07-23) | — |
| 07-12 18:43 broadcast | 551 ta, **90 failed** (16.3%) | `Broadcast` id=1 |
| Kunlik push oluvchilar | ~780 kishi/kun, ~950–1 418 xabar/kun | `NotifyLog` |
| Ilova ichida bildirishnomani o'chirganlar | 8 | `AppState notifyoff:%` |

**Ildiz sabab:** `blockedAt` ni butun kodbazada FAQAT bitta joy yozadi —
`packages/server/src/index.ts:130` (`sendTg`, faqat API/admin-broadcast yo'li).
Barcha proaktiv push'lar 403 ni jimgina yutadi:
`packages/server/src/services/notifyService.ts:48` → `.catch(() => undefined)`.

➡️ Ya'ni **87 raqami — 17 kun oldingi bitta broadcast'ning izi**, kunlik xabarlarning
ta'siri emas. Hozirgi holatda «kunlik bonus xabari odamni haydayaptimi?» degan savolga
javob berish TEXNIK JIHATDAN IMKONSIZ. Bu tiket aynan shu ko'zni ochadi.

## 2. QAMROV (nima o'zgaradi)

**Ichida** — biz tashabbus qilgan yuborishlar (foydalanuvchi so'ramagan) va safar push'lari:

| Fayl | Satr(lar) |
|---|---|
| `services/notifyService.ts` | 48 (`trySend` — `notifyOnce` orqali driverEngage + campaign ham shu yerdan) |
| `services/tierLoyaltyService.ts` | 197 |
| `services/linkReminderService.ts` | 29 |
| `services/ai/needsEngine.ts` | 91 |
| `services/ai/reminderService.ts` | 91 |
| `services/classifiedService.ts` | 686, 706 |
| `services/bookingNotifier.ts` | 340, 373, 643, 853 |
| `index.ts` | 437 (market avto-bekor), 460 (mktlife lead) + `bot/shop.ts` `sendProductCard` |

**Tashqarisida (ONGLI ravishda tegilmaydi, R3 bo'yicha ochiq aytiladi):**
`bot/*.ts` ichidagi foydalanuvchi bosgan tugmaga JAVOB xabarlari (403 u yerda deyarli
uchramaydi — odam hozirgina yozgan), admin/ega alertlari, kanal postlari (`channelService`),
`scripts/*` (bir martalik).

**O'ZGARMAYDI:** birorta xabar MATNI, chastotasi, vaqti, flag'i. Bu tiket faqat O'LCHOV.
Yukni kesish — keyingi, raqamga tayangan alohida qaror.

## 3. YECHIM

1. **Yangi modul** `packages/server/src/services/pushSend.ts`:
   `pushSend(bot, chatId, kind, send, opts?)`
   - **Oldindan tekshiruv:** `blockedAt != null` va `opts.force !== true` → Telegram'ga
     UMUMAN chiqmaydi (`"skipped"`). Hozir bloklagan 87 kishiga har kuni bekorga urinamiz.
   - **403 / blocked / deactivated** → `TelegramUser.blockedAt = now()` + `BlockEvent`
     yozuvi (`kind` = qaysi push, `event = "block"`) → `"blocked"`.
   - **Boshqa xato** (429, tarmoq) → hozirgidek jimgina yutiladi, `blockedAt` YOZILMAYDI.
   - `opts.force` — tranzaksion push'lar uchun (`bookingNotifier`: odam safar buyurtma
     qilgan, eski/noto'g'ri blok bayrog'i tufayli «haydovchi yetib keldi» yo'qolmasin).
2. **Sxema** (`prisma/schema.prisma`) — yangi model:
   `BlockEvent { id, telegramId, memberId?, kind, event ("block"|"return"), at }`
   + `@@index([at])`, `@@index([kind])`. `TelegramUser.blockedAt` TEGILMAYDI (mavjud
   admin ro'yxati ishlashda davom etadi).
3. **Qaytish** — `memberService.ts:413` allaqachon `blockedAt: null` qiladi; o'sha yerga
   `event = "return"` yozuvi qo'shiladi → «bloklab, keyin qaytdi» voronkasi ko'rinadi.
4. **Admin** — `adminOps.ts:695` bloklaganlar ro'yxatiga oxirgi `BlockEvent.kind` ustuni.

## 4. QABUL MEZONLARI — har biri buyruq+xom natija bilan isbotlanadi

| # | Mezon | Tekshiruv buyrug'i |
|---|---|---|
| A1 | Qamrovdagi HAR bir yuborish `pushSend` orqali o'tadi | `grep -rn "api\.send.*catch(() => undefined)" packages/server/src/services packages/server/src/index.ts` → qamrov fayllarida **0**; qamrovdan tashqari qolganlari ro'yxat bilan sanab beriladi |
| A2 | 403 → `blockedAt` + `BlockEvent(event=block, kind=...)` | mock bot 403 tashlaydi → test DB'dan `select` xom natijasi |
| A3 | Bloklangan (force emas) foydalanuvchiga API chaqiruvi 0 ta | mock spy: `sendMessage` chaqirilmagan (counter=0) |
| A4 | Qaytgan foydalanuvchida `blockedAt=null` + `event=return` | `touchTelegramUser` dan keyin `select` natijasi |
| A5 | 429/tarmoq xatosi blok DEB YOZILMAYDI | mock 429 → `blockedAt is null` |
| A6 | `force: true` bloklangan foydalanuvchiga ham urinadi (safar push'i) | mock spy: chaqiruv 1 ta |
| A7 | Butun repo yashil | `pnpm -r typecheck` + `pnpm -r lint` xom natija |
| A8 | Xabar matni/chastotasi o'zgarmagan | `git diff` da birorta o'zbekcha xabar satri yo'q — `git diff -U0 \| grep -c "^[+-].*tanga"` = 0 |
| A9 | Sxema VPS'da QO'LLANGAN (kod push'idan OLDIN) | VPS'da `prisma migrate diff` o'qilgan → `db push` → `\d "BlockEvent"` chiqishi |
| A10 | Jonli isbot (deploy + 24 soat) | `select kind, event, count(*) from "BlockEvent" group by 1,2` — natija 0 bo'lsa ham NATIJA (kunlik push'lardan blok yo'q ekanining birinchi haqiqiy dalili) |
| A11 | PROGRESS.md literal-haqiqat, holat `ready for verification` | fayl diff'i |

## 5. XAVFLAR

- **Sxema push'i** — `deploy.sh` da `db push` YO'Q. A9 kod push'idan OLDIN qo'lda
  bajarilmasa, yangi kod har push'da yiqiladi. Tartib qat'iy: sxema → keyin kod.
- **Noto'g'ri blok bayrog'i** — agar `blockedAt` xato qo'yilsa odam jim qoladi.
  Yumshatish: `force` tranzaksion yo'llarda + qaytganda avtomatik tozalash (A4).
- **Backfill yo'q** — 87 ta mavjud blok uchun `kind` noma'lum (o'sha paytda yozilmagan).
  Ular `BlockEvent` da paydo bo'lmaydi; bu ONGLI, soxta ma'lumot to'qilmaydi.

## 6. TEKSHIRUV TARTIBI

1. Kod yozilgach — A1..A8 lokal isbot.
2. VPS'da sxema (A9) → `main`ga push → CI → deploy → `/health`.
3. **Mustaqil tekshiruv (R4):** kodni yozmagan alohida agent har satrni qayta tekshiradi.
4. 24 soatdan keyin A10 → EGAGA hisobot → owner-accepted.
