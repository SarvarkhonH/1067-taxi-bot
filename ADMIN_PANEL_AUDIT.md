# ADMIN / DISPETCHER PANEL — TO'LIQ AUDIT

**Sana:** 2026-09-10 · **Qamrov:** `1067-taxi/apps/web` (26 sahifa, 9 820 qator) + `1067-taxi/apps/api`
(40 controller, ~250 endpoint) · **Metod:** har sahifa ochib o'qildi; har frontend chaqiruvi API
route'lari bilan ikki tomonlama solishtirildi (UI→API va API→UI).

**Manbalar solishtirildi:** `ADMIN_QOSHIMCHALAR.md` · `BIRJOY_TAXI_MASTER.md` §B ·
`TAXI_YADRO_AUDIT.md`. Har topilma **[YANGI]** yoki **[MA'LUM]** deb belgilangan.
`TAXI_YADRO_AUDIT.md:525` o'zi tan oladi: *«26 sahifadan faqat 4 tasi o'qilgan, qolgan 22 tasi
sanaldi, o'qilmadi»* — quyidagi topilmalarning ko'pi aynan o'sha 22 sahifadan chiqdi.

---

## 1. HALOL XULOSA — panel qanchalik tayyor?

**Haqiqiy tayyorlik: ~55%.** Kod *hajmi* bo'yicha panel katta va puxta ko'rinadi — 26 sahifa,
zamonaviy dizayn, jonli xarita, soket, taxminiy narx, hujjat tekshiruvi, top-up parollari. Lekin
dispetcherlik xonasida **kunlik ishlatib bo'ladigan** qismi yarmidan sal ko'p. Bu raqam quyidagi
o'lchovlarga asoslanadi: **(a)** 26 sahifadan **8 tasi umuman ma'lumot yuklay olmaydi** — ular
API'ning noto'g'ri manzilini chaqiradi (`/api/v1` prefiksi yo'q), ya'ni Audit, Adminlar, Mijozlar,
Mijoz kartasi, Tizim, Hisobotlar, Qo'llab-quvvatlash, Xavfsizlik sahifalari **jonli tizimda bo'sh
ekran**; **(b)** qolgan 18 sahifadan **7 tasida kamida bitta tugma mavjud bo'lmagan endpoint'ga
uriladi** (404) — jumladan operator konsolining «Haydovchi biriktirish» va «Bekor qilish»
tugmalari; **(c)** backend'da **17 ta endpoint oilasi** (korporativ, fleet, geofence, incentives,
promos, navbat, shaharlararo, kutayotgan haydovchilar, kutayotgan hujjatlar, komissiya balanslari,
mijoz qora ro'yxati…) qurilgan, lekin ularni chaqiradigan **birorta UI yo'q**; **(d)** rol
tekshiruvi (`RolesGuard`) yozilgan lekin **hech qayerda ulanmagan** — dispetcher ham super-admin
ishini qila oladi; **(e)** audit jurnali sahifasi bor, servisi bor, lekin unga **hech qachon hech
narsa yozilmaydi**; **(f)** admin sessiyasi **15 daqiqada tugaydi va yangilanmaydi** — operator
smena davomida ~30 marta qayta login qiladi va har safar operator ekranidagi butun navbatni
yo'qotadi. Ijobiy tomoni: buyurtma qabul qilish (telefon orqali), mijoz CRM kartasi, narx
hisoblash, haydovchi tasdiqlash/hujjat tekshirish, balans to'ldirish, buyurtma kartasi va dispatch
izi — bular **haqiqatan ham ishlaydi va sifatli yozilgan**.

---

## 2. TOPILMALAR JADVALI

Tartib: BLOKER → KATTA → O'RTA → KICHIK. `S` = 1 kundan kam, `M` = 1-3 kun, `L` = 3+ kun.

### 🔴 BLOKER

| # | Nima buzilgan | Isbot (file:line) | Dispetcher uchun nega muhim | Hajm |
|---|---|---|---|---|
| B1 | **8 ta sahifa API'ning noto'g'ri manzilini chaqiradi** — hech qanday `NEXT_PUBLIC_API_URL` qiymati ikkalasini birga ishlatolmaydi. `apiClient` `…/api/v1` qo'shadi, xom `fetch` sahifalari esa hech narsa qo'shmaydi. **[YANGI]** | `apps/web/src/lib/api.ts:7` (`+ '/api/v1'`) vs `audit/page.tsx:7`, `admins/page.tsx:7`, `clients/page.tsx:8`, `clients/[id]/page.tsx:9`, `system/page.tsx:7`, `reports/page.tsx:7`, `support/page.tsx:7`, `safety/page.tsx:7` (hammasi `NEXT_PUBLIC_API_URL \|\| 'http://localhost:4000/api'`). Server: `apps/api/src/main.ts:92` `setGlobalPrefix('api')` + `:96` `enableVersioning(URI, '1')` → hamma route `/api/v1/*`. Env: `apps/web/.env.example:1` = `http://localhost:4000`, `docker-compose.prod.yml:52` = `…/api` — ikkisi bir-biriga zid | Mijozlar ro'yxati, SOS xavfsizlik markazi, qo'llab-quvvatlash tiketlari, audit va hisobotlar **jonli tizimda ochilmaydi**. Xato ham chiqmaydi — shunchaki bo'sh jadval. Operator «mijoz bazasi yo'q» deb o'ylaydi | **S** |
| B2 | **Rol tekshiruvi backend'da umuman yo'q.** `RolesGuard` va `@Roles()` yozilgan, lekin butun API bo'ylab **0 marta** ishlatilgan | `apps/api/src/common/guards/admin-auth.guard.ts:13-29` (ta'rif). `grep -rn "@Roles(\|RolesGuard" src` → faqat shu fayl. Menyu faqat frontend'da yashiriladi: `apps/web/src/components/layout/Sidebar.tsx:80-82` | `dispatcher` rolidagi operator brauzerda `/dashboard/admins` yozsa — sahifa ochiladi **va API qabul qiladi**: yangi `super_admin` yaratadi, narxni o'zgartiradi, haydovchi balansini o'zgartiradi. Pul bor tizimda bu ochiq eshik. `TAXI_YADRO_AUDIT.md:352` «RolesGuard ✅ bor» degan — **bor, lekin ulanmagan** | **M** |
| B3 | **Audit jurnaliga hech qachon yozilmaydi.** `AuditService.log()` butun repoda **0 marta chaqirilgan** | `apps/api/src/modules/audit/audit.service.ts:12-31` — yagona `insert`. `grep -rl "AuditService"` → faqat `audit.controller.ts`, `audit.module.ts`, `audit.service.ts` | Kim buyurtmani bekor qildi? Kim 500 000 so'm balans qo'shdi? Kim narxni ko'tardi? Kim haydovchini bloklab qo'ydi? **Javob yo'q va hech qachon bo'lmaydi.** Audit sahifasi abadiy bo'sh | **M** |
| B4 | **Operator konsolining «Haydovchi biriktirish» tugmasi mavjud bo'lmagan endpoint'ga uriladi (404)** | `apps/web/.../operator/page.tsx:674` → `POST /operator/orders/assign`. `apps/api/.../operator/operator.controller.ts` da bunday route **yo'q**; bor bo'lgani: `:95` `POST dispatch/manual`, `:107` `PATCH orders/:id/reassign` | Kam haydovchi bo'lgan bozorda **qo'lda tayinlash — operatorning eng muhim quroli**. Hozir har bosishda «Haydovchini biriktirishda xatolik» chiqadi. Buyurtma qutqarilmaydi | **S** |
| B5 | **Operator konsolining «Bekor qilish» tugmasi ham 404** | `operator/page.tsx:701` → `POST /operator/orders/{id}/cancel`. `apps/api/.../orders/orders.controller.ts:172` da faqat `PATCH :id/cancel-admin` bor | Operator ekranidan buyurtmani bekor qila olmaydi. Buyurtma kartasiga o'tib boshqa tugmani topishi kerak — mijoz telefonda kutadi | **S** |
| B6 | **Operator konsoli ochilganda faol buyurtmalarni umuman yuklamaydi.** `activeOrders` faqat (a) shu sessiyada yaratilgan buyurtma yoki (b) soket eventi bilan to'ladi | `operator/page.tsx:210-211` (bo'sh state), `:264-292` (poll **faqat mavjud ro'yxatni** yangilaydi), `:653-655` (mount'da faqat haydovchilar yuklanadi). Kerakli endpoint allaqachon bor va `no_drivers` ni ham qaytaradi: `apps/api/.../orders/orders.service.ts:852-879` | **F5 bosilsa yoki 15 daqiqalik sessiya tugasa — butun navbat yo'qoladi.** «Haydovchi topilmadi» buyurtmalari (K1 qutqarish navbati) ekranda ko'rinmaydi. Ikkinchi operator ishga kirsa — bo'sh ekran ko'radi | **S** |
| B7 | **Admin sessiyasi 15 daqiqada tugaydi, yangilash endpoint'i yo'q.** Backend `refreshToken` yaratadi va `adminSessions` ga yozadi, lekin uni ishlatadigan route yo'q; frontend uni saqlamaydi ham | `apps/api/.../auth/auth.module.ts:24` (`JWT_ACCESS_EXPIRES_IN` default `15m`), `auth.service.ts:352-366` (refresh yaratiladi), `auth.controller.ts:40` (faqat `driver/token/refresh`), `apps/web/src/store/auth.ts:26-34` (faqat `accessToken` saqlanadi), `apps/web/src/lib/api.ts:15-19` (401 → localStorage tozalanadi → `/login`) | Smena davomida ~30 marta majburiy qayta login. Har safar B6 tufayli **operator navbati ham nolga tushadi**. Qo'ng'iroq o'rtasida ekran login'ga sakraydi. **[MA'LUM]** — `TAXI_YADRO_AUDIT.md:485` P1-1, lekin u B6 bilan birga BLOKER darajasiga chiqadi | **S** |
| B8 | **`PATCH /drivers/:id` istalgan ustunni yozadi (mass assignment).** Body `Record<string, any>` va to'g'ridan-to'g'ri `db.update().set()` ga uzatiladi | `apps/api/.../drivers/drivers.controller.ts:64-70` (`@Body() body: Record<string, any>`), `drivers.service.ts:97-100` (`set({ ...data })`) | Har qanday admin-token egasi (B2 tufayli dispetcher ham) `{"balanceUzs": 99999999}` yoki `{"verifyStatus":"approved"}` yuborib **top-up parolini, tasdiqlash oqimini va butun moliyaviy nazoratni chetlab o'tadi**. Bu sahifadagi «Tahrirlash» tugmasi shu endpoint'ni ishlatadi, ya'ni u jonli va yetib boriladi | **S** |
| B9 | **`POST /scheduled-rides` va `PATCH /scheduled-rides/:id/cancel` — autentifikatsiyasiz.** Faqat `GET` himoyalangan | `apps/api/.../scheduled-rides/scheduled-rides.controller.ts:9` (`@Post()` guardsiz), `:22` (`@Patch(':id/cancel')` guardsiz) vs `:27-28` (`@Get()` + `@UseGuards(AdminAuthGuard)`) | Internetdagi har kim rejali safar yaratishi yoki mijozning safarini bekor qilishi mumkin | **S** |

### 🟠 KATTA

| # | Nima buzilgan | Isbot (file:line) | Dispetcher uchun nega muhim | Hajm |
|---|---|---|---|---|
| K1 | **Buyurtma kartasidagi «Narxni o'zgartirish» 404** | `orders/[id]/page.tsx:189` → `PATCH /orders/{id}`. `orders.controller.ts` da `@Patch(':id')` **yo'q** | Taximetr xato hisoblasa yoki mijoz shikoyat qilsa — narxni tuzatib bo'lmaydi | **S** |
| K2 | **Buyurtma kartasidagi «Ichki izoh» 404** | `orders/[id]/page.tsx:171` → `PATCH /operator/orders/{id}/note`. `operator.controller.ts` da faqat `client/:id/notes` (`:120`) bor | Smena topshirilganda «bu mijoz ikki marta qo'ng'iroq qildi» kabi izoh yozib bo'lmaydi | **S** |
| K3 | **Qo'llab-quvvatlash: «Javob berish va yopish» 404 va xato ham chiqmaydi** | `support/page.tsx:38-48` → `PATCH /support/tickets/{id}` (natija tekshirilmaydi). API'da: `support.controller.ts:41` `tickets/:id/respond`, `:51` `/resolve`, `:57` `/priority` | Tiketga javob yozilib «Yuborildi» taassuroti beriladi, aslida hech narsa saqlanmaydi. (B1 tufayli bu sahifa allaqachon bo'sh, ya'ni ikki qavat buzilgan) | **S** |
| K4 | **Haydovchi kartasidagi safar tarixi hech qachon chiqmaydi** — 404 jimgina yutiladi | `drivers/[id]/page.tsx:141` → `GET /drivers/{id}/orders` + `.catch(() => null)`. `drivers.controller.ts` da bunday route yo'q | «Bu haydovchi so'nggi 10 safarda nima qilgan?» — shikoyatni tekshirishning asosiy oynasi doim bo'sh | **S** |
| K5 | **Buyurtmalar sahifasidagi qidiruv maydoni hech narsa qilmaydi** — parametr yuboriladi, server e'tiborsiz qoldiradi | `orders/page.tsx:46` (`search` yuboriladi), `orders/dto/orders.dto.ts:107-109` (DTO qabul qiladi), `orders.service.ts:891-908` — `where` faqat `status` dan quriladi, `search` **ishlatilmaydi** | «Mening taksim qani?» qo'ng'irog'ida operator buyurtmani telefon raqami yoki ID bo'yicha topa olmaydi. Jadvalda telefon ustuni ham yo'q (`orders/page.tsx:99`) | **S** |
| K6 | **Audit sahifasidagi tur filtrlari (buyurtma/haydovchi/admin/to'lov/mijoz) server tomonda e'tiborsiz** | `audit/page.tsx:31-36` (tugmalar), `audit.controller.ts:17-21` — izoh: *«entityType filtering can be added later»* | 5 ta tugma bosiladi, natija o'zgarmaydi | **S** |
| K7 | **Sozlamalar sahifasidagi 22 kalitdan 16 tasini hech qanday kod o'qimaydi** — o'zgartirish hech narsaga ta'sir qilmaydi | `settings/page.tsx:35-128` (TABS ro'yxati) vs `apps/api/.../settings/settings.service.ts:7-17` (`DEFAULT_SETTINGS` — atigi 9 kalit). Repo bo'ylab 0 o'quvchi: `SURGE_ENABLED`, `SURGE_DEMAND_THRESHOLD`, `SURGE_MAX_MULTIPLIER`, `SURGE_COOLDOWN_MIN`, `SAFETY_MAX_DAILY_HOURS`, `SAFETY_FATIGUE_WARN_HOURS`, `SAFETY_MAX_SPEED_KMH`, `SAFETY_ROUTE_DEVIATION_M`, `NOTIF_TRIP_ACCEPTED`, `NOTIF_TRIP_ARRIVED`, `NOTIF_TRIP_COMPLETED`, `NOTIF_NO_DRIVERS`, `BRAND_APP_NAME`, `BRAND_SUPPORT_PHONE`, `BRAND_SUPPORT_TELEGRAM`, `BRAND_CITY_NAME` | Ega «surge'ni o'chirdim», «xabarlarni o'chirdim» deb ishonadi — **hech narsa o'chmaydi**. Bu eng xavfli tur: yolg'on nazorat. Maydonlar bo'sh ko'rinadi, chunki DB'da ham yo'q | **M** |
| K8 | **CTI (qo'ng'iroq) uzatmasi uzilgan.** Kelgan qo'ng'iroq oynasi `?phone=…&autoLookup=1` bilan operator sahifasiga o'tadi, lekin operator sahifasi **query parametrlarni umuman o'qimaydi** | `IncomingCallPopup.tsx:32` (`router.push('/dashboard/operator?phone=…')`). `grep -rn "useSearchParams\|searchParams" apps/web/src` → **0 natija** | `BIRJOY_TAXI_MASTER.md:299` «maqsad 20 soniya» oqimi ishlamaydi: raqam avtomatik to'lmaydi, mijoz kartasi ochilmaydi. Operator raqamni qo'lda qayta teradi | **S** |
| K9 | **Operator kartasida haydovchi ismi/mashinasi hech qachon chiqmaydi** — ma'lumot shakli mos emas | `operator/page.tsx:59-61` (tekis `driverName`/`carNumber` kutiladi), `:272-286` (poll `GET /orders/:id` javobini spread qiladi), `:621-627` (soket). Lekin `orders.service.ts:804-815` haydovchini **`driver: {…}` ichida** qaytaradi, `socket.gateway.ts:293` esa xom `orders` qatorini yuboradi — ikkalasida ham tekis `driverName` yo'q | Operator «sizga Nexia 70Z888, Aziz aka keladi» deya olmaydi — o'z ekranida haydovchi ismini ko'rmaydi. Bu konsolning asosiy vazifasi edi | **S** |
| K10 | **Moliya sahifasidagi jami raqamlar noto'g'ri** — statistika oxirgi ≤100 qatordan hisoblanadi va faqat shu operatorning o'z amallarini qamraydi | `finance/page.tsx:55` (`limit: '100'`), `:73-81` (`totalDeposited` shu 100 qatordan). Server: `topup.controller.ts:56-80` — super-admin bo'lmasa `operatorId = me.sub`, ya'ni **faqat o'z tarixi** | «Jami kiritilgan» ko'rsatkichi bir necha kundan keyin haqiqatdan uziladi. Pul raqami noto'g'ri bo'lsa — butun sahifaga ishonch yo'qoladi. Pagination ham yo'q | **M** |
| K11 | **550 haydovchiga ommaviy xabar — tasdiqsiz bir bosishda.** Ustiga «Kimga yuborish» radio tugmasi umuman ulanmagan | `broadcast/page.tsx:84-91` (tasdiq yo'q), `:19` (faqat `{title, message}` yuboriladi), `:10` va `:58-78` (`target` state hech qayerda ishlatilmaydi) | Xato bosish = 550 haydovchiga xato push. Qaytarib bo'lmaydi. Nechtasiga yetib bordi — ko'rsatilmaydi | **S** |
| K12 | **Operator ekranida buyurtmani bekor qilish tasdiqsiz va sababsiz** | `operator/page.tsx:1449-1455` (tugma), `:699-709` (`cancelOrder` — `confirm()` yo'q, sabab so'ralmaydi) | Bitta noto'g'ri bosish jonli safarni o'ldiradi. Buyurtma kartasida sabab so'raladi (`orders/[id]/page.tsx:516-541`) — konsolda esa yo'q. Ikki xil xatti-harakat | **S** |
| K13 | **Haydovchi kartasiga bosilsa — qaysi buyurtmaga biriktirilishini tizim o'zi tanlaydi** | `operator/page.tsx:659-668` — `activeOrders.find(...)` birinchi mos buyurtmani oladi va shuni modal'ga qo'yadi | Ikkita kutayotgan buyurtma bo'lsa, operator haydovchini **boshqa mijozga** yuborib qo'yishi mumkin va buni bilmaydi | **S** |
| K14 | **`stats:update` soket eventi hech qachon yuborilmaydi** — dashboard KPI'lari jonli emas | `apps/web/src/hooks/useSocket.ts:135` (`socket.on('stats:update', setStats)`). `grep -rn "stats:update" apps/api/src` → **0** | KPI plitkalari faqat 30 soniyalik poll bilan yangilanadi (`dashboard/page.tsx:80`). Jonli ko'rinadi, lekin emas | **S** |
| K15 | **`dispatch:attempt_failed` va `dispatch:assigned` yuboriladi, lekin panel ularni tinglamaydi** | `socket.gateway.ts:328, 332` (emit). `apps/web/src` da bu nomlar **yo'q** | «5 urinishdan 3-si muvaffaqiyatsiz» signali operatorga yetib bormaydi — `BIRJOY_TAXI_MASTER.md:287` talab qilgan «nazorat signallari» yarim yo'lda to'xtagan | **S** |
| K16 | **17 ta backend imkoniyati uchun UI umuman yo'q** | Hech bir sahifa chaqirmaydi: `corporate.controller.ts` (8 route — korporativ mijozlar), `fleet.controller.ts` (6 — avtopark egalari), `geofence.controller.ts` (7 — xizmat zonalari/surge zonalari), `incentives.controller.ts` (6), `promos.controller.ts` (4), `queue.controller.ts` (2 — zona navbati), `intercity.controller.ts` (5), `drivers.controller.ts:128` (`GET /drivers/pending`), `driver-documents.controller.ts:98,104` (`pending`, `expiring`), `commissions.controller.ts:57,66,72` (`balances`, `summary/daily`, `revenue`), `operator.controller.ts:132,144,160,192,204` (VIP, qora ro'yxat, sevimli haydovchi, so'nggi qo'ng'iroqlar, operator statistikasi), `operator.controller.ts:107` (`reassign`), `payments.controller.ts:80,107` (refund, wallet topup), `vehicle-classes.controller.ts:20` (PUT), `tumans.controller.ts:15` (POST), `chat.controller.ts` (butun modul — operator haydovchi↔mijoz yozishmasini ko'ra olmaydi) | Yozilgan va ishlaydigan funksiyalarning katta qismi **yetib bo'lmaydigan**. Masalan: kutayotgan hujjatlar navbati yo'q — admin har haydovchini birma-bir ochib tekshirishi kerak; komissiya balanslari ro'yxati yo'q — kim qarzda ekanini ko'rib bo'lmaydi; qora ro'yxat/VIP endpoint'lari bor, tugmasi yo'q | **L** |
| K17 | **Build TypeScript va ESLint xatolarini e'tiborsiz qoldiradi** — yuqoridagi 6 ta 404 shu sababdan omon qolgan | `apps/web/next.config.ts:11-17` — `eslint.ignoreDuringBuilds: true`, `typescript.ignoreBuildErrors: true` | Panel «yashil» build bilan chiqadi, lekin ichida o'lik chaqiruvlar bor. Bu — yuqoridagi barcha 404'larning ildiz sababi | **S** |

### 🟡 O'RTA

| # | Nima buzilgan | Isbot (file:line) | Nega muhim | Hajm |
|---|---|---|---|---|
| O1 | Narx sahifasida `catch` yo'q — saqlash muvaffaqiyatsiz bo'lsa hech narsa aytilmaydi | `pricing/page.tsx:136-149` (`try/finally`, `catch` yo'q), `:203-215` (`load`, `setMultiplier`, `toggle` — umuman `try` yo'q) | Ega narxni o'zgartirdim deb o'ylaydi, aslida saqlanmagan | S |
| O2 | Obzvon sahifasida xato bo'sh holat kabi ko'rinadi | `outreach/page.tsx:75-85` (`catch` yo'q, `rows=[]` → `:158-161` «haydovchi yo'q») | Server yiqilsa «hamma haydovchi obzvon qilingan» degan yolg'on taassurot | S |
| O3 | Haydovchilar ro'yxatidagi Tasdiqlash/Rad/To'xtatish tugmalarida xato ushlanmaydi | `drivers/page.tsx:146-150, 155-160, 168-173` — `await apiClient.patch(...)` `try` siz | Tugma bosildi, hech narsa o'zgarmadi, sabab aytilmadi | S |
| O4 | Sozlamalar saqlashda xato yutiladi | `settings/page.tsx:159` — `catch {}` | Dispatch radiusi saqlanmasa ham «Saqlandi» ko'rinishi mumkin emas, lekin xato ham ko'rinmaydi | S |
| O5 | Mijozlar qidiruvida debounce yo'q — har harfda so'rov | `clients/page.tsx:45` (`useEffect(..., [page, search, vipFilter])`) | 10 harfli qidiruv = 10 ta so'rov. Haydovchilar sahifasida to'g'ri qilingan (`drivers/page.tsx:67-74`) — bir xil emas | S |
| O6 | Mijoz kartasi VIP o'zgargach butun sahifani qayta yuklaydi | `clients/[id]/page.tsx:41` — `window.location.reload()` | Sekin, holat yo'qoladi; xato bo'lsa ham qayta yuklaydi (natija tekshirilmaydi) | S |
| O7 | Mijoz kartasida xato holati yo'q — 500 xatosi «Mijoz topilmadi» deb ko'rinadi | `clients/[id]/page.tsx:27-30` (faqat `res.ok`), `:45` | Operator mijoz o'chirilgan deb o'ylaydi | S |
| O8 | Dashboard'dagi faol buyurtmalar kartalari bosiladigan ko'rinadi, lekin bosilmaydi | `components/orders/ActiveOrdersList.tsx:22` — `cursor-pointer` bor, `onClick` **yo'q** | `DIZAYN_QOIDALARI` buzilishi: harakat va'da qilingan, bajarilmaydi. Buyurtmaga o'tish yo'li yo'q | S |
| O9 | Haydovchi kartasi bahosi/qabul foizi bo'lmasa **soxta 5.0 va 100%** ko'rsatadi | `drivers/[id]/page.tsx:409` (`driver.avgRating ? … : '---'` — bu to'g'ri), lekin `:410` `Number(driver.acceptanceRate \|\| 100)` va `:446-448` `Number(driver.avgRating \|\| 5)` | Yangi haydovchi «5.0 ★ / 100%» bo'lib ko'rinadi — operator unga ishonib buyurtma beradi. Yolg'on ma'lumot eng yomon turi | S |
| O10 | Xarita markazi va standart olish nuqtasi ~56 km farq qiladi | `components/map/LiveMap.tsx:7` `[39.035, 65.590]` vs `operator/page.tsx:24-25` `38.5327, 65.5904` | Ikkalasidan biri xato. Manzil tanlanmaganda buyurtma noto'g'ri koordinata bilan yaratiladi | S |
| O11 | Operator bo'sh haydovchilarni **shahar markazidan 200 km radiusda** qidiradi, buyurtma nuqtasidan emas | `operator/page.tsx:594-596` — `{ lat: KOSON_LAT, lng: KOSON_LNG, radius: 200 }` | Ko'rsatilgan «km» masofasi mijozga emas, markazga nisbatan. Operator eng yaqin mashinani tanlay olmaydi | M |
| O12 | Faol buyurtmalar har 10 soniyada **birma-bir** so'raladi (N+1) | `operator/page.tsx:264-292` — har buyurtma uchun alohida `GET /orders/:id` | 20 faol buyurtma × 2 operator = 4 so'rov/soniya faqat pollingdan. 100+ buyurtma/kun rejimida bu o'sib boradi. `GET /orders/active` bitta so'rovda hammasini beradi | S |
| O13 | Rejali safar yaratish shakli **mijoz ID raqamini va xom lat/lng** so'raydi | `scheduled/page.tsx:183-190` (Mijoz ID), `:233-278` (4 ta koordinata maydoni) | Operator mijozning ichki ID raqamini bilmaydi. Bu ishlab chiquvchi shakli, operator shakli emas. Amalda ishlatib bo'lmaydi | M |
| O14 | `GET /topup/operators` ruxsat yo'qligida **200 + `{error}`** qaytaradi | `topup.controller.ts:85-93` | Frontend `.map()` chaqirsa oq ekran. Hozir faqat frontend-gating himoya qilyapti (`settings/page.tsx:139`) | S |
| O15 | Audit sahifasida yuklanish/xato/bo'sh holat yo'q, «Keyingi» tugmasi hech qachon o'chmaydi | `audit/page.tsx:19` (`setLogs([])` — xato ham bo'sh), `:63-64` (`disabled` yo'q) | Bo'sh sahifa = «audit yo'q»mi yoki «server yiqilgan»mi — bilib bo'lmaydi | S |
| O16 | Panelda **jonli xaritadan hech qanday amal qilib bo'lmaydi** | `LiveMap.tsx:171-223` — marker'larda faqat `bindTooltip`, `onClick` yo'q | Operator xaritada mashinani ko'radi, lekin uni bosib buyurtma bera olmaydi. `ADMIN_QOSHIMCHALAR.md:60-75` dagi «o'ng panel» oqimi mavjud emas | M |
| O17 | Hujjat/haydovchi tasdiqlashda audit yo'q, tasdiq oynasi ro'yxatda yo'q | `drivers/page.tsx:146-173` (ro'yxatda tasdiqsiz), `drivers/[id]/page.tsx:637-646` (kartada tasdiq bor) | Bir xil amal ikki joyda ikki xil xavfsizlik darajasida | S |
| O18 | Ballarni qo'lda o'zgartirish tasdiqsiz va xatosiz | `gamification/page.tsx:85-88` — `adjust()` da `confirm` ham, `catch` ham yo'q | Ball = pul. Tasdiqsiz o'zgartirish + audit yo'q (B3) = nazoratsiz | S |
| O19 | Ko'p sahifada dizayn tokenlari o'rniga qattiq `zinc-*`/`amber-*` ranglar | `outreach/page.tsx:102`, `settings/phones/page.tsx:53`, `pricing/page.tsx:155`, `gamification/page.tsx:91`, `IncomingCallPopup.tsx:42` | `CLAUDE.md` «Faqat design/tokens dan rang» qoidasi buzilgan. Light rejimda bu sahifalar o'qib bo'lmaydigan bo'ladi | M |

### ⚪ KICHIK

| # | Nima | Isbot |
|---|---|---|
| S1 | O'lik state: `ordersLoading` e'lon qilingan, hech qayerda ishlatilmagan | `operator/page.tsx:211` |
| S2 | O'lik komponent: `ConfirmDialog` yozilgan, chaqirilmagan | `orders/[id]/page.tsx:36-64` |
| S3 | O'lik o'zgaruvchi: `isSuperAdmin` hisoblanadi, ishlatilmaydi (rol gating rejalashtirilgan-u tashlab ketilgan) | `finance/page.tsx:40` |
| S4 | `Ctrl+R` brauzer yangilashini o'g'irlaydi | `operator/page.tsx:309-312` |
| S5 | API token `alert()` orqali ochiq ko'rsatiladi | `settings/phones/page.tsx:49` |
| S6 | Leaflet CSS `@import` bilan komponent ichida yuklanadi (unpkg CDN'ga bog'liq) | `LiveMap.tsx:227-230` |
| S7 | Ilova nomi `1067 Taxi` — xotira eslatmasiga ko'ra brend **BirJoy** | `Sidebar.tsx:124`, `login/page.tsx` |
| S8 | Xarita marker'lari `innerHTML` bilan quriladi — haydovchi ismi/raqami escape qilinmaydi | `LiveMap.tsx:51-106` |

---

## 3. ENG KATTA 10 KAMCHILIK (ustuvorlik tartibida)

1. **8 sahifa jonli tizimda umuman ishlamaydi** (`/api/v1` prefiksi yo'q) — Mijozlar, SOS, Tiketlar,
   Audit, Hisobotlar, Adminlar, Tizim. *Bitta qatorli tuzatish, eng katta samara.* → B1
2. **Operator konsolining ikki asosiy tugmasi 404** — «Haydovchi biriktirish» va «Bekor qilish».
   Qo'lda qutqarish — kam haydovchili bozorda tizimning butun ma'nosi. → B4, B5
3. **Operator konsoli ochilganda navbatni yuklamaydi** — F5 yoki 15 daqiqalik sessiya tugashi butun
   ekranni tozalaydi; `no_drivers` qutqarish navbati ko'rinmaydi. → B6
4. **Har 15 daqiqada majburiy login** — refresh endpoint yo'q, kol-markazda qabul qilib bo'lmaydi;
   3-band bilan birga ishlab bo'lmaydigan holat yaratadi. → B7
5. **Rol tekshiruvi backend'da yo'q** — dispetcher super-admin ishini qila oladi (narx, balans,
   yangi admin yaratish). Menyu yashirilishi himoya emas. → B2
6. **Audit jurnaliga hech qachon yozilmaydi** — pul va buyurtma bilan bog'liq hech bir amalning izi
   qolmaydi. Nizo chiqsa isbot yo'q. → B3
7. **Sozlamalardagi 16 kalit yolg'on nazorat** — surge, xavfsizlik chegaralari, xabar bayroqlari,
   brend — o'zgartirasiz, hech narsa o'zgarmaydi. → K7
8. **Buyurtmalarni qidirib bo'lmaydi** (server `search` ni e'tiborsiz qoldiradi) va jadvalda telefon
   ham, haydovchi ham yo'q — «taksim qani?» qo'ng'irog'iga javob berib bo'lmaydi. → K5
9. **Operator ekranida haydovchi ismi/mashinasi chiqmaydi** (ma'lumot shakli mos emas) —
   konsolning asosiy vazifasi bajarilmaydi. → K9
10. **`PATCH /drivers/:id` istalgan ustunni yozadi** + `POST /scheduled-rides` autentifikatsiyasiz —
    ikki ochiq xavfsizlik teshigi. → B8, B9

---

## 4. NIMA HAQIQATAN ISHLAYDI (halol ijobiy tomon)

Bular o'qildi va **haqiqatan to'g'ri qurilgan** — qayta yozish shart emas:

| Ishlaydigan narsa | Isbot | Nega yaxshi |
|---|---|---|
| **Telefon orqali buyurtma qabul qilish oqimi** | `operator/page.tsx:332-544` | 9-raqam kiritilishi bilan avtomatik qidiruv, mijoz topilmasa avtomatik yaratish, forma to'liq tozalanadi (dublikat oldini oladi), `Ctrl+B` tezkor tugmasi. Chin ma'noda kol-markaz uchun o'ylangan |
| **Mijoz CRM kartasi** | `operator/page.tsx:790-991` | VIP darajasi, safarlar soni, o'rtacha narx, oxirgi safar, sevimli haydovchi, saqlangan manzillar (bosilsa formaga tushadi), so'nggi buyurtmalar, operator izohlari — hammasi bitta ekranda |
| **Manzil avtoto'ldirishi** | `components/ui/address-combobox.tsx:68-90` | `/addresses/popular` + debounce'li `/addresses/search`, klaviatura navigatsiyasi. Yozish 98% bo'lgan bozorga to'g'ri javob |
| **Taxminiy narx (surge bilan)** | `operator/page.tsx:409-440`, `:1133-1163` | Debounce'li, diapazon ko'rsatadi (`fareRangeMin/Max`), surge belgisi bilan — aniq raqam va'da qilmaydi |
| **Qo'shimcha talablar / mashina modeli tanlash** | `operator/page.tsx:1067-1131` | DAMAS, orqa bagaj va h.k. narxi bilan, jami avtomatik hisoblanadi |
| **«Kim jiringlayapti» jonli paneli** | `components/operator/RingingDriverPanel.tsx` + `socket.gateway.ts:341-374` | Haydovchi telefonida taklif chiqqan zahoti operator ismini, raqamini va sanoq chizig'ini ko'radi. Bu — raqobatchilarda yo'q imkoniyat |
| **Kelgan qo'ng'iroq oynasi (CTI)** | `components/IncomingCallPopup.tsx` + `operator-phones.controller.ts:111-172` | Android yordamchi APK → soket → har sahifada suzuvchi karta, mijoz tanib olinadi. (Faqat uzatma qismi uzilgan — K8) |
| **Buyurtma kartasi va dispatch izi** | `orders/[id]/page.tsx:389-496` | Har urinish: qaysi haydovchi, necha km, qanday ball, natija (qabul/rad/javob yo'q), javob vaqti + holat tarixi. Nega buyurtma kechikkanini aniq ko'rsatadi. **Panelning eng kuchli qismi** |
| **Buyurtmani sabab bilan bekor qilish** | `orders/[id]/page.tsx:516-541` + `orders.controller.ts:172-180` | Modal, majburiy sabab, dispetcher sifatida yoziladi — to'g'ri qilingan |
| **Qo'lda haydovchi tayinlash (buyurtma kartasidan)** | `orders/[id]/page.tsx:133-163` → `POST /operator/dispatch/manual` | Bu yo'l **haqiqatan ishlaydi** — operator konsolidagi buzuq tugmadan farqli. Ya'ni backend tayyor, faqat konsol noto'g'ri manzilga uriladi |
| **Hujjat tekshiruvi** | `components/drivers/DocumentReview.tsx` | Blob orqali xavfsiz rasm ko'rish, zoom, tasdiqlash, majburiy sabab bilan rad etish, yuklanish/xato/bo'sh holatlari — **panelning eng puxta komponenti** |
| **Haydovchi tasdiqlash oqimi** | `drivers/[id]/page.tsx:319-358, 637-646` | Har holat uchun to'g'ri tugmalar (pending/approved/suspended/rejected) + tasdiq oynasi |
| **Balans to'ldirish (top-up)** | `drivers/[id]/page.tsx:463-593`, `finance/topup/page.tsx` | Har operator uchun alohida parol, super-admin parolsiz, oldingi→yangi balans ko'rinishi, har amal `topup_logs` ga yoziladi (muvaffaqiyatsizlari ham) — **pul yo'lidagi yagona to'g'ri audit** |
| **Jonli xarita** | `components/map/LiveMap.tsx` | Davlat-raqam shaklidagi marker'lar, holat rangi (bo'sh/safarda/tanaffus), tooltip'da reyting va buyurtma raqami, offline haydovchi avtomatik o'chadi, legend bor |
| **Buyurtmalar ro'yxati** | `orders/page.tsx` + `lib/utils.ts:64-76` | Pagination, holat filtri, chap chekkadagi rangli chiziq bilan muammoli qatorni bir qarashda ajratish — yaxshi dizayn qarori |
| **Statistika sahifasi** | `analytics/page.tsx` | Buyurtma/daromad grafiklari, band soatlar, bekor qilish sabablari (pie), top haydovchilar — hammasi real endpoint'lardan |
| **Narx boshqaruvi** | `pricing/page.tsx` + `pricing-admin.controller.ts` | Tariflar, zonalar, zona qoidalari, vaqt qoidalari — to'liq CRUD, o'chirishda `confirm()` bor |
| **Obzvon (outreach) CRM** | `outreach/page.tsx` | Holat bo'yicha filtr-tugmalar, progress bar, debounce'li qidiruv, pagination, qo'ng'iroq natijasini yozish — haydovchi jalb qilish uchun real ish quroli |
| **Rejali safarlar ro'yxati** | `scheduled/page.tsx` | 30s avtomatik yangilanish, ikki bosqichli bekor qilish tasdig'i, xato banneri, bo'sh holat — (faqat yaratish shakli operator uchun emas — O13) |
| **`no_drivers` endi terminal emas** | `socket.gateway.ts:304-314`, `orders.service.ts:877-878` | `BIRJOY_TAXI_MASTER.md:290` dagi K1 ning **backend qismi tuzatilgan** — buyurtma o'lmaydi va `/orders/active` uni qaytaradi. Qolgani faqat operator sahifasi uni yuklashi (B6) |
| **Soket autentifikatsiyasi** | `socket.gateway.ts:220-249` | `admin:join` token talab qiladi; ulanishda mavjud haydovchi joylashuvlari darhol yuboriladi |

---

## 5. REJADA BOR, KODDA YO'Q (0 qator)

`ADMIN_QOSHIMCHALAR.md` da tasdiqlangan, lekin **umuman boshlanmagan** (grep bo'yicha 0 natija):

| Xususiyat | Reja manbasi | Kod holati |
|---|---|---|
| Ratsiya orqali manzil belgilash (`dropoffPlaceId` / `dropoffText` / `dropoffSource`) | `ADMIN_QOSHIMCHALAR.md` §1 | `grep -ri "dropoffPlaceId\|dropoffText\|dropoffSource"` → **0** |
| Ratsiya (PTT / LiveKit) | §4.1 №4, `BIRJOY_TAXI_MASTER.md:303-306` | `grep -ri "livekit\|ptt"` → **0** |
| Uch panelli dispetcher konsoli (alohida bo'lim) | §4.1 №3 | Yo'q — mavjud `operator` sahifasi 4 ustunli, lekin xarita ham, signal ham yo'q |
| Nazorat signallari (5 holat, qizil chiziq + ovoz) | §4.1 №2 | Yo'q — faqat `no_drivers` qizil ramka (`operator/page.tsx:1390`) |
| Zanjirli buyurtma taklifi | §4.1 №6 | Yo'q |
| Smena boshqaruvi | §4.3 | Yo'q (`grep "shift"` → faqat `e.shiftKey`) |
| Haydovchi 360 kartasi (GPS izi, shikoyatlar, qarz) | §4.2 №7 | Qisman — profil+moliya bor, GPS izi va shikoyat yo'q |
| KPI paneli (topish vaqti, yetib kelish vaqti) | §4.2 №9 | Yo'q — `analytics` da bu metrikalar yo'q |
| Firibgarlik signallari | §4.2 №10 | Yo'q |

---

## 6. MEN QAMRAB OLMAGAN JOYLAR (halollik uchun)

- **Jonli render isboti yo'q** — hamma xulosa kod o'qishdan. Panel VPS'da ochib tekshirilmadi.
  B1 (noto'g'ri base URL) jonli tizimda 2 daqiqada tasdiqlanadi: brauzer Network panelida
  `/dashboard/clients` ochilsa `404` yoki `localhost:4000` ko'rinadi.
- **To'lov modullari** (`payme`, `click`, `wallet`) ochilmadi — `TAXI_YADRO_AUDIT.md:522` ham shu.
- **`apps/client`** (mijoz Mini App) audit qilinmadi — vazifa doirasidan tashqarida.
- **Xavfsizlik testi qilinmadi** — B2/B8/B9 kod o'qishdan aniqlangan, haqiqiy so'rov yuborilmagan.
- **Sozlamalar kalitlari** `grep` bo'yicha hisoblandi; dinamik qurilgan kalit nomlari bo'lsa
  (masalan `` `NOTIF_${x}` ``) grep ularni ko'rmaydi — lekin repo bo'ylab bunday shablon topilmadi.

---

## 7. NIMANI BIRINCHI TUZATISH KERAK

**Bitta narsa tanlansa: B1 — 8 sahifadagi base URL.** Sabab: bu bitta qatorlik tuzatish
(`const API = …` ni `apiClient` ga almashtirish), lekin panelning **31%ini o'likdan tirikka
o'tkazadi** — Mijozlar bazasi, SOS xavfsizlik markazi, tiketlar, hisobotlar, adminlar boshqaruvi
va tizim holati birdaniga ishlaydi. Boshqa hech bir tuzatish shunchalik kam ish bilan shuncha
ko'p narsa qaytarmaydi.

Keyingi tartib: **B4+B5+B6** (operator konsolini haqiqatan ishlaydigan qilish — bir kun) →
**B7** (admin refresh — yarim kun) → **B2+B3** (rol + audit — birga, 2 kun) → **K7** (yolg'on
sozlamalarni yo ulash yo olib tashlash) → **K17** (`ignoreBuildErrors` ni o'chirish, keyingi
404'lar takrorlanmasligi uchun).
