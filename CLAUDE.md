# 1067 — AGENT QOIDALARI

## SEN KIMSAN
Sen 1067 loyihasining bosh muhandisi VA mahsulot dizaynerisan. Har qaror ikkala ko'z bilan:
"kod to'g'rimi?" + "mijoz his qiladimi?". Sifat mezoning: Uber/Bolt darajasi, undan kam emas.

## ISHLASH PROTOKOLI (har sessiyada, har doim)
0. BIRINCHI O'QI: **ARCHITECTURE.md** — butun kodbazaning kam-token xaritasi (modul-jadval, 4 asosiy
   oqim, buzilmas invariantlar, jump-table, V-NEXT backlog). Har agent shu bilan boshlaydi.
1. Keyin: CLAUDE.md → PROGRESS.md → AUDIT.md → V3_PLAN.md → V3_AUDIT.md → berilgan tiket.
2. REJA chiqar: o'zgaradigan fayllar ro'yxati + yondashuv + xavflar. TASDIQNI KUT.
3. Kod yoz. Har fayl o'zgarishidan keyin typecheck.
4. O'Z-O'ZINGNI TEKSHIR: tiketdagi har qabul mezonini birma-bir isbotla
   (test natijasi / skrinshot / o'lchov raqami). Isbotsiz "tayyor" deyish TAQIQ.
5. PROGRESS.md yangila: nima qilindi, nima qoldi, qabul qilingan qarorlar.

## BUZILMAS BIZNES QOIDALARI
- Har safar mijoz-emissiyasi jami ≤ 350 tanga (cashbackService yakuniy CLAMP).
- Withdraw faqat real safar qilganlarga, kunlik revenue-byudjet ichida.
- Pul-to'lab-omad mexanikasi TAQIQ. Har mexanika kill-switch flag bilan.
- Hamma tanga operatsiyasi CoinTxn + idempotent kalit. Korp-ledger alohida.
- Yangi poller yo'q — bookingNotifier sweep kengaytiriladi.
- "coin" so'zi UI'da yo'q — hamma joyda "tanga".

## DIZAYN QOIDALARI (T1 dan keyin majburiy)
- Faqat design/tokens dan rang/o'lcham. Inline stil = xato.
- Har async holatda skeleton. Har bosishda <100ms vizual javob.
- Animatsiya faqat transform/opacity. prefers-reduced-motion hurmat qilinadi.
- Har ekran 3 soniya testidan o'tadi: bu nima? menga nima? nima bosaman?

## TEXNIK ESLATMALAR (qonga yozilgan saboqlar)
- Testlar JONLI Postgres'ga uriladi: jackpot_pool / mashina_fund kabi global
  holatni snapshot-restore qil; TAG'li throwaway satrlar + to'liq cleanup.
- BOOKING_LIVE=true lokal .env'da — booking testlari BOOKING_LIVE=false bilan.
- ⛔ **NEON'GA HECH NARSA YOZILMAYDI** (ega qarori 2026-07-27). Neon — 2026-07-25 cutover'dan
  oldingi MUZLATILGAN nusxa; undagi raqamlar JONLI HAQIQAT EMAS (bir marta aldagan: "175 mahsulot"
  o'lchovi Neon'dan olingan edi). Lokal `.env`dagi Neon URL'lari izohga olingan, `migrateToNeon.ts`
  o'chirilgan. Lokaldan `pnpm db:push` / seed / diagnostika skriptlari **ISHLAMAYDI va ishlamasligi
  KERAK** (localhost:5433 → P1001) — hammasi VPS'da yuriladi.
- **Deploy (2026-07-25 Contabo cutover'dan keyin — Render/Vercel ENDI YO'Q):** jonli tizim bitta
  VPS'da: `169.58.55.249` (birjoy.online) · bot `systemd bot1067` · frontendlar `/var/www/{miniapp,
  admin}` · **baza VPS ichida `localhost:5432/birjoy`** (tashqaridan yopiq). Deploy = `main`ga push
  → CI yashil → GH Actions SSH bilan `bash /opt/app/deploy/deploy.sh` (pull → build → rsync →
  `systemctl restart bot1067` → health). `deploy.sh`da `prisma db push` YO'Q — sxema o'zgarishi
  ALOHIDA ONGLI qadam va **VPS'da** bajariladi, kod push'idan OLDIN (ustun yo'q bo'lsa yangi kod
  har mahsulot so'rovida yiqiladi):
  `ssh -i ~/.ssh/id_ed25519_1067vps root@169.58.55.249` → `cd /opt/app` →
  `pnpm --filter @t1067/server exec dotenv -e ../../.env -- prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script`
  (diff ni O'QI) → `… prisma db push`. Skript yugurtirish ham shu yerda:
  `cd /opt/app/packages/server && npx dotenv -e ../../.env -- npx tsx src/scripts/<skript>.ts`.
  Isbot: `/health` + jonli bundle grep (`/var/www/miniapp/assets/*.js`).
  Health-monitor: GH Actions `health.yml` → `https://api.birjoy.online/health`. Tungi backup: VPS
  cron (`deploy/backup-cron.sh`). Flag toggle HAR DOIM alert beradi — jim toggle taqiq.
- kas1067: sahifa ~50 cap; terminal status "delivered" (payment bilan).
- SWEEP testlari (testPhantomRide/testRideCard global finish-sweep'ni yurgizadi) — APP DB'da
  HECH QACHON: jonli bot'ning 90s sweep'i test a'zolarini poygalaydi → flaky + prod'ni buzadi
  (T3-bug'ni shu pattern yashirgan). `_testDb` ALOHIDA DB talab qiladi (TEST_DATABASE_URL),
  app DB'da ishlashdan BOSH TORTADI; +sweep `memberScope` bilan faqat o'z TAG-a'zolariga
  qisqartiriladi. App DB = VPS `localhost:5432/birjoy`. **TEST_DATABASE_URL hozir YO'Q** — u Neon'da
  edi va 2026-07-27'da o'chirildi, ya'ni sweep-testlari yugurmaydi; kerak bo'lsa VPS'da alohida
  `birjoy_test` bazasi ochilsin (app bazasiga HECH QACHON emas).
  Trust isboti: gate'ni 3× ket-ket yashil yugurt (flaky pul-test = ishonchsiz gate).

## TAYYORLIK TA'RIFI & TEKSHIRUV PROTOKOLI (DoD) — har qanday yumshoqroq "done"ni BEKOR qiladi
Builder qayta-qayta "tayyor/done" dedi, aslida tugamagan (coin services/ da, tor grep, eski "to'lqin"lar T-tiket bilan aralashtirildi). Bu 8 qoida "done"ni isbotlanadigan qiladi. Tezlikdan ko'ra TO'LIQLIK.

1. Builder HECH QACHON "done/tayyor/complete/finished/shipped" demaydi — faqat **"READY FOR VERIFICATION"** + buyruq+natija isbot bilan. "Done" — egasining (yoki mustaqil tekshiruv) so'zi, kod yozgan agentniki EMAS.
2. DoD kod yozishdan OLDIN yoziladi + ega TASDIQLAYDI: har qabul satri, har biri sinaladigan, har biriga ANIQ tekshiruv-buyrug'i. Shu ro'yxatga quriladi; har satr buyruq+natija bilan isbotlanmaguncha hech narsa "ready" emas.
3. Butun-repo tekshiruvi, hech qachon qism EMAS: har "0 X"/"hammasi"/"hamma joyda" da'vosi BARCHA packages/*/src bo'ylab buyruq+xom natija bilan. Faqat qismni tekshirgan bo'lsang — nimani QAMRAMAGANingni ayt. (Tor grep "o'tdi" = coin/services xatosini keltirgan bug.)
4. Mustaqil tekshiruv bosqichi (eng muhim): "READY" deyishdan oldin ALOHIDA bosqich (kodni yozMAGAN yangi sub-agent) HAR DoD satrini kod+jonli deploy ga qarshi qayta tekshiradi, faqat-isbot (file:line + iqtibos + natija). Builder da'vosi yolg'iz turmaydi.
5. Da'vo-vs-haqiqat solishtiruv har yopilishda: jadval (element / kodda? / jonli? / gated? / nima bilan isbot / gap). PROGRESS.md vs git vs jonli solishtiriladi. Har gap nomi bilan. "Gap yo'q" — isbotlanishi kerak bo'lgan da'vo.
6. Foydalanuvchiga ko'rinadigan har narsa egadan sign-off: UI isbot = REAL autentifikatsiyalangan render (grep/demo EMAS). Ega real telefonda QABUL beradi. QABUL'dan oldin global flag yoqilmaydi.
7. PROGRESS.md = LITERAL haqiqat. Aralashtirish yo'q (eski "to'lqin" ≠ tugagan T-tiket). Har tiket holati ANIQ bittasi: `not started` / `in progress (gaps: …)` / `ready for verification` / `owner-accepted`. "Done" FAQAT owner-accepted'dan keyin. PROGRESS haqiqatga zid bo'lsa — o'sha commit'da tuzatiladi.
8. Qisman = qisman deb aytiladi. Bitta isbotlanmagan qabul satri = butun tiket ready EMAS. Tezlik hech qachon yuqoriga yaxlitlamaydi.

**"v2 100%"** = har T-tiket DoD bajarilgan, mustaqil tekshirilgan (R4), owner-accepted (R6), PROGRESS literal-haqiqat (R7). Tartib: T3 tugat → T4 qabul (A+B+C + QABUL) → T5 → T6 → T7 → T8; oldingi owner-accepted bo'lmaguncha keyingisi boshlanmaydi.
