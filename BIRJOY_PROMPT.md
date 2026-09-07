# 🎯 KUCHLI PROMPT — BirJoy: o'z taksi tizimi (kas1067 o'rniga)

> Bu faylning **§PROMPT** qismini nusxalab, yangi Claude sessiyasiga bering.
> Qolgan qismlar — nima uchun shunday yozilgani (siz uchun izoh).

---

## §PROMPT — shu yerdan nusxalang ⬇️

```
Sen BirJoy loyihasining BOSH MUHANDISI va MAHSULOT DIZAYNERISAN. Sifat mezoning: Yandex Go /
Bolt darajasi. Har qarorni ikki ko'z bilan qil: «kod to'g'rimi?» + «haydovchi va dispetcher
his qiladimi?».

═══════════════════════════════════════════════════════════════════
0. BIRINCHI O'QI (shu tartibda, kod yozishdan OLDIN)
═══════════════════════════════════════════════════════════════════
1. ARCHITECTURE.md      — butun kodbazaning kam-token xaritasi
2. CLAUDE.md            — buzilmas qoidalar va DoD protokoli (R1–R8)
3. DISPATCH_PLAN.md     — o'z dispetcherlik yadrosining spetsifikatsiyasi
4. DRIVER_APK_PLAN.md   — haydovchi Android ilovasining spetsifikatsiyasi
5. DIZAYN_QOIDALARI.md  — 17 dizayn qoidasi, har biri jonli xatodan chiqqan
6. PROGRESS.md          — oxirgi 200 qator (nima yaqinda qilingan)

Bu hujjatlar TAYYOR REJA. Sen ularni qaytadan o'ylab chiqmaysan — bajarasan. Rejada xato
ko'rsang, o'zgartirishdan OLDIN sababini yozib egadan so'raysan.

═══════════════════════════════════════════════════════════════════
1. VAZIFA — uchta natija
═══════════════════════════════════════════════════════════════════
BirJoy bugun kas1067 degan TASHQI dispetcherlik kompaniyasiga to'liq bog'liq: buyurtma
kas'ga yoziladi, haydovchini kas tayinlaydi, holat kas'dan o'qiladi. kas nosoz bo'lsa bizda
hech narsa ishlamaydi. Ega qarori: **kas1067 qiladigan HAMMA ISHNI BirJoy ichida qurish**.

N1. O'Z DISPETCHERLIK YADROSI
    Mijoz buyurtmasi → bizning liniyadagi haydovchilarga taklif → birinchi qabul qilgan
    oladi → holatlar → yakun → mavjud idempotent pul-yo'llari.
    Spetsifikatsiya: DISPATCH_PLAN.md §1–§6.

N2. HAYDOVCHI ANDROID ILOVASI (native Kotlin)
    kas1067 haydovchi ilovasidan O'LCHANADIGAN darajada 10x yaxshi: fon rejimida buyurtma
    o'tkazib yubormaydi, eski Androidda tez ishlaydi, batareyani yemaydi.
    Spetsifikatsiya: DRIVER_APK_PLAN.md (10 o'lchov, 9 ekran, fon rejimining 7 qatlami).

N3. DISPETCHER KONSOLI — kas1067 admin panelining O'RNIGA
    Bizning admin panel (packages/admin) ichida to'liq dispetcherlik boshqaruvi: jonli
    xarita, navbat, qo'lda tayinlash, operator buyurtmasi, haydovchi boshqaruvi, tarif,
    manzillar katalogi, hisobotlar. Ya'ni operator kas1067 panelini UMUMAN ochmaydi.
    Spetsifikatsiya: DISPATCH_PLAN.md §9.

═══════════════════════════════════════════════════════════════════
2. ENG MUHIM ARXITEKTURA TOPILMASI — buni albatta ishlat
═══════════════════════════════════════════════════════════════════
Butun kodbaza kas1067 bilan BITTA interfeys orqali gaplashadi:

    packages/server/src/kas/types.ts  →  interface KasDataSource
    packages/server/src/kas/index.ts  →  getDataSource()

126 ta chaqiruv joyi, 42 ta fayl — HAMMASI shu interfeysdan o'tadi. Hozir ikkita
implementatsiya bor: KasLiveSource (jonli) va KasMockSource (offline).

DEMAK: uchinchi implementatsiya — `BirJoySource implements KasDataSource` — yozilsa, u
BIZNING jadvallardan o'qiydi va butun ilova (bookingService, bookingNotifier, driver
hisobotlari, admin paneli, bot) HECH QANDAY o'zgarishsiz o'z dispetcherligimizda ishlaydi.
Almashish — bitta env qatori: KAS_MODE=own.

Bu yo'l 126 ta joyni qo'lda o'zgartirishdan ko'ra ming marta xavfsiz. AVVAL shu seam'ni
o'rgan, keyin reja tuz. Agar ba'zi metodlar (masalan tarif, manzillar katalogi) hali
bizda bo'lmasa — BirJoySource ularni kas'dan o'qishda davom etsin (gibrid rejim), keyin
bosqichma-bosqich ko'chirilsin.

═══════════════════════════════════════════════════════════════════
3. BUZILMAS QOIDALAR (buzilsa — ish rad etiladi)
═══════════════════════════════════════════════════════════════════
PUL
· Har safar mijoz-emissiyasi jami ≤ 350 tanga. Yagona darvoza: grantRideCoins().
· Hamma tanga operatsiyasi CoinTxn + idempotent kalit bilan. Mijozga hech qachon ishonmaysan.
· Yangi pul-kanali OCHMAYSAN. Mavjud yo'llarni qayta ishlatasan (rollRideCashback,
  grantCoins, transfer). Yangi kanal kerak bo'lsa — avval egadan so'ra.
· «coin» so'zi UI'da yo'q — hamma joyda «tanga».

ARXITEKTURA
· YANGI POLLER YO'Q. Davriy ish mavjud sweep'ga (bookingNotifier.pushBookingUpdates)
  yoki 15-daqiqalik tick'ga ulanadi.
· Har yangi mexanika kill-switch bayrog'i ortida (featureFlags.ts, DEFAULT_OFF).
  Bayroq OFF = bugungi xatti-harakat AYNAN, bitta ham kod yo'li ishga tushmaydi.
· Sof mantiq (holat-mashina, hisob, saralash) packages/shared ga chiqadi va vitest bilan
  qoplanadi. Nusxa YO'Q — server, bot, miniapp, admin bir manbadan import qiladi.
· Prisma o'zgarishi faqat QO'SHIMCHA. Mavjud ustunni o'chirish/o'zgartirish — alohida ega qarori.

JARAYON
· Bitta shoxobcha: main (yoki ega bergan shoxobcha). Yangi shoxobcha ochilmaydi.
· Sxema o'zgarishi VPS'da, kod push'idan OLDIN, alohida ongli qadam. deploy.sh db push QILMAYDI.
· Deploy avtomatik: main'ga push → CI (typecheck + vitest + simEconomy/simLoyalty/simGuards)
  → yashil bo'lsa VPS'ga chiqadi. CI qizil bo'lsa deploy TO'XTAYDI.
· ⛔ Neon bazasiga hech narsa yozilmaydi. U muzlatilgan eski nusxa.

DIZAYN (haydovchi ilovasi uchun ayniqsa)
· Bitta ekran — bitta qaror. Haydovchi mashina haydayapti.
· Har bosishda <100 ms vizual javob. Server javobi kutilmaydi.
· NaN, «undefined», bo'sh kulrang kvadrat ekranga chiqmaydi.
· Ma'lumot yo'q bo'lsa — element ham yo'q. Soxta raqam ko'rsatishdan ko'ra bo'sh joy yaxshi.
· Yozuv harakat va'da qilsa — bosiladigan tugma bo'lishi SHART.

═══════════════════════════════════════════════════════════════════
4. BOSQICHLAR — tartib qat'iy, oldingisi qabul bo'lmaguncha keyingisi boshlanmaydi
═══════════════════════════════════════════════════════════════════
F1  SERVER YADROSI (2–3 kun)
    dispatchService.ts, bot/dispatch.ts, mijoz oqimi integratsiyasi, sweep ulanishi,
    /api/dispatch/* marshrutlari. Bayroq owndispatch ortida.
    QABUL: ega o'z telefonidan haydovchi bo'lib liniyaga chiqadi, ikkinchi telefondan
    buyurtma beradi, taklif keladi, qabul qiladi, safarni yakunlaydi, tanga tushadi.

F2  BirJoySource (1–2 kun)
    KasDataSource ning uchinchi implementatsiyasi. KAS_MODE=own bilan butun ilova
    o'z dispetcherligida ishlaydi.
    QABUL: KAS_MODE=own da mijoz miniapp'i, bot, admin paneli — hammasi ishlaydi.

F3  DISPETCHER KONSOLI (2–3 kun)
    admin v2 ga yangi bo'lim. DISPATCH_PLAN.md §9.
    QABUL: operator kas1067 panelini ochmasdan butun kunni o'tkazadi.

A1–A6  HAYDOVCHI APK (3–4 hafta)
    DRIVER_APK_PLAN.md §10 dagi olti bosqich. Har bosqich alohida sinov bilan.
    QABUL: DRIVER_APK_PLAN.md §0 dagi 10 o'lchovning HAMMASI real eski telefonda
    o'lchanган va raqam bilan yozilgan.

F5  RATSIYA (3–4 kun)
    Real vaqtli PTT. DISPATCH_PLAN.md §10.

Har bosqich: alohida commit, alohida ega sinovi, PROGRESS.md ga literal haqiqat.

═══════════════════════════════════════════════════════════════════
5. O'LCHANADIGAN MAQSADLAR — «yaxshi» degan gap emas, raqam
═══════════════════════════════════════════════════════════════════
DISPETCHERLIK
· Buyurtmadan haydovchi qabuligacha o'rtacha: ≤ 30 soniya (liniyada ≥3 haydovchi bo'lganda)
· Ikki haydovchi bir buyurtmani olishi: 0 ta (DB darajasida imkonsiz bo'lsin)
· Yakun mukofoti ikki marta berilishi: 0 ta (idempotent kalit)

HAYDOVCHI ILOVASI (eng sekin sinov telefonida o'lchanadi)
· 8 soatlik smenada o'tkazib yuborilgan buyurtma: 0 ta
· Batareya sarfi 8 soatda: ≤ 25%
· Sovuq ochilish: ≤ 1.0 s
· Taklif serverdan → ekranda ko'rindi: ≤ 2.0 s
· APK hajmi: ≤ 6 MB · RAM: ≤ 120 MB · kunlik trafik: ≤ 5 MB

Har raqam buyruq yoki o'lchov natijasi bilan isbotlanadi. Isbotsiz raqam yozilmaydi.

═══════════════════════════════════════════════════════════════════
6. TAYYORLIK PROTOKOLI (CLAUDE.md R1–R8, majburiy)
═══════════════════════════════════════════════════════════════════
· Sen HECH QACHON «done / tayyor / bajarildi» demaysan. Faqat «READY FOR VERIFICATION»
  + buyruq va uning XOM natijasi. «Done» — eganing so'zi.
· Kod yozishdan OLDIN qabul mezonlarini yozasan va egadan tasdiq olasan.
· «Hammasi», «0 ta xato», «hamma joyda» kabi da'volar BUTUN repo bo'ylab buyruq + natija
  bilan isbotlanadi. Faqat bir qismini tekshirgan bo'lsang — nimani QAMRAMAGANingni aytasan.
· Yopishdan oldin DA'VO ↔ HAQIQAT jadvali: element / kodda? / jonli? / bayroq ortidami? /
  nima bilan isbot / gap. Har gap nomi bilan ochiq yoziladi.
· Qisman bajarilgan ish «qisman» deb aytiladi. Bitta isbotlanmagan mezon = butun tiket
  tayyor EMAS. Tezlik hech qachon yuqoriga yaxlitlamaydi.
· PROGRESS.md — literal haqiqat. Holat aniq bittasi: not started / in progress (gaps: …) /
  ready for verification / owner-accepted.

═══════════════════════════════════════════════════════════════════
7. TEKSHIRUV BUYRUQLARI (har commit'dan oldin)
═══════════════════════════════════════════════════════════════════
pnpm -r typecheck
pnpm --filter @t1067/shared test
pnpm --filter @t1067/server exec tsx src/scripts/simEconomy.ts
pnpm --filter @t1067/server exec tsx src/scripts/simLoyalty.ts
pnpm --filter @t1067/server exec tsx src/scripts/simGuards.ts
pnpm --filter @t1067/miniapp build
pnpm --filter @t1067/admin build

Bayroq OFF regressiyasi ALOHIDA tekshiriladi: bayroq o'chiq bo'lganda eski oqim AYNAN
ishlashi kodda ko'rsatiladi.

═══════════════════════════════════════════════════════════════════
8. NIMA QILMAYSAN
═══════════════════════════════════════════════════════════════════
· Ishlayotgan kas oqimini o'chirmaysan. Yangi tizim bayroq ortida yonma-yon turadi,
  ega qabul qilgach kas yo'li o'chiriladi.
· Testni o'chirib yoki chetlab o'tib «yashil» qilmaysan.
· Mavjud jadval ustunini o'chirmaysan.
· Bir vaqtda ikki bosqichni boshlamaysan.
· Ega so'ramagan funksiya qo'shmaysan. G'oya bo'lsa — rejaga yozasan, kodga emas.
· Prod bazasiga sinov yozuvi yozmaysan. Sweep testlari alohida bazani talab qiladi.
· Jonli mijozga yoki haydovchiga sinov xabari yubormaysan.

═══════════════════════════════════════════════════════════════════
9. SHU REPO TARIXIDAN CHIQQAN TUZOQLAR (haqiqiy xatolar)
═══════════════════════════════════════════════════════════════════
· Bot handlerlarining RO'YXATDAN O'TISH TARTIBI muhim. Matnni ushlaydigan handler
  lazy import().then() bilan qo'shilsa, u eng oxirida ulanadi va komanda o'lik bo'ladi.
  Sessiya-matnini ushlaydigan har modul SINXRON va booking'dan OLDIN registratsiya qilinadi.
· sweep («pushBookingUpdates») 900+ qatorli, mo'rt funksiya. Unga ehtiyotkorlik bilan,
  kichik va bayroq ortida ulanadi. Har a'zo uchun ish arzon bo'lishi shart.
· Sxema VPS'da qo'llanmasdan kod chiqarilsa — har so'rov yiqiladi. Tartib: db push AVVAL.
· Bayroq faqat DB qatorida yashaydi. Ega qabul qilgan funksiya EXPECTED_ON ro'yxatiga
  qo'shiladi, aks holda baza tiklansa u jimgina o'chib qoladi.
· Tor grep bilan «hammasi tekshirildi» degan xulosa noto'g'ri chiqqan. Butun repo bo'ylab tekshir.
· Ega-preview qorong'i bayroqni yashiradi: «ega ko'rdi» ≠ «mijoz ko'radi». Real akkaunt
  bilan tekshirilmaguncha READY deyilmaydi.

═══════════════════════════════════════════════════════════════════
10. BIRINCHI QADAM — hozir shuni qil
═══════════════════════════════════════════════════════════════════
1. Yuqoridagi 6 hujjatni o'qi.
2. packages/server/src/kas/types.ts va index.ts ni o'qi — KasDataSource seam'ini tushun.
3. git log bilan oxirgi commitlarni ko'r: DISPATCH_PLAN.md, DRIVER_APK_PLAN.md, Prisma
   jadvallari (DriverShift, DispatchRide, DispatchOffer), owndispatch bayrog'i va
   shared/src/dispatch.ts ALLAQACHON MAVJUD. Ularni qayta yozma — ustiga qur.
4. F1 uchun ANIQ reja chiqar: o'zgaradigan fayllar ro'yxati, yondashuv, xavflar,
   qabul mezonlari (har biri tekshiruv buyrug'i bilan).
5. TASDIQNI KUT. Tasdiqsiz kod yozma.
```

## §PROMPT tugadi ⬆️

---

## Nega prompt shunday yozildi (siz uchun izoh)

| Qism | Nega kerak |
|---|---|
| **O'qish tartibi** | Claude kontekstni to'g'ri yig'masa, mavjud kodni takrorlaydi yoki buzadi |
| **KasDataSource seam** | Eng katta texnik yutuq. 126 ta chaqiruvni qo'lda o'zgartirish o'rniga bitta interfeys implementatsiyasi |
| **Buzilmas qoidalar** | Pul xatosi qaytarib bo'lmaydigan zarar. Bayroq — orqaga qaytish tugmasi |
| **O'lchanadigan maqsadlar** | «10x yaxshi» tekshirib bo'lmaydi, «8 soatda 0 ta o'tkazib yuborish» tekshiriladi |
| **R1–R8 protokoli** | Bu repoda ilgari «tayyor» deyilgan ish aslida tugamagan edi. Protokol shuni yopadi |
| **Tuzoqlar ro'yxati** | Har biri shu loyihada haqiqatan sodir bo'lgan xato. Yangi sessiya ularni takrorlamasin |
| **«Tasdiqni kut»** | Katta ishni noto'g'ri yo'nalishda boshlash eng qimmat xato |

## Prompt bilan birga bering

1. **Bu repo** (`1067-taxi-bot`) — Claude Code sessiyasida ochilgan bo'lsin.
2. **Sinov telefonlari** haqida ma'lumot — DRIVER_APK_PLAN.md §12.1.
3. **kas1067 APK dekompilyatsiyasi** bo'lsa — `client-apk-decomp/` papkasini qaytaring.
4. Qaysi bosqichdan boshlashni ayting: F1 (server) yoki to'g'ridan-to'g'ri A1 (APK).
