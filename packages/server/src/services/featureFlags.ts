// 🔌 Kill-switch flags: every risky mechanic can be turned OFF without a deploy
// via AppState "feature:<name>" = "off". Default is ON — EXCEPT DEFAULT_OFF flags,
// which stay OFF until an explicit "on" row exists (a not-yet-owner-accepted feature
// must NOT go live just because its kill-switch row is missing). 30s cache.
import { prisma } from "../db";

export const FEATURES = [
  "wheel", "garage", "items", "transfers", "push", "gap", "plus", "recruit", "booking3",
  // v3 tracks — each ships dark behind its flag until owner QABUL:
  "aibrain", // V2 AI concierge (proactive + conversational)
  "mahalla", // V5 mahalla-scoped leaderboard
  "tolqin", // V4 Yashil to'lqin skill game
  "baraban", // 🎰 post-ride spin wheel (5-min token on ride finish → one spin, real tanga) — LIVE, owner-accepted
  "komissiya", // 💸 platform commission on transfers/tips/fares (configurable %); OFF until owner QABUL
  "promo", // 🎁 admin-configurable promo campaigns ("tasks with promises") + completion pushes; OFF until owner QABUL
  // "jackpotpost" — 2026-08-07 da butunlay olib tashlandi (jackpot mexanikasi HAMMA joydan —
  // safar-tugash mukofoti VA g'ildirak — o'chirildi, kanal e'loni ham shu bilan birga ketdi).
  "qarz", // 💸 Bosqich 3: driver pays kas company debt with tanga (real kas write); OFF until owner pilot
  "welcomebonus", // 🎁 universal first-ride bonus (REFEREE_REWARD=5000 tanga) for riders who did NOT arrive via referral/recruit — every new bot user gets exactly one; OFF until owner pilot
  "refstaged", // 👥 STAGED referral payout: inviter earns in 3 steps (friend START → +refStart, friend links number → +refShare, friend 1st ride → +refRide); friend gets 5000 on JOIN like everyone. OFF = legacy (all on first ride). DARK until owner QABUL
  "drvstaged", // 🚖 STAGED driver-QR payout: driver earns drvStart (client START) + drvShare (client links number) + revshareFresh/ride for revshareMonths; recruited client gets 5000 on JOIN. OFF = legacy (500 ride1 + 1000 ride3 + 6mo revshare, client 5000 on 1st ride). DARK until owner QABUL
  "drvrecruit", // 🚖 driver→driver recruit: a driver brings a new DRIVER; when that driver completes 10 rides the recruiter earns 5000; OFF until owner pilot
  "drvpush", // 🔔 driver engagement pushes (ishga chiqing / demand-spike / EOD work summary); read-only, OFF until owner QABUL
  "clientbooking", // 🎯 GPS orders via the kas CLIENT endpoint (rider's own secretKey, resolved operator-side) → «new» + EXACT pin + «℗» place name, exactly like the official app. OFF until owner pilot
  "cashout", // 💵 real cash-out (tanga → plastik card / cash-to-home): bot records a request + forwards to the owner, who pays manually + approves. No card storage. OFF until owner pilot
  "carupgrade", // 🚗 FAZA2 — model-upgrade ladder (Tiko→Damas→…, #serial saqlanadi) + "buy new car" shop removed. OFF until owner QABUL
  "intercity", // 🚐 Nationwide shaharlararo shared-taxi (o'rindiq sotish, real-pul fare alohida ledger, tanga faqat ≤5000 chegirma). DARK until owner pilot
  "tierloyalty", // 🏅 Tier loyalty loop: tier→per-ride cashback multiplier + daily ≥50%-task ball + soft decay. ≤350 clamp untouched. DARK until owner QABUL
  "waitcomp", // 🪙 Wait compensation: catch-the-coin game while searching for a driver pays REAL tanga
              // scaled to search time (grace→ceiling ramp, freezes on driver-accept), OUTSIDE the
              // 350/ride clamp (own daily company-wide budget instead). Ride-finish only. DARK until owner QABUL
  "trackcta", // 🛡→👥 TrackView viral loop: public trip page shows a delayed dismissible "birinchi
              // safar bepul" banner linking t.me/<bot>?start=reft_<sharer code> (EXISTING referral
              // pipeline pays both sides — no new money mechanic), + the live ride card's share
              // button sends the real live-track link instead of plain text. DARK until owner QABUL
  "instantstatus", // ⚡ W2 №1: kas CLIENT Netty socket (46.8.176.53:1114) — active-ride mijoz uchun
              // holat o'zgarishini SONIYALARDA push qiladi → sweep'ni darhol trigger qiladi (90s emas).
              // Soket PUL BERMAYDI/karta chizMAYDI — faqat trigger; sweep yagona renderer/pul-yo'li
              // (idempotent). Soket o'lsa 5-90s sweep zaxira. DARK until owner QABUL
  "drvrank", // 🏆 driver QR-income leaderboard («Reyting» in the driver panel, monthly race) +
              // Monday weekly «QR'ingizdan N mijoz, +X tanga» push to QR-active drivers only.
              // Read-only (moves NO money). DARK until owner QABUL
  "spinreminder", // 🎁 midday push «bepul aylantirishingiz kutmoqda» to riders who haven't used their
              // free daily wheel — surfaces the forgotten baraban. Rides the SAME push engine (2/day
              // cap, quiet hours, opt-out respected). Read-only. DARK until owner pilot.
  "shop", // 🛍 TANGA SHOP: owner-listed real goods bought with tanga (Product/ShopPurchase), owner
              // approves delivery in Telegram (✅/❌, reject auto-refunds + restocks). NO lootboxes.
              // Deliberately NOT in EXPECTED_ON until owner QABUL (add it there when flipping on).
              // DARK until owner QABUL.
  "xizmatlar", // 🔎 XIZMATLAR: Koson services directory ("Koson 2GIS'i") — categories, search,
              // one-tap call, ratings/reviews, self-submit with owner ✅/❌ moderation. Moves NO
              // money (no coin paths at all). DARK until seed (80-100 listings) + owner QABUL.
  "elonlar", // 📋 E'LONLAR: mahalla e'lon taxtasi (OLX-uslub) — Reyting tabbar o'rnini egallaydi,
              // Reyting o'zi o'chmaydi (uy tugmasi/deep-link orqali ochiladi). E1 = UI ko'chirish
              // only (bo'sh tab). E2 postlash+CoinTxn narxlash qo'shadi. DARK until owner QABUL
              // (ELONLAR_PLAN.md).
  "elontop", // 📌 E'LONLAR TOP-boost (E4) — alohida flag §6: rider öz aktiv e'lonini 24 soatga TOP
              // qiladi (knob elonTopPrice, tanga sink). `elonlar` ON bo'lmasa ma'nosi yo'q, lekin
              // mustaqil o'chirilishi mumkin (owner boost'ni vaqtincha to'xtatishi uchun).
  "restoran", // 🍽 RESTORAN: restoran/oshxona taom-buyurtma, "wallet" tabbar slotini egallaydi
              // (RESTORAN_PLAN.md). V1 = CONCIERGE: naqd/so'm to'lov (CoinTxn YO'Q), operator
              // telefon qiladi + admin panelda holatni qo'lda boshqaradi. R1 = katalog o'qish only
              // (savat/buyurtma R2'da). DARK until seed + owner QABUL.
              // OFF = bugungi flat do'kon AYNAN; ON = Bozor-bosh (kategoriya-karusel, do'kon-rail,
              // server-qidiruv) + buyurtma-routing sellerlarga. DARK until pilot sellers + QABUL.
  "bazarcart", // 🧺 BirJoy V2: ko'p-satrli savat-checkout (MarketOrder) — OFF = 1-dona buyProduct
              // oqimi AYNAN qoladi. Pul-yadro: tanga BUY'da tx-ichida ushlanadi; reject/cancel
              // flip+restock+refund BITTA tx. DARK until owner QABUL.
  "shopcashback", // 🪙 BirJoy V3: xarid-cashback (Kaspi-Bonus modeli) — YANGI emissiya-manba, safar
              // ≤350 clamp'ga TEGMAYDI (bookingId=null). Grant faqat delivered-o'tishda. DARK.
  "revtanga", // 🗣 BirJoy V3: sharh-uchun-tanga (Ozon mexanikasi) — FAQAT delivered-xaridor,
              // BIR UMR bir marta. DARK until owner QABUL.
  "airemind", // 🔔 AI v2 P1: eslatmalar (oddiy/taksi/qarz) — agent tool + sweep-yetkazish.
              // Pul YO'Q, uchinchi shaxsga xabar YO'Q, dispatch faqat human-tap. DARK until QABUL.
  "aihisob",  // 📊 AI v2 P1: hisob-kitob (lokal agregatlar CoinTxn/RideReward ustidan + rules-first
              // arifmetika). Raqamlar LLM'ga round-trip QILINMAYDI. DARK until owner QABUL.
  "aidost",   // 💛 Koson AI K4: do'st-rejim — emotsional suhbat-persona + MemberMemory o'z-xotira
              // (eslab_qol/unut tool'lari). Mijozning O'Z so'zlari, faqat o'z kontekstiga qaytadi,
              // «meni unut» bilan o'chadi. Pul YO'Q. DARK until owner QABUL.
  "aicity",   // 🏙 Koson AI K1: universal shahar-agent yadrosi (shahar_qidir/buyurtma/holat +
              // provider-registry). Har provider O'Z modul-flagiga ham bog'liq (ikki qavatli gate);
              // buyurtma faqat tasdiqlash-karta + human-tap bilan. DARK until owner QABUL.
  "aibilim",  // 🧠 Koson AI: jamoaviy bilim (Business Registry urug'i) — odamlar /bilim orqali Koson
              // haqida ma'lumot yozadi, EGA tasdiqlaydi (owner-card + admin API), tasdiqlangani AI
              // system-prompt kontekstiga (keyword-retrieval) kiradi. Pul YO'Q. DARK until QABUL.
  "aineeds",  // 💡 Needs Engine (K5.1): AI odam ODATLARINI sezib, o'zi BIRINCHI yumshoq taklif yozadi
              // (habit-safar / referral / hamyon). EHTIYOTKOR: mavjud push-guardrail (kunlik 2 cap,
              // opt-out, tun-soatlari, dedup) + haftalik 2 cap + [🔕 to'xtat]. Halol persuasion,
              // aldov YO'Q. Koson-shevasi shablonlar. Yangi poller YO'Q. DARK until owner QABUL.
  "shopstory", // 📹 BirJoy S1: do'kon-hikoya (Instagram/Snapchat-uslub, 24h expiry, bot-orqali post).
              // Pul YO'Q. Yangi poller YO'Q (o'qish-vaqtida expiresAt filtr). Hozircha VIDEO-only
              // (foto — S1.2b'da, `:photo` handler-tartib tuzatilgach). DARK until owner QABUL.
  "shopchat", // 💬 BirJoy C1: mijoz↔do'kon chat — bot-relay (mavjud SupportMsg kengaytirilgan,
              // yangi chat-server YO'Q). Pul YO'Q. DARK until owner QABUL.
              // promo/hero + image bento feed + Liquid-Glass tabbar + 3 selectable themes). OFF =
              // classic UyView AYNAN qoladi (App.tsx fallback). Pul YO'Q. DARK until owner QABUL.
              // favorites + tier + referral + settings/theme picker + partner onboarding). OFF =
              // classic profile tab AYNAN. Pul YO'Q. DARK until owner QABUL.
              // to'liq qorong'i-oynasimon (glassmorphic) qayta-dizayni (Claude Design'da ega bilan
              // ikki marta iteratsiya qilingan). OFF = eski oq-karta shop.tsx AYNAN qoladi. Pul
              // YO'Q. DARK until owner QABUL (owner-preview: /api/me flagPreview naqshi).
  "linkinapp", // 📱 Raqamni ILOVA ICHIDA ulash (Telegram requestContact, Bot API 6.9) — mehmon
              // botga sakramaydi. OFF = eski bot-yo'li AYNAN qoladi (openLinkBot). Yangi pul-mantiq
              // YO'Q: ulash va mukofotlar bot bilan BITTA yo'lda (services/linkService.ts,
              // idempotent). DARK until owner QABUL (owner-preview: /api/me flagPreview naqshi).
  "homescreen", // 🏠 "Telefon ekraniga qo'shish" taklifi (Telegram addToHomeScreen, Bot API 8.0).
              // Faqat status "missed" bo'lganda va faqat Uy tabida bir marta ko'rinadi; rad etilsa
              // 30 kun jim. Pul YO'Q, yangi ma'lumot yo'q. OFF = hech narsa ko'rinmaydi (bugungi
              // holat aynan). DARK until owner QABUL (owner-preview: /api/me flagPreview naqshi).
  "storyshare", // 📸 Taklifni Telegram HIKOYASIGA (story) ulashish (shareToStory, Bot API 7.8).
              // Mavjud taklif-posteri ishlatiladi, yangi asset yo'q; klient qo'llab-quvvatlamasa
              // odatdagi «chatga yuborish» yo'liga tushadi. Pul YO'Q (referal to'lovi o'zgarmaydi,
              // link aynan o'sha). OFF = tugma ko'rinmaydi. DARK until owner QABUL.
  "autoloc",  // 📍 Taksi xaritasi OCHILGANDA joylashuvni o'zi aniqlaydi (mavjud locateMe yo'li:
              // Telegram LocationManager 8.0+ → brauzer GPS zaxira, aniqlik toraytirish bilan).
              // OFF = bugungi xatti-harakat AYNAN: xarita kompaniya markazida ochiladi va pin
              // faqat 📍 tugmasi bosilganda harakatlanadi. Pul-mantiq YO'Q, dispetcherlik yo'li
              // o'zgarmaydi — faqat xarita KO'RINISHI; mijoz baribir tasdiqlaydi. Rad etilsa yoki
              // topilmasa avvalgi holat qoladi. Ega-preview ATAYLAB yo'q: ega va mijoz bir xil
              // ko'rishi shart (owner-preview-masks-dark-flags saboqi).
  "pickup2", // 🚕 Olib ketish joyini tanlashning yangi varag'i: toza nom (masofasiz) + bitta bosishda
             // chaqirish + jonli filtrli qidiruv + atrofdagi joylar + «Barchasi» katalogi. Xarita
             // ENTRY bo'lib qoladi (map-is-picker qarori buzilmaydi) — faqat pastki bar boyiydi;
             // pin surish va katalog zaxira yo'l bo'lib qoladi. Pul-mantiq YO'Q, dispetcherlik yo'li
             // AYNAN o'sha (addressId bilan). OFF = bugungi b3-pinbar + eski qidiruv sheet AYNAN.
             // Ega-preview ATAYLAB yo'q (owner-preview-masks-dark-flags saboqi).
  "pickup2b", // 🚕 `pickup2` ning B tartibi (ro'yxat birinchi: ingichka xarita + kattaklar tepada).
             // OFF = A tartibi (javob birinchi: katta nom + yashil tugma tepada). Faqat JOYLASHUV
             // farqi — bir xil ma'lumot, bir xil harakatlar. Ega ikkalasini real telefonda ko'rib
             // bittasini tanlaydi, keyin yutqazganining kodi o'chiriladi (ikki yo'l qoldirilmaydi).
  "pickup2lt", // ☀️ `pickup2` varag'ining YORUG' ko'rinishi (ega maketidagi oq dunyo, ranglar
             // PNG'dan piksel bilan o'lchangan). OFF = ilovaning qorong'i uslubi. Faqat KO'RINISH:
             // bitta ham matn/harakat/pul yo'li o'zgarmaydi. Ega ikkalasini real telefonda
             // solishtiradi, yutqazganining CSS/klassi o'sha commit'da o'chiriladi.
  "taxistory", // 📖 Taksi o'rgatuvchi story: 6 karta (joy · borar-manzil yo'q · narx · keyin nima
             // bo'ladi · bekor qilish · tanga). Mavzu `intent.ts` FAQ ro'yxatidan — odamlar ANIQ
             // shu savollarni beradi. Taksi ekrani BIRINCHI ochilganda avtomatik (localStorage
             // `b3story1`, bir marta), qayta ko'rish uchun ekran tepasida «?» tugmasi.
             // KO'RSATUVCHI-ONLY: pul yo'q, grant yo'q, dispetcherlikka tegmaydi. Raqamlar
             // (tarif, cashback) JONLI `/api/booking/info` dan o'qiladi — qattiq yozilmaydi, 0
             // bo'lsa o'sha karta CHIZILMAYDI (DIZAYN_QOIDALARI #9). OFF = story umuman yo'q,
             // «?» tugmasi ham chizilmaydi — bugungi ekran AYNAN o'zgarishsiz qoladi.
             // Ega-preview ATAYLAB yo'q (owner-preview-masks-dark-flags saboqi).
  "mktlife", // 🔔 V4: hayot-sikli push'lari — «qidirganingiz keldi» (MarketDemand) va «sevimlingiz
             // arzonlashdi» (ProductFavorite). TRANZAKSION push'lar (buyurtma holati/ETA) BU
             // BAYROQDAN MUSTAQIL — ular doim ishlaydi. OFF = hech kimga hech narsa bormaydi.
             // Cheklovlar servisda: 09:00-21:00, kuniga 1 ta, juftlikka bir marta, tick'da 20 ta.
  "mktexpire", // ⏳ Javobsiz savat-buyurtmani AVTOMATIK bekor qilish + tangani qaytarish (sotuvchi
              // N soat javob bermasa). PUL harakati — shuning uchun alohida kill-switch. OFF =
              // buyurtma pending'da qolaveradi va faqat mijozning o'zi bekor qila oladi (bugungi
              // xatti-harakat AYNAN). Qaytarish mavjud terminateWithRefund yo'li bilan (idempotent
              // `mktrefund:<id>` kaliti) — yangi pul-mantiq yozilmadi.
  "ravellastory", // 🎀📹 Ravella hikoyalari: oxirgi 10 ta (muddat YO'Q — 11-chisi eng eskisini
              // siqib chiqaradi, ega qoidasi). Rasm + qisqa video. Pul mexanikasi YO'Q.
              // `ravella` dan ALOHIDA: hikoyani butun Ravella'ni o'chirmasdan to'xtatish uchun.
  "ravella",  // 🎀 RAVELLA (RAVELLA_PLAN.md): hamkor-brend bezak KONSTRUKTORI — asosiy bezak +
              // qo'shimchalar (`+`/`−`, har biriga o'z rasmi), 10% chegirma RAVELLA hisobidan,
              // 1% cashback BIZNING hisobimizdan (faqat ish bajarilgach, cap'lar bilan). To'lov
              // naqd — buyurtmada CoinTxn YO'Q. Bitta kill-switch: OFF = bosh ekranda tugma ham,
              // banner ham ko'rinmaydi, katalog bo'sh, buyurtma rad. DARK until owner QABUL.
  "operatorAssist", // 🎧 Super Operator konsoli — admin panelda odam-operator mijoz nomidan AI
              // qila oladigan HAMMA narsani qiladi (taksi/buyurtma/eslatma/tanga/ban) + call-markaz
              // (telefon-mijoz, kas'siz) + jonli nazorat-dashboard. Pul-yo'llari YANGI EMAS — mavjud
              // funksiyalarni qayta ishlatadi (createFoodOrder/terminateWithRefund/adminGrantCoins
              // va h.k.). Bitta kill-switch: OFF = /api/admin/opr/* va operator pauza-oqimi butunlay
              // o'chadi. DARK until owner QABUL.
  "jamoa", // 👔 JAMOA (JAMOA_PLAN.md): xodimlar davomati + oylik hisobi (REAL so'm,
              // StaffLedger — tanga/CoinTxn'ga MUTLAQO aralashmaydi). OFF = botda "Ish"
              // bo'limi ko'rinmaydi, kechki xulosa yuborilmaydi, admin "Jamoa" tab
              // ma'lumot o'qiydi lekin bot-oqim o'lik. DARK until owner QABUL.
  "oyin", // 🎮 KOSON O'YINI (KOSON_OYIN_PLAN.md v9.2, KOSON_ADMIN_DOD.md): ball→chipta→tiraj
              // lototeya-mavsum + referral-zanjiri. Alohida "ball" hisob birligi — CoinTxn/coins'ga
              // TEGMAYDI, mavsum yopilishida qoldiq qismi tangaga aylanadi (o'z idempotent
              // markeri bilan). OFF = miniappda o'yin ekrani yo'q, bookingNotifier push yubormaydi,
              // uy-ekran kartasi ko'rinmaydi. DARK until owner QABUL.
] as const;
export type FeatureName = (typeof FEATURES)[number];

// Off until explicitly enabled (go-live flip = setFeature(name, true) after owner QABUL).
// booking3 = the new map/trip flow; owner still gets a preview via server.ts owner-branch,
// but real users stay on the (fixed) classic flow until it's accepted. A missing row → OFF.
const DEFAULT_OFF = new Set<FeatureName>(["booking3", "aibrain", "mahalla", "tolqin", "baraban", "komissiya", "qarz", "welcomebonus", "refstaged", "drvstaged", "drvrecruit", "drvpush", "promo", "clientbooking", "cashout", "carupgrade", "intercity", "tierloyalty", "waitcomp", "trackcta", "drvrank", "instantstatus", "spinreminder", "shop", "xizmatlar", "elonlar", "elontop", "restoran", "bazarcart", "shopcashback", "revtanga", "airemind", "aihisob", "aidost", "aicity", "aibilim", "aineeds", "shopstory", "shopchat", "mktexpire", "mktlife", "ravella", "linkinapp", "homescreen", "storyshare", "autoloc", "pickup2", "pickup2b", "pickup2lt", "taxistory", "operatorAssist", "jamoa", "oyin"]);

let cache: { at: number; map: Record<string, boolean> } = { at: 0, map: {} };

export async function featureOn(name: FeatureName): Promise<boolean> {
  if (Date.now() - cache.at > 30_000) {
    const rows = await prisma.appState.findMany({ where: { key: { startsWith: "feature:" } } }).catch(() => []);
    const map: Record<string, boolean> = {};
    for (const r of rows) map[r.key.slice(8)] = r.value !== "off";
    cache = { at: Date.now(), map };
  }
  if (DEFAULT_OFF.has(name)) return cache.map[name] === true; // OFF unless an explicit "on" row
  return cache.map[name] !== false;
}

/** TEST-ONLY: force the next featureOn() to re-read the DB (bypass the 30s cache). */
export function __resetFeatureCache(): void {
  cache = { at: 0, map: {} };
}

export async function setFeature(name: FeatureName, on: boolean): Promise<void> {
  await prisma.appState.upsert({
    where: { key: `feature:${name}` },
    update: { value: on ? "on" : "off" },
    create: { key: `feature:${name}`, value: on ? "on" : "off" },
  });
  cache = { at: 0, map: {} };
}

// A7 (audit P0): every flag lives ONLY as a DB row — a reseeded/reset DB silently reverts each
// owner-accepted feature to OFF with no error. EXPECTED_ON is the owner-accepted record (update it
// at every QABUL / intentional off); boot logs the effective state and ALERTS on any mismatch —
// it never auto-flips (an intentional off must stay off until this list is edited).
export const EXPECTED_ON: FeatureName[] = [
  "wheel", "items", "transfers", "push", "booking3",
  // 🚕 Taksi joy-tanlash redizayni — ega QABUL berdi va jonlida yoqildi (2026-08-10):
  //   `pickup2`   — yangi olib-ketish oqimi (A tartibi: javob birinchi)
  //   `pickup2lt` — yorug' ko'rinish (ega maketidagi oq dunyo)
  //   `taxistory` — 6 kartali o'rgatuvchi story (birinchi ochilishda bir marta)
  // `pickup2b` (B tartibi) ATAYLAB YO'Q: ega A ni tanladi, B faqat solishtirish uchun
  // qurilgandi va endi ishlatilmaydi. Tezkor orqaga qaytarish: setFlag.ts pickup2 off →
  // eski oqim AYNAN qaytadi (flag-OFF yo'li har commit'da tekshirilgan).
  "pickup2", "pickup2lt", "taxistory",
  // "gap" (gashtak) va "plus" (obuna) — 2026-08-07 da ega buyrug'i bilan o'chirildi ("kerak emas,
  // vazifasini bajardi"/"to'liq yuqot"). Ro'yxatga ATAYLAB qo'shilmadi: off qolishi kerak.
  // livinghome 2026-07-29 da BUTUNLAY olib tashlandi (TOZALASH_DOD.md Blok A1): bayroq nomi,
  // server quvuri (/api/me + /api/booking/info), shared tipi, admin toggle'i va home.tsx'ning
  // o'zi. Sabab: 2026-07-23 dagi UY_REDESIGN (ce9ba6a) NewUyView'ni ternaryda uning OLDIGA
  // qo'ygan, ya'ni LivingHome'ga kod umuman yetib bormagan - bayroq "on" deb yolg'on gapirgan.
  // 2026-07-28 dagi "kod qoladi, bayroq OFF" qarori ega tomonidan bekor qilindi; kod git
  // tarixida: `git show c5ef1e47:packages/miniapp/src/home.tsx`. MUKAMMAL_DASTUR.md §5b dagi
  // qaytarish sharti O'ZGARMAYDI - u xaritani NewUyView ICHIGA qism sifatida olib kirishni
  // nazarda tutadi, ya'ni home.tsx'ga bog'liq emas.
  // "baraban" (safar-tugash spin) — 2026-08-07 da ega buyrug'i bilan BUTUNLAY o'chirildi
  // ("vazifasini bajardi, kerak emas"). Ro'yxatga ATAYLAB qo'shilmadi: off qolishi kerak.
  "komissiya", "promo", "qarz",
  // "recruit", "welcomebonus", "refstaged", "drvstaged", "drvrecruit" — barcha referral/
  // welcome-bonus mexanikalari OFF (jonli AppState updatedAt: welcomebonus 2026-08-02,
  // qolgan to'rttasi 2026-08-03 — bittalab, DB reset emas). Ro'yxatga ATAYLAB qo'shilmadi:
  // off qolishi kerak. Qayta yoqilganda shu yerga qaytariladi (setFlag.ts <nom> on).
  // "garage" (+ mahalla, tolqin, carupgrade) — 2026-07-02 10:15 da BITTA to'plamda ataylab
  // o'chirilgan (minimalizm-strip). Ro'yxatga ATAYLAB qo'shilmadi: ular off qolishi kerak.
  // "intercity" — owner intentionally OFF 2026-07-23 ("shaharlararo bu keyinchalik qilinadigan
  // loyiha") — keyingi bosqich sifatida rejalashtiriladi, hozircha diqqat markazida emas.
  // Flag setFlag.ts orqali off qilindi (alertAdmins jo'natildi). Qayta yoqilganda shu yerga qaytariladi.
  "drvpush", "clientbooking", "cashout", "tierloyalty", "waitcomp", "trackcta",
  // "jackpotpost" — 2026-08-07 da flag'ning o'zi bilan birga BUTUNLAY o'chirildi (jackpot
  // mexanikasi hamma joydan olib tashlandi — endi FeatureName ham emas).
  "instantstatus", "drvrank",
  "shop", // 🛍 tanga do'kon — owner GO LIVE 2026-07-06 (100 ta KOSON_AKSIYA mahsuloti + naqd/tanga)
  "xizmatlar", // 🔎 Koson xizmatlar katalogi — owner GO LIVE 2026-07-06 (67 ta seed listing, soft-launch: foto/narx/1067-audit hali bo'sh — jonli boyitiladi)
  "elonlar", // 📋 E'lonlar (mahalla e'lon taxtasi) — owner GO LIVE 2026-07-07 (E1-E4 owner-accepted 2026-07-06,
             // ELONLAR_PLAN.md; catalog bo'sh — 2 ta ega-test e'loni bor, real trafik yo'q; elontop TOP-boost
             // ataylab OFF qoldirildi — alohida so'rov kutilmoqda, pul-mexanika keyinroq alohida yoqiladi)
  "restoran", // 🍽 Restoran taom-buyurtma — owner GO LIVE 2026-07-07 (8 restoran seed, 3 tasida
             // buzuq/placeholder telefon + 5 tasida bo'sh menyu — owner "hozir live qil, keyin tuzataman"
             // deb aniq buyurdi; keyingi tozalash kerak: koson miliy taomlari, Do'stlar Choyxonasi,
             // Chinor Oilaviy Restorant telefonlari + 5ta menyu to'ldirish)
           // R4 mustaqil tekshiruv PASS (PROGRESS 07-21). 1 do'kon (BirJoy o'z do'koni, 140 mahsulot);
           // pilot-sellerlar /sotuvchi orqali keladi.
  // 🤖 Koson AI (2026-07-23): owner-driven AI-FIRST — real tugmalar olib tashlandi, AI endi
  // ASOSIY interfeys. Avval bu ro'yxatda YO'Q edi — DB reset/migratsiya xatosi butun AI'ni
  // hech qanday alertsiz o'chirib qo'yishi mumkin edi (reconcileFlags "missing" faqat shu
  // ro'yxatdagilarni tekshiradi). Endi boshqa har bir owner-accepted feature kabi himoyalangan.
  "aibrain", "airemind", "aihisob", "aidost", "aicity", "aibilim",
  // 🔎 2026-07-27 AUDIT — quyidagi 9 bayroq JONLIDA yoqiq edi, lekin bu ro'yxatda YO'Q edi, ya'ni
  // reconcileFlags ularni umuman tekshirmasdi: DB reset/migratsiya ularni HECH QANDAY alertsiz
  // o'chirib qo'yardi (aynan yuqoridagi A7 xavfi — AI bayroqlari bilan bir marta sodir bo'lgan).
  // Har birining sanasi jonli AppState qatorining updatedAt'idan olingan, taxmin emas.
  "spinreminder", // 🎁 2026-07-22 13:44 (welcomebonus bilan bitta to'plamda) — unutilgan baraban pushi
  "bazarcart",    // 🧺 2026-07-26 18:25 — savat/checkout (bazar bilan bitta to'plamda)
  "shopchat",     // 💬 2026-07-26 18:25 — mijoz↔do'kon chat
  "shopstory",    // 📹 2026-07-26 18:25 — do'kon hikoyalari
  // "revtanga" (sharh-uchun-tanga) — 2026-08-07 da ega buyrug'i bilan BUTUNLAY o'chirildi.
  // Ro'yxatga ATAYLAB qo'shilmadi: off qolishi kerak.
  "shopcashback", // 🪙 2026-07-27 10:22 — xarid-cashback
  // 📱 Telegram-mahalliy qatlam — ega QABUL 2026-07-27 (kod-ko'rigi oldin ma'qullangan,
  // «QABUL deploydan keyin»; deploy 1d18a7e, keyin ega yoqishga ruxsat berdi). Pul YO'Q.
  "linkinapp",  // raqamni ilova ichida ulash (requestContact) — bot-yo'li zaxira bo'lib qoladi
  "homescreen", // telefon ekraniga qo'shish taklifi
  "storyshare", // taklifni Telegram hikoyasiga ulashish
  "ravella",    // 🎀 hamkor-brend bezak konstruktori — ega QABUL 2026-07-27. Buyurtmada CoinTxn
                // YO'Q (naqd); 1% cashback bizning hisobimizdan, cap'lar bilan.
  "autoloc",    // 📍 taksi xaritasi ochilganda joylashuvni o'zi aniqlaydi — ega QABUL 2026-07-27
                // («lokatsiya eski joyga qotib qolopti» shikoyatiga javob). Pul-mantiq YO'Q.
];

export async function reconcileFlags(): Promise<{ missing: string[]; effective: { name: string; on: boolean }[] }> {
  const effective = await listFeatures();
  const on = new Set(effective.filter((f) => f.on).map((f) => f.name));
  return { missing: EXPECTED_ON.filter((n) => !on.has(n)), effective };
}

export async function listFeatures(): Promise<{ name: string; on: boolean }[]> {
  const rows = await prisma.appState.findMany({ where: { key: { startsWith: "feature:" } } }).catch(() => []);
  const map = new Map(rows.map((r) => [r.key.slice(8), r.value !== "off"]));
  return FEATURES.map((f) => ({ name: f, on: DEFAULT_OFF.has(f) ? map.get(f) === true : map.get(f) !== false }));
}

/** 🏆 Mashina FONDI: 100 so'm per completed ride, prefunded, separate from
 *  the withdraw budget. Incremented per finished ride from the sweep. */
export async function fundAddRide(bookingId: number): Promise<void> {
  try {
    await prisma.appState.create({ data: { key: `fundride:${bookingId}`, value: "1" } });
  } catch {
    return; // already counted for this ride
  }
  const row = await prisma.appState.findUnique({ where: { key: "mashina_fund" } });
  if (!row) {
    await prisma.appState.create({ data: { key: "mashina_fund", value: "100" } }).catch(() => null);
  } else {
    const cur = parseInt(row.value, 10) || 0;
    await prisma.appState.update({ where: { key: "mashina_fund" }, data: { value: String(cur + 100) } }).catch(() => null);
  }
}

export async function fundTotal(): Promise<number> {
  const row = await prisma.appState.findUnique({ where: { key: "mashina_fund" } });
  return row ? parseInt(row.value, 10) || 0 : 0;
}
