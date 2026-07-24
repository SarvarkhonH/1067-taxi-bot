// 🔌 Kill-switch flags: every risky mechanic can be turned OFF without a deploy
// via AppState "feature:<name>" = "off". Default is ON — EXCEPT DEFAULT_OFF flags,
// which stay OFF until an explicit "on" row exists (a not-yet-owner-accepted feature
// must NOT go live just because its kill-switch row is missing). 30s cache.
import { prisma } from "../db";

export const FEATURES = [
  "wheel", "garage", "items", "transfers", "push", "gap", "plus", "recruit", "booking3",
  // v3 tracks — each ships dark behind its flag until owner QABUL:
  "livinghome", // V1 living AI home screen
  "aibrain", // V2 AI concierge (proactive + conversational)
  "mahalla", // V5 mahalla-scoped leaderboard
  "tolqin", // V4 Yashil to'lqin skill game
  "baraban", // 🎰 post-ride spin wheel (5-min token on ride finish → one spin, real tanga) — LIVE, owner-accepted
  "komissiya", // 💸 platform commission on transfers/tips/fares (configurable %); OFF until owner QABUL
  "promo", // 🎁 admin-configurable promo campaigns ("tasks with promises") + completion pushes; OFF until owner QABUL
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
  "jackpotpost", // 📣 W1 №2 jackpot-shou: har ride-jackpot yutug'i + dushanba haftalik digest Koson
              // kanaliga post qilinadi (KOSON_CHANNEL_ID env ham shart). Pul mexanikasi EMAS —
              // faqat mavjud yutuqlarni ommaviy qilish. DARK until owner QABUL
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
  "bazar",    // 🏪 BirJoy V1 (BAZAR_PLAN): multi-vendor marketplace qatlami do'kon ustida —
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
  "newhome",  // 🏠 UY_REDESIGN Bosqich 1: premium super-app home (search + colored service-rail +
              // promo/hero + image bento feed + Liquid-Glass tabbar + 3 selectable themes). OFF =
              // classic UyView AYNAN qoladi (App.tsx fallback). Pul YO'Q. DARK until owner QABUL.
  "newprofile", // 👤 UY_REDESIGN Bosqich 5: enriched Profil (unified orders + saved addresses +
              // favorites + tier + referral + settings/theme picker + partner onboarding). OFF =
              // classic profile tab AYNAN. Pul YO'Q. DARK until owner QABUL.
  "shopv2",   // 🏪 BirJoy Market v2: Bozor-bosh/Do'kon-profil/Mahsulot/Savat/Hikoya-ko'ruvchi'ning
              // to'liq qorong'i-oynasimon (glassmorphic) qayta-dizayni (Claude Design'da ega bilan
              // ikki marta iteratsiya qilingan). OFF = eski oq-karta shop.tsx AYNAN qoladi. Pul
              // YO'Q. DARK until owner QABUL (owner-preview: /api/me flagPreview naqshi).
] as const;
export type FeatureName = (typeof FEATURES)[number];

// Off until explicitly enabled (go-live flip = setFeature(name, true) after owner QABUL).
// booking3 = the new map/trip flow; owner still gets a preview via server.ts owner-branch,
// but real users stay on the (fixed) classic flow until it's accepted. A missing row → OFF.
const DEFAULT_OFF = new Set<FeatureName>(["booking3", "livinghome", "aibrain", "mahalla", "tolqin", "baraban", "komissiya", "qarz", "welcomebonus", "refstaged", "drvstaged", "drvrecruit", "drvpush", "promo", "clientbooking", "cashout", "carupgrade", "intercity", "tierloyalty", "waitcomp", "trackcta", "jackpotpost", "drvrank", "instantstatus", "spinreminder", "shop", "xizmatlar", "elonlar", "elontop", "restoran", "bazar", "bazarcart", "shopcashback", "revtanga", "airemind", "aihisob", "aidost", "aicity", "aibilim", "aineeds", "shopstory", "shopchat", "newhome", "newprofile", "shopv2"]);

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
  "wheel", "items", "transfers", "push", "gap", "plus", "recruit", "booking3", "livinghome",
  "baraban", "komissiya", "promo", "qarz", "refstaged", "drvstaged", "drvrecruit",
  // "welcomebonus" — owner intentionally OFF 2026-07-17, confirmed 2026-07-21 ("o'chirganman");
  // re-add here when owner re-enables it.
  // "intercity" — owner intentionally OFF 2026-07-23 ("shaharlararo bu keyinchalik qilinadigan
  // loyiha") — keyingi bosqich sifatida rejalashtiriladi, hozircha diqqat markazida emas.
  // Flag setFlag.ts orqali off qilindi (alertAdmins jo'natildi). Qayta yoqilganda shu yerga qaytariladi.
  "drvpush", "clientbooking", "cashout", "tierloyalty", "waitcomp", "trackcta",
  "jackpotpost", "instantstatus", "drvrank",
  "shop", // 🛍 tanga do'kon — owner GO LIVE 2026-07-06 (100 ta KOSON_AKSIYA mahsuloti + naqd/tanga)
  "xizmatlar", // 🔎 Koson xizmatlar katalogi — owner GO LIVE 2026-07-06 (67 ta seed listing, soft-launch: foto/narx/1067-audit hali bo'sh — jonli boyitiladi)
  "elonlar", // 📋 E'lonlar (mahalla e'lon taxtasi) — owner GO LIVE 2026-07-07 (E1-E4 owner-accepted 2026-07-06,
             // ELONLAR_PLAN.md; catalog bo'sh — 2 ta ega-test e'loni bor, real trafik yo'q; elontop TOP-boost
             // ataylab OFF qoldirildi — alohida so'rov kutilmoqda, pul-mexanika keyinroq alohida yoqiladi)
  "restoran", // 🍽 Restoran taom-buyurtma — owner GO LIVE 2026-07-07 (8 restoran seed, 3 tasida
             // buzuq/placeholder telefon + 5 tasida bo'sh menyu — owner "hozir live qil, keyin tuzataman"
             // deb aniq buyurdi; keyingi tozalash kerak: koson miliy taomlari, Do'stlar Choyxonasi,
             // Chinor Oilaviy Restorant telefonlari + 5ta menyu to'ldirish)
  "bazar", // 🏪 BirJoy marketplace-qatlam — owner QABUL real telefonda 2026-07-21 («yaxshi chiqibdi»),
           // R4 mustaqil tekshiruv PASS (PROGRESS 07-21). 1 do'kon (BirJoy o'z do'koni, 140 mahsulot);
           // pilot-sellerlar /sotuvchi orqali keladi.
  // 🤖 Koson AI (2026-07-23): owner-driven AI-FIRST — real tugmalar olib tashlandi, AI endi
  // ASOSIY interfeys. Avval bu ro'yxatda YO'Q edi — DB reset/migratsiya xatosi butun AI'ni
  // hech qanday alertsiz o'chirib qo'yishi mumkin edi (reconcileFlags "missing" faqat shu
  // ro'yxatdagilarni tekshiradi). Endi boshqa har bir owner-accepted feature kabi himoyalangan.
  "aibrain", "airemind", "aihisob", "aidost", "aicity", "aibilim",
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
