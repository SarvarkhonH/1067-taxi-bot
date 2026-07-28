# Testlarni yugurtirish — qo'llanma

**2026-07-28 dan boshlab testlar QAYTA ISHLAYDI.** Ilgari `TEST_DATABASE_URL` yo'q edi (u Neon'da
edi va 2026-07-27 da o'chirilgan), shuning uchun `src/scripts/` dagi **87 ta test skripti**
yugurmasdi — pul-mantiqni himoya qiladigan to'r bezak holida turgan edi.

## Nega alohida baza

`_testDb.ts` app bazasida ishlashdan **ataylab bosh tortadi**. Sababi qonga yozilgan saboq:
jonli botning 90 soniyalik sweep'i test yaratgan sun'iy a'zolarni poygalaydi → testlar flaky
bo'ladi **va** prod buziladi. Shuning uchun:

- **App bazasi:** `localhost:5432/birjoy` — jonli, tegilmaydi
- **Test bazasi:** `localhost:5432/birjoy_test` — faqat testlar uchun, VPS ichida

`.env` da ikkalasi ham bor: `DATABASE_URL` va `TEST_DATABASE_URL`.

## Yugurtirish (VPS'da)

```bash
ssh -i ~/.ssh/id_ed25519_1067vps root@169.58.55.249
cd /opt/app/packages/server
npx tsx src/scripts/testBazar.ts
```

`_testDb.ts` birinchi import bo'lib `.env` ni o'zi o'qiydi va Prisma'ni test bazasiga buradi —
qo'shimcha env berish shart emas.

## Sxema o'zgarganda

`schema.prisma` o'zgarsa, test bazasini ham yangilash kerak (aks holda testlar eski ustunlarda
yiqiladi):

```bash
cd /opt/app/packages/server
TEST=$(grep -m1 '^TEST_DATABASE_URL=' ../../.env | cut -d= -f2- | tr -d '"')
DATABASE_URL="$TEST" DIRECT_URL="$TEST" npx prisma db push --skip-generate --accept-data-loss
```

`--accept-data-loss` bu yerda **xavfsiz** — test bazasida qimmatli ma'lumot yo'q. App bazasida
bu bayroq **HECH QACHON** ishlatilmaydi.

## Ishonch mezoni

Pul bilan bog'liq testlar **3 marta ket-ket** yashil bo'lishi shart. Flaky pul-testi = ishonchsiz
gate (CLAUDE.md). Har yurishdan keyin app bazasi o'zgarmaganini tekshiring:

```bash
sudo -u postgres psql -d birjoy -tAc \
  'select (select count(*) from "Member")||" a''zo, "||(select count(*) from "CoinTxn")||" txn"'
```

## Holat (2026-07-28)

| To'plam | Natija |
|---|---|
| `testBazar.ts` | **3/3 yashil** (ket-ket) |
| `testAuditFixesA.ts` | yashil |
| `testAuditFixesB.ts` | yashil |
| `testCrashGuards.ts` | **105 yashil / 3 qizil** — pastga qarang |

### Ma'lum qizil: `testCrashGuards` D4 — shaharlararo bekor→qayta band

```
❌ D4: bekordan keyin QAYTA band o'tdi → {"ok":false,"error":"already_booked"}
```

Mijoz shaharlararo joyni bekor qilgach, o'sha reysga qayta yozila olmaydi — bekor qilingan
yozuv uni bloklaydi. Skript izohida bu "★ TUZATISH" deb belgilangan, demak bir marta tuzatilgan
deb hisoblangan, aslida ishlamaydi.

**Ta'siri hozir NOL:** `intercity` bayrog'i OFF, jonli bazada 0 ta shaharlararo buyurtma.
Shuning uchun tuzatish shaharlararo yo'nalishi ochilishidan oldingi shart sifatida yozildi
(`MUKAMMAL_DASTUR.md`), hozir emas.

**Tuzatilgani:** skriptning o'z teardown'i `IntercityCity` ni unga bog'langan `IntercityRoute`
dan oldin o'chirar edi → FK buzilishi (P2003) → barcha tekshiruvlar yashil bo'lsa ham skript
qulab, TAG'li satrlar bazada qolardi. Endi marshrutlar avval o'chadi.
