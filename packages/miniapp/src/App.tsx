import { Fragment, Suspense, lazy, useEffect, useRef, useState } from "react";

const DesignDemo = lazy(() => import("./design/demo")); // #demo dagina yuklanadi
const ShopDemo = lazy(() => import("./design/shopDemo").then((m) => ({ default: m.ShopDemoPage }))); // #shopdemo dagina — shopv2 vizual-QA (mock-fetch, real Telegram auth kerak emas)
const RstDemo = lazy(() => import("./design/rstDemo").then((m) => ({ default: m.RstDemoPage }))); // #rstdemo dagina — restoran dizayn-QA (B0…B5 yonma-yon solishtirish uchun)
const OyinDemo = lazy(() => import("./design/oyinDemo").then((m) => ({ default: m.OyinDemoPage }))); // #oyindemo dagina — Koson O'yini dizayn-QA (qorong'i qurilish, flag `oyin` hali yo'q)
import type { LeaderboardResponse, MeResponse } from "@t1067/shared";
import { api, getInitData, waitForInitData } from "./api";
import { addToHomeScreen, askContact, cloudGet, cloudSet, haptic, hapticSuccess, homeScreenStatus, onHomeScreenAdded, tg } from "./telegram";
import { useBackButton } from "./useBackButton";
import { LoadError, Spinner } from "./components"; // faqat shular kritik yo'lda — qolgani lazy

import { NewUyView } from "./uy"; // Uy tabi — yengil (leaflet-siz), eager
// T2 (AUDIT 2.9): boshqa tablar lazy — har biri alohida chunk, asosiy bundle kichrayadi
const RewardsView = lazy(() => import("./rewards").then((m) => ({ default: m.RewardsView })));
const DriverView = lazy(() => import("./driver").then((m) => ({ default: m.DriverView })));
// T4: Booking 3.0 (MapLibre) — internally falls back to classic Leaflet if feature:booking3 OFF
const Booking3View = lazy(() => import("./booking3").then((m) => ({ default: m.Booking3View })));
// 🚐 Yo'l — nationwide intercity seat booking (gated by feature `intercity`)
const IntercityView = lazy(() => import("./intercity").then((m) => ({ default: m.IntercityView })));
// 🛍 Do'kon — tanga shop (gated by feature `shop`; owner-preview while DARK)
const ShopView = lazy(() => import("./shop").then((m) => ({ default: m.ShopView })));
// 🔎 Xizmatlar — Koson services directory (gated by feature `xizmatlar`; owner-preview while DARK)
const XizmatlarView = lazy(() => import("./services").then((m) => ({ default: m.XizmatlarView })));
// 📋 E'lonlar — mahalla e'lon taxtasi (gated by feature `elonlar`; owner-preview while DARK)
const ElonlarView = lazy(() => import("./elonlar").then((m) => ({ default: m.ElonlarView })));
// 🍽 Restoran — taom-buyurtma, "wallet"ning bo'shagan tab-slotini egallaydi (gated by feature `restoran`; owner-preview while DARK)
const RestoranView = lazy(() => import("./restoran").then((m) => ({ default: m.RestoranView })));
// 🎀 Ravella — hamkor-brend bezak konstruktori. Tabbar'da YO'Q (ega qarori: "bosh ekranda kichik,
// umuman boshqa xizmat turi") — faqat uy rail'i / banner / deep-link orqali ochiladi.
const RavellaView = lazy(() => import("./ravella").then((m) => ({ default: m.RavellaView })));
// 🎮 Koson O'yini — ball→chipta→tiraj mavsumi (gated by feature `oyin`; owner-preview while DARK)
const OyinView = lazy(() => import("./oyin").then((m) => ({ default: m.OyinView })));
// 👀 Mehmon-teaser: raqami ulanmagan odam sovrinlarni ko'rishi uchun (taklif havolasi oqimi)
const OyinTeaser = lazy(() => import("./design/oyinTeaser").then((m) => ({ default: m.OyinTeaser })));
// 💼 Hamyon · 👤 Profil · 🏆 Reyting · 🎯 Vazifa · 👥 Taklif · 📜 Tarix — hech biri BIRINCHI
// ekranda ko'rinmaydi, shuning uchun lazy. `wallet.tsx` (961 qator) shu tariqa kritik yo'ldan
// butunlay chiqadi; ilgari uni uy ekrani o'lik import orqali tortib turgan edi.
const WalletView = lazy(() => import("./wallet").then((m) => ({ default: m.WalletView })));
const AccountCard = lazy(() => import("./wallet").then((m) => ({ default: m.AccountCard })));
const TierLadder = lazy(() => import("./wallet").then((m) => ({ default: m.TierLadder })));
const TierLadderCompact = lazy(() => import("./wallet").then((m) => ({ default: m.TierLadderCompact })));
const NewProfileView = lazy(() => import("./profile").then((m) => ({ default: m.NewProfileView })));
const ThemePicker = lazy(() => import("./profile").then((m) => ({ default: m.ThemePicker })));
const LeaderboardView = lazy(() => import("./components").then((m) => ({ default: m.LeaderboardView })));
const MissionsView = lazy(() => import("./components").then((m) => ({ default: m.MissionsView })));
const ReferralView = lazy(() => import("./components").then((m) => ({ default: m.ReferralView })));
const RideHistoryView = lazy(() => import("./components").then((m) => ({ default: m.RideHistoryView })));
import { BirJoyMark } from "./design/birjoy";
import { Icon } from "./icons";
import { useCountUp } from "./util";
import { initTheme, syncThemeFromCloud } from "./theme"; // kichik modul — profile/wallet zanjirini tortmaydi

initTheme(); // 🎨 apply saved / Telegram theme on <html> before first paint (features newhome/newprofile)

type Tab = "uy" | "wallet" | "play" | "reyting" | "yol" | "dokon" | "xizmat" | "elonlar" | "restoran" | "ravella" | "driver" | "profile" | "oyin";

// ── `me` stale-while-revalidate cache (instant repeat opens, hides cold-start) ──
// Keyed by the Telegram user id so a shared device never shows one user another's cached data.
function meCacheKey(): string {
  const uid = (tg as unknown as { initDataUnsafe?: { user?: { id?: number } } })?.initDataUnsafe?.user?.id ?? "dev";
  return `me_v2_${uid}`;
}
function readMeCache(): MeResponse | null {
  try {
    const s = localStorage.getItem(meCacheKey());
    if (!s) return null;
    const m = JSON.parse(s) as Partial<MeResponse>;
    // shape guard: an OLD/partial cache (different MeResponse shape from a previous deploy) must NOT
    // hydrate — child views would crash on a missing field → white screen. If it doesn't carry the
    // essentials, ignore it and fall back to the normal fetch (BootSplash).
    if (!m || typeof m !== "object" || !m.member || !m.stats || !m.level || typeof m.coins !== "number" || !m.type || !m.metricLabel) {
      return null;
    }
    return m as MeResponse;
  } catch {
    return null;
  }
}
function writeMeCache(m: MeResponse): void {
  try {
    localStorage.setItem(meCacheKey(), JSON.stringify(m));
  } catch {
    /* private mode / quota — fine, just no cache */
  }
}
function clearMeCache(): void {
  try {
    localStorage.removeItem(meCacheKey());
  } catch {
    /* ignore */
  }
}


// 4 aniq tab: Uy (taxi-first) · Hamyon (pul) · O'yin (bonus+vazifa) · Reyting (liga+do'st).
// `intercity` ON bo'lsa Yo'l 5-tab sifatida qo'shiladi (pastda swapForYol).
// O'yin + Yo'l pastki bardan olindi — ularning o'rnini Do'kon + Xizmatlar egalladi. O'yin ekrani
// uy tugmasidan / deep-link'dan hali ham ochiladi (faqat tabbar'dan yo'q).
// W1 (RESTORAN_PLAN §D6): "wallet" tabbardan chiqdi — Hamyon endi Uy tabidan (balans-qator +
// "Hamyon" tile) ochiladi. Ekran/route/deep-link (GO_MAP, tab==="wallet" render) O'ZGARMAYDI —
// faqat doimiy tab-tugmasi yo'q, shuning uchun bo'shagan slot keyingi tiketda "restoran" tabiga beriladi.
const BASE_TABS: { id: Tab; icon: string; label: string }[] = [
  { id: "uy", icon: "home", label: "Uy" },
  { id: "reyting", icon: "league", label: "Reyting" },
];
// drivers keep their earnings hub
const DRIVER_TABS: { id: Tab; icon: string; label: string }[] = [
  { id: "uy", icon: "home", label: "Uy" },
  { id: "driver", icon: "car", label: "Daromad" },
  { id: "reyting", icon: "league", label: "Reyting" },
];
// old deep-link / child-nav targets → new tabs (so cached bot menus + components still work)
const GO_MAP: Record<string, Tab> = {
  home: "uy", uy: "uy", wallet: "wallet", hamyon: "wallet",
  tip: "wallet", paydriver: "wallet", pay: "wallet", // 🙏 «Haydovchiga to'lash» → hamyon ekrani; wallet.tsx avto-ochadi pay-driver sheet'ni
  rewards: "play", missions: "play", play: "play", bonus: "play", vazifa: "play",
  market: "dokon", bozor: "dokon", dokon: "dokon", shop: "dokon", // 🛍 do'kon (flag off bo'lsa App tab-guard Uy'ga tushiradi)
  xizmat: "xizmat", xizmatlar: "xizmat", services: "xizmat", usta: "xizmat", // 🔎 xizmatlar katalogi
  league: "reyting", friends: "reyting", reyting: "reyting", liga: "reyting", dost: "reyting",
  yol: "yol", intercity: "yol", reys: "yol", // 🚐 shaharlararo
  elonlar: "elonlar", elon: "elonlar", elonlash: "elonlar", // 📋 mahalla e'lon taxtasi
  restoran: "restoran", restaurant: "restoran", taom: "restoran", ovqat: "restoran", // 🍽 taom-buyurtma (flag off bo'lsa App tab-guard Uy'ga tushiradi)
  ravella: "ravella", bezak: "ravella", toy: "ravella", // 🎀 Ravella bezak konstruktori (flag off bo'lsa tab-guard Uy'ga tushiradi)
  oyin: "oyin", koson: "oyin", game: "oyin", // 🎮 Koson O'yini (flag off bo'lsa App tab-guard Uy'ga tushiradi)
  driver: "driver", profile: "profile",
};

// Deep-link target from the bot: ?go=<tab|book> (query) or start_param. The bot menu
// buttons open the Mini App straight on the matching screen.
function readGo(): string {
  try {
    const sp = (tg as { initDataUnsafe?: { start_param?: string } } | undefined)?.initDataUnsafe?.start_param;
    return new URLSearchParams(location.search).get("go") || sp || "";
  } catch {
    return "";
  }
}

// 🤝 Gashtak taklif-havolasi: bot "?go=oyin&gsk=<code>" bilan ochadi (2026-08-05) — svc_/shop_
// bilan bir xil naqsh, `readDeepProduct` qardoshi. Bir marta o'qiladi, qo'shilish maydonini
// oldindan to'ldirish uchun.
function readDeepGashtakCode(): string | null {
  try {
    const v = new URLSearchParams(location.search).get("gsk");
    return v && /^[A-Za-z0-9]{4,8}$/.test(v) ? v.toUpperCase() : null;
  } catch {
    return null;
  }
}

// 🛍 shared-product deep-link: the bot's "🛍 Ochish" button opens the Mini App with ?go=dokon&p=<id>
// (constructed server-side, not via start_param) — read once so ShopView can auto-open that item.
function readDeepProduct(): number | null {
  try {
    const v = new URLSearchParams(location.search).get("p");
    const n = v ? Number(v) : NaN;
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

export function App() {
  if (window.location.hash === "#demo") {
    return (
      <Suspense fallback={<div className="boot"><div className="boot-logo">🎨</div></div>}>
        <DesignDemo />
      </Suspense>
    );
  }
  if (window.location.hash === "#shopdemo") {
    return (
      <Suspense fallback={<div className="boot"><div className="boot-logo">🛍</div></div>}>
        <ShopDemo />
      </Suspense>
    );
  }
  if (window.location.hash === "#rstdemo") {
    return (
      <Suspense fallback={<div className="boot"><div className="boot-logo">🍽</div></div>}>
        <RstDemo />
      </Suspense>
    );
  }
  if (window.location.hash === "#oyindemo") {
    return (
      <Suspense fallback={<div className="boot"><div className="boot-logo">🎮</div></div>}>
        <OyinDemo />
      </Suspense>
    );
  }
  // Stale-while-revalidate: hydrate `me` from the last cached payload so a repeat open renders the
  // app INSTANTLY (no BootSplash, no cold-start wait) and the real data refreshes in the background.
  const cachedMe = readMeCache();
  const [me, setMe] = useState<MeResponse | null>(cachedMe);
  const [linked, setLinked] = useState<boolean | null>(cachedMe ? true : null);
  // Deep-link: a bot-menu button opens the Mini App with ?go=<tab|book> → land straight
  // on that screen (booking flow / the matching tab), not always the home tab.
  const [tab, setTab] = useState<Tab>(() => GO_MAP[readGo()] ?? "uy");
  const [board, setBoard] = useState<LeaderboardResponse | null>(null);
  const [boardErr, setBoardErr] = useState(false);
  // 🚪 mehmon rejimi: /api/me ulanmaganlarga ham bayroqlarni beradi — qaysi tab ochiqligi shundan.
  const [guestFlags, setGuestFlags] = useState<MeResponse["flags"]>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ id: number; msg: string } | null>(null);
  const [booking, setBooking] = useState(() => readGo() === "book");
  const [invite, setInvite] = useState(() => readGo() === "invite"); // 🎁 invite overlay (one-tap from home / ?go=invite)
  const [history, setHistory] = useState(() => readGo() === "history"); // 📜 ride-history overlay
  const [deepGashtakCode] = useState(() => readDeepGashtakCode()); // 🤝 taklif-havolasi kod
  const [deepProduct] = useState(() => readDeepProduct()); // 🛍 auto-open a shared product once
  // 🏠 UY feed cards (bento) carry their real id via nav("dokon:<id>"/"restoran:<id>") so tapping one
  // opens THAT product/restaurant's detail, not just the bare tab list — parsed in nav() below.
  const [openProductFromFeed, setOpenProductFromFeed] = useState<number | null>(null);
  const [openRestoranFromFeed, setOpenRestoranFromFeed] = useState<number | null>(null);
  const coins = useCountUp(me?.coins ?? 0);
  // WOW-1: balans oshganda tanga ikonkasi sakraydi
  const [coinBounce, setCoinBounce] = useState(false);
  const [prevCoins, setPrevCoins] = useState<number | null>(null);
  useEffect(() => {
    if (me && prevCoins !== null && me.coins > prevCoins) {
      setCoinBounce(true);
      const t = setTimeout(() => setCoinBounce(false), 560);
      setPrevCoins(me.coins);
      return () => clearTimeout(t);
    }
    if (me) setPrevCoins(me.coins);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.coins]);

  const loadBoard = () => {
    setBoardErr(false);
    api.leaderboard().then(setBoard).catch(() => setBoardErr(true));
  };
  // track whether the leaderboard has been requested yet (defer until first Reyting visit)
  const [boardRequested, setBoardRequested] = useState(() => {
    const initial = GO_MAP[readGo()] ?? "uy";
    return initial === "reyting";
  });

  useEffect(() => {
    if (boardRequested) loadBoard(); // deep-linked to reyting
    // Some Telegram clients (Web Z, Desktop) populate initData a few hundred ms AFTER the WebView
    // opens — firing /api/me immediately would race into a 401 ("Telegram orqali oching"). Wait
    // for initData first (up to ~2.5s); if Telegram never fills it, proceed anyway and let the
    // server's normal auth response decide.
    void syncThemeFromCloud(); // ☁️ boshqa qurilmada tanlangan mavzu — javob kelganda qo'llanadi
    waitForInitData()
      .then(() => api.me())
      .then((r) => {
        if ("linked" in r && r.linked === false) {
          clearMeCache();
          setGuestFlags((r as { flags?: MeResponse["flags"] }).flags);
          setLinked(false);
        } else {
          const me = r as MeResponse;
          setMe(me);
          writeMeCache(me);
          setLinked(true);
          // flags piggy-backed on /api/me — no separate bookingInfo call needed
          if (me.flags) {
          }
        }
      })
      .catch((e) => {
        if (!cachedMe) setError(String(e));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ⚡ TAXI issiq start — ENG MUHIMI, lekin uzoq vaqt YO'Q edi (ega, 2026-08-01: «xaritaga
  // kirayotganda sekin»). Do'kon/Xizmatlar/E'lonlar allaqachon isitilardi, pul keltiradigan
  // taksi esa YO'Q — bosilgan payt booking3 (~45 KB) + leaflet (~150 KB) = ~195 KB yuklanardi.
  // Bayroqqa bog'lanmaydi: taksi HAR DOIM asosiy oqim.
  useEffect(() => {
    const w = window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void };
    const idle = (cb: () => void) => (w.requestIdleCallback ? w.requestIdleCallback(cb, { timeout: 3000 }) : setTimeout(cb, 1500));
    idle(() => { void import("./booking3").catch(() => undefined); });
  }, []);

  // ⚡ Do'kon issiq start: tab lazy chunk + mahsulot ro'yxati BO'SH VAQTDA oldindan yuklanadi —
  // birinchi bosishda spinner+network kutish yo'q, tab bir zumda ochiladi (ega: "sekin chiqib tushadi").
  const shopOn = !!me?.flags?.shop;
  useEffect(() => {
    if (!shopOn) return;
    const w = window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void };
    const idle = (cb: () => void) => (w.requestIdleCallback ? w.requestIdleCallback(cb, { timeout: 3000 }) : setTimeout(cb, 1500));
    idle(() => { import("./shop").then((m) => m.prefetchShopProducts()).catch(() => undefined); });
  }, [shopOn]);

  // ⚡ Xizmatlar issiq start (shop bilan bir xil): chunk + katalog datasi idle'da isitiladi —
  // birinchi bosishda skeleton YO'Q, tab bir zumda ochiladi.
  const xizmatlarOn = !!me?.flags?.xizmatlar;
  useEffect(() => {
    if (!xizmatlarOn) return;
    const w = window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void };
    const idle = (cb: () => void) => (w.requestIdleCallback ? w.requestIdleCallback(cb, { timeout: 3000 }) : setTimeout(cb, 1500));
    idle(() => { import("./services").then((m) => m.prefetchServiceData()).catch(() => undefined); });
  }, [xizmatlarOn]);

  // ⚡ E'lonlar issiq start (shop/xizmatlar bilan bir xil naqsh) — birinchi bosishda skeleton YO'Q.
  const elonlarOn = !!me?.flags?.elonlar;
  useEffect(() => {
    if (!elonlarOn) return;
    const w = window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void };
    const idle = (cb: () => void) => (w.requestIdleCallback ? w.requestIdleCallback(cb, { timeout: 3000 }) : setTimeout(cb, 1500));
    idle(() => { import("./elonlar").then((m) => m.prefetchElonlarAds()).catch(() => undefined); });
  }, [elonlarOn]);

  const reload = () => {
    api
      .me()
      .then((r) => {
        if (!("linked" in r && r.linked === false)) {
          setMe(r as MeResponse);
          writeMeCache(r as MeResponse);
        }
      })
      .catch(() => undefined);
  };

  // ‹ ORQAGA (Bot API 6.1) — Android'da apparat «orqaga» tugmasi shu yerga yo'naltiriladi. Ilgari
  // biz bu tugmani hech qachon ko'rsatmaganimiz uchun u ilovani BUTUNLAY YOPARDI: xaritadan,
  // taklif va tarix ekranlaridan, hatto Do'kon tabidan ham. Hooklar quyidagi erta return'lardan
  // OLDIN — ustma-ust ochilgan ekranlar stek bo'lib ishlaydi, eng ustkisi g'olib.
  useBackButton(booking, () => setBooking(false));
  useBackButton(invite, () => setInvite(false));
  useBackButton(history, () => setHistory(false));
  // Boshqa tabdan Uy'ga. `go()` emas — u quyiroqda e'lon qilingan; "uy" ga o'tishda uning
  // deep-link qorong'i-flag qorovullari baribir qo'llanmaydi, ya'ni natija AYNAN bir xil.
  useBackButton(!booking && !invite && !history && tab !== "uy", () => setTab("uy"));

  if (error) return <ErrorScreen error={error} />;
  if (linked === null) return <BootSplash />;
  if (linked === false) return <GuestApp flags={guestFlags} />;
  if (!me) return <BootSplash />;
  if (booking) return <Suspense fallback={<BootSplash />}><Booking3View me={me} onClose={() => setBooking(false)} /></Suspense>;
  if (invite) return <div className="app"><main className="content"><Suspense fallback={<Spinner />}><ReferralView onClose={() => setInvite(false)} story={!!me.flags?.storyshare} /></Suspense></main></div>;
  if (history) return <div className="app"><main className="content"><Suspense fallback={<Spinner />}><RideHistoryView onClose={() => setHistory(false)} /></Suspense></main></div>;

  const go = (t: Tab) => {
    if (t === "dokon" && !me.flags?.shop) t = "uy"; // 🛍 deep-link guard: shop dark → land home
    if (t === "xizmat" && !me.flags?.xizmatlar) t = "uy"; // 🔎 deep-link guard: xizmatlar dark → land home
    if (t === "elonlar" && !me.flags?.elonlar) t = "reyting"; // 📋 deep-link guard: elonlar dark → land on Reyting (its old slot)
    if (t === "restoran" && !me.flags?.restoran) t = "uy"; // 🍽 deep-link guard: restoran dark → land home
    if (t === "ravella" && !me.flags?.ravella) t = "uy"; // 🎀 deep-link guard: ravella dark → land home
    if (t === "oyin" && !me.flags?.oyin) t = "uy"; // 🎮 deep-link guard: Koson O'yini dark → land home
    if (t === tab) return;
    haptic();
    setTab(t);
    if (t === "reyting" && !boardRequested) {
      setBoardRequested(true);
      loadBoard();
    }
  };
  // child components nav by string label (incl. old names) → map to the 5 tabs
  const nav = (t: string) => {
    if (t === "invite") { haptic(); setInvite(true); return; } // 🎁 open invite overlay directly
    if (t === "history") { haptic(); setHistory(true); return; } // 📜 open ride-history overlay
    // 🏠 UY feed card target, e.g. "dokon:35" / "restoran:5" — open that exact item, not just the tab.
    const feedItem = /^(dokon|restoran):(\d+)$/.exec(t);
    if (feedItem) {
      const id = Number(feedItem[2]);
      if (feedItem[1] === "dokon") setOpenProductFromFeed(id); else setOpenRestoranFromFeed(id);
      go(feedItem[1] as Tab);
      return;
    }
    go(GO_MAP[t] ?? "uy");
  };

  const flash = (msg: string) => {
    haptic();
    setToast({ id: Date.now(), msg });
    reload();
    setTimeout(() => setToast((c) => (c && Date.now() - c.id >= 3500 ? null : c)), 3600);
  };

  // Pastki bar: Uy · Hamyon · (Daromad drayver) · Do'kon · Xizmatlar · Reyting.
  const hasShop = !!me.flags?.shop;
  const DOKON_TAB = { id: "dokon" as Tab, icon: "market", label: "Do'kon" };
  let TABS = me.type === "driver" ? DRIVER_TABS : BASE_TABS;
  // 🛍 Do'kon (feature "shop"): HAR ikkala tip uchun Reyting'dan OLDIN qo'shiladi (max 6 tab).
  if (hasShop) {
    const ri = TABS.findIndex((t) => t.id === "reyting");
    TABS = ri >= 0 ? [...TABS.slice(0, ri), DOKON_TAB, ...TABS.slice(ri)] : [...TABS, DOKON_TAB];
  }
  // 🔎 Xizmatlar (feature "xizmatlar"): Reyting'dan OLDIN — katalog kirish nuqtasi doim ko'z oldida.
  if (me.flags?.xizmatlar) {
    const XIZMAT_TAB = { id: "xizmat" as Tab, icon: "search", label: "Xizmatlar" };
    const ri = TABS.findIndex((t) => t.id === "reyting");
    TABS = ri >= 0 ? [...TABS.slice(0, ri), XIZMAT_TAB, ...TABS.slice(ri)] : [...TABS, XIZMAT_TAB];
  }
  // 📋 E'lonlar (feature "elonlar", E1): flag ON bo'lsa Reyting'ning tabbar o'rnini egallaydi —
  // Reyting ekrani o'zi o'chmaydi, faqat kirish nuqtasi uy tugmasiga ko'chadi (home.tsx/uy.tsx +
  // GO_MAP orqali hali ham ochiladi). Flag OFF bo'lsa tabbar ESKIcha (Reyting joyida) qoladi.
  // 2026-07-23: owner — pastki tabbardan HOZIRCHA olib qo'yildi (Reyting joyida qoladi). E'lonlar
  // xizmatining o'zi O'CHMAGAN — nh-rail/hub "E'lon" tugmasi + go=elonlar deep-link orqali hali
  // ham ochiladi. Qayta yoqish: shu shartni `me.flags?.elonlar` ga qaytaring.
  const ELONLAR_IN_TABBAR = false;
  if (ELONLAR_IN_TABBAR && me.flags?.elonlar) {
    const ELONLAR_TAB = { id: "elonlar" as Tab, icon: "board", label: "E'lonlar" };
    TABS = TABS.map((t) => (t.id === "reyting" ? ELONLAR_TAB : t));
  }
  // 🍽 Restoran (feature "restoran", RESTORAN_PLAN W1/R1): "wallet"ning bo'shagan tab-slotini
  // to'ldiradi — Do'kon/Xizmatlar bilan bir xil, Reyting'dan OLDIN qo'shiladi.
  if (me.flags?.restoran) {
    const RESTORAN_TAB = { id: "restoran" as Tab, icon: "food", label: "Restoran" };
    const ri = TABS.findIndex((t) => t.id === "reyting" || t.id === "elonlar");
    TABS = ri >= 0 ? [...TABS.slice(0, ri), RESTORAN_TAB, ...TABS.slice(ri)] : [...TABS, RESTORAN_TAB];
  }
  // 🏠 newhome: Liquid-Glass tabbar — FIXED 4-tab set (owner-confirmed 2026-07-23): Uy · Do'kon ·
  // Restoran · Profil, taxi reached via the center FAB. Xizmatlar/E'lonlar/Yo'l/Bonus/Reyting live
  // ONLY in the home rail + "Barchasi" hub — they no longer clutter the bar (previously the dynamic
  // flag-accumulation above grew the classic bar to 5-6 tabs, which is what we're replacing here).
  // Drivers keep the classic dynamic bar (Uy/Daromad/Reyting) — driver economy wasn't in this redesign's scope.
  const newhomeUi = me.type !== "driver"; // `newhome` bayrog'i olib tashlandi (QABUL, doim ON)
  if (newhomeUi) {
    TABS = [
      { id: "uy" as Tab, icon: "home", label: "Uy" },
      { id: "dokon" as Tab, icon: "market", label: "Do'kon" },
      { id: "restoran" as Tab, icon: "food", label: "Restoran" },
      { id: "profile" as Tab, icon: "user", label: "Profil" },
    ];
  }
  const TAB_PCT = 100 / TABS.length;
  const activeIndex = TABS.findIndex((t) => t.id === tab);
  // 🏪 BirJoy Market v2: yangi qorong'i-oynasimon dizayn — flag ON'da shop-light/bazar-light
  // OVERRIDE qo'llanmaydi (ilovaning tabiiy qorong'i bazaviy temasi ko'rinadi), o'rniga `bjm`
  // klassi shop.tsx'dagi yangi dark-glass elementlarga aksent-uslub beradi.
  // 🎮 `oyin-full` — o'yin ekrani ilova qobig'ining padding'idan (10px 16px 96px) CHIQADI.
  // Usiz o'yin ekran o'rtasida "qog'oz to'rtburchak" bo'lib turardi va o'z tab-qatori ekran
  // pastiga yetmasdi (100dvh + padding = ekrandan baland).
  const shellCls = tab === "oyin" ? "app oyin-full" : tab === "dokon" ? "app bjm" : tab === "elonlar" ? "app elonlar-light" : tab === "xizmat" ? "app xizmat-light" : tab === "restoran" ? "app restoran-light" : tab === "ravella" ? "app ravella-light" : "app";

  // 📱 Uy tabida topbar ko'rsatilmaydi (pastdagi shart) → xavfsiz zonani `.content` oladi, aks holda
  // to'liq ekran rejimida birinchi karta Telegram'ning ✕/⌄/⋮ paneli ostida qoladi.
  // 🎮 O'yin ham to'liq ekran (ega qarori 2026-08-02): topbarda unga NOM yo'q edi — sarlavhasiz
  // bo'sh panel ~52px joyni yeb turardi. Qoida: panel yo nomli, yo umuman yo'q.
  const noTopbar = tab === "uy" || tab === "oyin";

  return (
    <div className={(newhomeUi ? shellCls + " nh-app" : shellCls) + (noTopbar ? " no-topbar" : "")}>
      <div className="aurora" />
      {/* Minimalizm (ega qarori 2026-07-26): tepada FAQAT joriy bo'lim nomi qoladi.
          Olib tashlandi — brend nomi (har ekranda takrorlanardi), a'zolar-chipi, tanga-pill
          (balans endi FAQAT bosh sahifadagi hamyon kartasida — bitta joyda) va avatar
          (profilga pastki tab orqali kiriladi, ikkinchi yo'l shart emas).
          Uy tabida sarlavha umuman ko'rsatilmaydi — bo'sh panel joy egallamasin. */}
      {tab !== "uy" && (
        <header className="topbar topbar-min">
          <span className="brand-name">
            {tab === "wallet" ? "Hamyon"
              : tab === "dokon" ? "Do'kon"
              : tab === "xizmat" ? "Xizmatlar"
              : tab === "elonlar" ? "E'lonlar"
              : tab === "restoran" ? "Restoran"
              : tab === "ravella" ? "Ravella"
              : tab === "reyting" ? "Reyting"
              : tab === "driver" ? "Daromad"
              : tab === "profile" ? "Profil"
              : ""}
          </span>
        </header>
      )}

      {toast && (
        <div className="toast" key={toast.id} onClick={() => setToast(null)}>
          {toast.msg}
        </div>
      )}

      <main className="content">
        {/* 🏠 Ekranga qo'shish taklifi — faqat Uy tabida, faqat flag ON'da (ega QABUL'igacha DARK). */}
        {tab === "uy" && me.flags?.homescreen && <AddToHomeCard onBanner={flash} />}
        <div className="page" key={tab}>
          <Suspense fallback={<Spinner />}>
            {tab === "uy" && <NewUyView me={me} onBook={() => { haptic(); setBooking(true); }} onNav={nav} onBanner={flash} />}
            {tab === "wallet" && <WalletView me={me} onBanner={flash} reload={reload} onBook={() => { haptic(); setBooking(true); }} onNav={nav} />}
            {tab === "play" && (
              <>
                <TierLadder me={me} />
                <RewardsView me={me} onReward={flash} />
                <MissionsView onReward={flash} />
              </>
            )}
            {tab === "reyting" &&
              (board ? (
                <>
                  <LeaderboardView board={board} />
                  <ReferralView story={!!me.flags?.storyshare} />
                </>
              ) : boardErr ? (
                <LoadError onRetry={loadBoard} />
              ) : (
                <Spinner />
              ))}
            {tab === "yol" && <IntercityView me={me} />}
            {tab === "dokon" && <ShopView me={me} onBanner={flash} reload={reload} onBook={() => { haptic(); setBooking(true); }} openProductId={openProductFromFeed ?? deepProduct} />}
            {tab === "xizmat" && <XizmatlarView me={me} onBanner={flash} />}
            {tab === "elonlar" && <ElonlarView me={me} onBanner={flash} reload={reload} />}
            {tab === "restoran" && <RestoranView me={me} onBanner={flash} openRestaurantId={openRestoranFromFeed} />}
            {tab === "ravella" && <RavellaView me={me} onBanner={flash} />}
            {/* O'yindagi "Safar qilish" tugmasi taksi formasini TO'G'RIDAN ochadi — avval u
                faqat "Uy ekranidan chaqiring" degan toast chiqaradigan boshi berk tugma edi. */}
            {tab === "oyin" && <OyinView onTaxi={() => { haptic(); setBooking(true); }} joinCode={deepGashtakCode} />}
            {tab === "driver" && <DriverView me={me} />}
            {tab === "profile" && <NewProfileView me={me} onNav={nav} onBanner={flash} />}
          </Suspense>
        </div>
      </main>

      {/* 🎮 O'yin ekranida ilova menyusi CHIZILMAYDI: o'yinning O'Z 3 tabi bor edi va ikkalasi
          ustma-ust tushib, pastda ikki qator menyu chiqardi. Qoida: bitta ekran — bitta pastki
          menyu. Orqaga qaytish Telegram BackButton orqali (yuqorida useBackButton). */}
      {tab !== "oyin" && (
      <nav className="tabbar">
        {/* activeIndex === -1 bo'ladi hozirgi ekran tabbarda YO'Q bo'lganda (masalan Hamyon — W1'dan keyin
            tab tugmasi yo'q, Uy'dan ochiladi). Bunday paytda indikatorni yashiramiz, aks holda chapga sakraydi. */}
        {!newhomeUi && activeIndex >= 0 && (
          <span className="tab-ind" ref={(el) => el?.style.setProperty("left", `calc(${activeIndex} * ${TAB_PCT}% + ${TAB_PCT / 2}%)`)} />
        )}
        {/* Markazdagi 🚖 FAB olib tashlandi (ega qarori 2026-07-26, minimalizm). Taksi chaqirish
            yo'llari saqlanib qoldi: bot menyusi, deep-link (?go=book) va boshqa ekranlardagi
            «Taxi chaqirish» tugmalari — ular setBooking(true) ni o'zgarishsiz chaqiradi. */}
        {TABS.map((t) => (
          <Fragment key={t.id}>
            <button
              className={tab === t.id ? "tab active" : "tab"}
              onClick={() => go(t.id)}
            >
              <Icon name={t.icon} filled={tab === t.id} size={23} />
              <span className="tab-label">{t.label}</span>
            </button>
          </Fragment>
        ))}
      </nav>
      )}
    </div>
  );
}

function BootSplash() {
  return (
    <div className="boot">
      <div className="aurora" />
      <div className="boot-stage">
        <div className="boot-rings"><span /><span /><span /></div>
        <div className="boot-badge"><BirJoyMark size={62} /></div>
      </div>
      <div className="boot-name">Bir<b>Joy</b></div>
      <div className="boot-tag">Bir shahar. Ko'plab xizmatlar.</div>
      <div className="boot-bar"><span /></div>
    </div>
  );
}

function ErrorScreen({ error }: { error: string }) {
  const notAuthed = error.includes("unauthorized");
  // 4-shart: internet yo'qmi yoki server uyg'onyaptimi — ALOHIDA ekranlar
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  useEffect(() => {
    if (notAuthed) return;
    const t = setTimeout(() => location.reload(), 12_000); // server-uyg'onish: avto-retry
    return () => clearTimeout(t);
  }, [notAuthed]);
  if (!notAuthed && !online) {
    return (
      <div className="screen center">
        <div className="aurora" />
        <div className="nl-card glass pad tac">
          <div className="nl-emoji">📡</div>
          <h2>Internet aloqasi yo'q</h2>
          <p className="muted">Tarmoqqa ulanib, qayta urinib ko'ring.</p>
          <button className="d-btn mt8" onClick={() => location.reload()}>🔄 Qayta urinish</button>
        </div>
      </div>
    );
  }
  if (!notAuthed) {
    return (
      <div className="screen center">
        <div className="aurora" />
        <div className="nl-card glass pad tac">
          <div className="boot-stage" style={{ margin: "4px auto 18px" }}>
            <div className="boot-rings"><span /><span /><span /></div>
            <div className="boot-badge"><BirJoyMark size={62} /></div>
          </div>
          <h2>BirJoy uyg'onmoqda…</h2>
          <p className="muted">Server bir necha soniyada tayyor bo'ladi — avtomatik qayta ulanamiz.</p>
          <div className="boot-bar" style={{ margin: "18px auto 0" }}><span /></div>
          <button className="d-btn ghost mt12" onClick={() => location.reload()}>Hozir urinish</button>
        </div>
      </div>
    );
  }
  const initData = getInitData();
  return (
    <div className="screen center">
      <div className="aurora" />
      <div className="nl-card glass pad">
        <div className="nl-emoji">{notAuthed ? "🤖" : "😴"}</div>
        <h2>{notAuthed ? "Telegram orqali oching" : "Server uyg'onmoqda"}</h2>
        <p className="muted">
          {notAuthed
            ? "Mini App'ni botdagi pastki ⊞ menyu yoki «🚀 Ilova» tugmasi orqali oching — havolani brauzerda emas."
            : "Server biroz uxlab qoldi. Bir necha soniya kuting va qayta urinib ko'ring."}
        </p>
        <button className="btn-primary" onClick={() => location.reload()}>🔄 Qayta urinish</button>
        {notAuthed && (
          <p className="muted fs11 mt12 o55" style={{ textAlign: "left", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
            {`Telegram: ${tg ? "✓" : "✗"} · initData: ${initData ? `✓ (${initData.length})` : "✗ yo'q"}\n` +
              `tg.initData: ${tg?.initData ? `✓ (${tg.initData.length})` : "✗"}\n` +
              `URL hash: ${location.hash ? `✓ (${location.hash.length})` : "✗"}\n` +
              `sessionStorage tg:initData: ${(() => { try { return sessionStorage.getItem("tg:initData") ? "✓" : "✗"; } catch { return "blocked"; } })()}\n` +
              `URL: ${location.href.length > 80 ? location.href.slice(0, 80) + "…" : location.href}`}
          </p>
        )}
      </div>
    </div>
  );
}

/** 🏠 «Telefon ekraniga qo'shish» taklifi (Telegram `addToHomeScreen`, Bot API 8.0).
 *
 *  Nega: bugun mijoz 1067 ga kirish uchun Telegram'ni ochib, botni qidirishi kerak. Ikonka bilan
 *  ilova telefon ekranidan bir bosishda ochiladi — taksi ilovasi uchun bu eng arzon qaytish
 *  (retention) mexanikasi.
 *
 *  Nazokat qoidalari (bosim EMAS, taklif): faqat `missed` holatida ko'rinadi (ya'ni klient
 *  qo'llab-quvvatlaydi VA ikonka hali yo'q), faqat Uy tabida, va «Keyinroq» bosilsa 30 kun jim.
 *  Qo'shilgani `homeScreenAdded` hodisasi bilan tasdiqlanadi — taxmin qilmaymiz. */
const HS_KEY = "hs_dismissed_at";
const HS_QUIET_MS = 30 * 24 * 3600 * 1000;

function AddToHomeCard({ onBanner }: { onBanner: (msg: string) => void }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    let alive = true;
    const quiet = (at: number) => !!at && Date.now() - at < HS_QUIET_MS;
    let localAt = 0;
    try { localAt = Number(localStorage.getItem(HS_KEY) ?? 0); } catch { /* private mode */ }
    if (quiet(localAt)) return; // yaqinda rad etilgan — bezovta qilmaymiz
    // ☁️ Boshqa qurilmada rad etilgan bo'lsa ham hurmat qilamiz: bitta "yo'q" — hamma qurilmada.
    void (async () => {
      const cloudAt = Number((await cloudGet(HS_KEY)) ?? 0);
      if (!alive || quiet(cloudAt)) return;
      const s = await homeScreenStatus().catch(() => "unsupported" as const);
      if (alive && s === "missed") setShow(true);
    })();
    return () => { alive = false; };
  }, []);
  // `onBanner` har renderda yangi funksiya (inline `flash`) — ref'da saqlanadi, aks holda obuna
  // har renderda uzilib-ulanib turardi.
  const bannerRef = useRef(onBanner);
  bannerRef.current = onBanner;
  useEffect(() => {
    if (!show) return;
    return onHomeScreenAdded(() => {
      setShow(false);
      hapticSuccess();
      bannerRef.current("🏠 Tayyor! 1067 telefon ekraningizda.");
    });
  }, [show]);
  if (!show) return null;
  const dismiss = () => {
    haptic();
    const at = String(Date.now());
    try { localStorage.setItem(HS_KEY, at); } catch { /* ignore */ }
    cloudSet(HS_KEY, at); // ☁️ boshqa qurilmada ham qayta so'ramaymiz
    setShow(false);
  };
  return (
    <div className="hs-card">
      <span className="hs-ic">🏠</span>
      <div className="hs-txt">
        <b>Ekranga qo'shing</b>
        <small>1067 bir bosishda ochiladi — botni qidirmaysiz</small>
      </div>
      <button className="hs-add" onClick={() => { haptic(); addToHomeScreen(); }}>Qo'shish</button>
      <button className="hs-x" onClick={dismiss} aria-label="Keyinroq">✕</button>
    </div>
  );
}

function openLinkBot(): void {
  haptic();
  const url = "https://t.me/koson1067bot?start=link";
  if (tg?.openTelegramLink) tg.openTelegramLink(url);
  else window.open(url, "_blank");
}

/** 📱 RAQAMNI ILOVA ICHIDA ULASH (Bot API 6.9 `requestContact`).
 *
 *  Ilgari mehmon "Raqamni ulash" bosganda ilovadan CHIQIB botga otilardi — va ko'pchilik
 *  qaytmasdi: /start bosgan 1060 odamdan 289 tasi ulanmagan, 286 tasi tugmani umuman bosmagan
 *  (DB, 2026-07-26). Endi Telegram'ning o'z tasdiq oynasi shu yerda ochiladi va ulanish ilovani
 *  tark etmasdan tugaydi. Eski klient yoki xato — eski bot-yo'li fallback bo'lib qoladi, ya'ni
 *  hech kim yo'lda qolib ketmaydi.
 *
 *  Raqam bu yerda TEKSHIRILMAYDI: imzolangan javob serverga uzatiladi, haqiqiyligini bot tokeni
 *  bilan FAQAT server hal qiladi (/api/link/contact). */
function useLinkFlow(flash: (msg: string) => void, enabled: boolean) {
  const [busy, setBusy] = useState(false);
  const start = async (): Promise<void> => {
    if (busy) return;
    // Kill-switch: `linkinapp` OFF bo'lsa eski bot-yo'li AYNAN ishlaydi (ega QABUL'igacha).
    if (!enabled) { openLinkBot(); return; }
    haptic();
    setBusy(true);
    try {
      const ask = await askContact();
      if (ask.status === "unsupported") { openLinkBot(); return; } // eski klient → bot yo'li
      if (ask.status === "cancelled") { flash("Bekor qilindi — istalgan payt qayta urinib ko'rasiz."); return; }
      const r = await api.linkContact(ask.response, ask.hash);
      if (r.ok) {
        hapticSuccess();
        flash("✅ Raqam ulandi! Ilova yangilanmoqda…");
        setTimeout(() => location.reload(), 800); // butun qobiq ulangan foydalanuvchi sifatida qayta yuklanadi
        return;
      }
      flash(
        r.status === "not_found" ? "Bu raqam 1067 bazasida topilmadi. Bot orqali urinib ko'ring."
          : r.status === "taken" ? "Bu raqam boshqa Telegram hisobiga ulangan."
          : r.status === "banned" ? "Bu raqam bloklangan. Savol bo'lsa: 1067"
          : "Ulanmadi — bot orqali urinib ko'ring.",
      );
    } catch {
      // 400/403 (imzo/identifikatsiya xatosi) yoki tarmoq — mijozga sabab emas, YO'L kerak.
      flash("Ulanmadi — bot orqali urinib ko'ring.");
    } finally {
      setBusy(false);
    }
  };
  return { busy, start };
}

/** 🚪 MEHMON REJIMI. Bu ekran avval `NotLinked` — bironta tugmasiz boshi berk ko'cha edi: «botga
 *  kiring va raqamingizni ulang». DB (2026-07-26): /start bosgan 1 060 odamdan 289 tasi ulanmagan,
 *  shundan 286 tasi tugmani umuman bosmagan. Ular hech narsa ko'rmasdan turib raqam so'ralgani
 *  uchun qaytgan. Endi katalog OCHIQ — do'kon, restoran, xizmatlar bemalol ko'riladi; raqam faqat
 *  harakat (buyurtma / taksi / hamyon) paytida so'raladi. Server tomonida bu marshrutlar
 *  `allowGuest` bilan ochilgan, pul va shaxsiy ma'lumot tegadigan hammasi `requireUser`da qoladi. */
function guestMe(flags: MeResponse["flags"]): MeResponse {
  return {
    linked: false,
    type: "client",
    metricLabel: "Bonus",
    member: { id: 0, fullName: "Mehmon", phone: null, carNumber: null, mahallaId: null, travelMahallaId: null },
    stats: { points: 0, trips: 0, rating: 0 },
    level: { index: 0, name: "Mehmon", emoji: "👋", color: "#64748b" },
    nextLevel: null,
    xp: 0,
    xpIntoLevel: 0,
    xpForNext: null,
    progress: 0,
    rank: null,
    totalMembers: 0,
    badges: [],
    streak: { current: 0, longest: 0, checkedToday: false },
    wheelAvailable: false,
    jackpot: 0,
    coins: 0,
    leagueTier: "Bronza",
    flags,
  };
}

function GuestApp({ flags }: { flags: MeResponse["flags"] }) {
  const me = guestMe(flags);
  // 🎮 O'yin mehmonga ham ko'rinadi: taklif havolasi orqali kelgan odam sovrinlarni ko'rmasa,
  // butun viral halqa shu yerda uziladi (avval u Do'kon ro'yxatiga tushib qolardi).
  const tabs = [
    flags?.oyin ? { id: "oyin" as const, icon: "gift", label: "Sodiqlik" } : null,
    flags?.shop ? { id: "dokon" as const, icon: "market", label: "Do'kon" } : null,
    flags?.restoran ? { id: "restoran" as const, icon: "food", label: "Restoran" } : null,
    flags?.xizmatlar ? { id: "xizmat" as const, icon: "search", label: "Xizmatlar" } : null,
  ].filter(Boolean) as { id: "oyin" | "dokon" | "restoran" | "xizmat"; icon: string; label: string }[];
  // Deep-link (?go=oyin — bot kartochkasidagi tugma) o'yin tabini birinchi ochadi.
  const wantsOyin = (() => {
    try { return new URLSearchParams(location.search).get("go") === "oyin"; } catch { return false; }
  })();
  const [tab, setTab] = useState<"oyin" | "dokon" | "restoran" | "xizmat">(
    wantsOyin && flags?.oyin ? "oyin" : (tabs[0]?.id ?? "dokon"),
  );
  const [msg, setMsg] = useState<string | null>(null);
  const flash = (m: string) => {
    setMsg(m);
    setTimeout(() => setMsg(null), 3200);
  };
  // 📱 Ulash endi ilova ICHIDA (requestContact) — hooklar erta return'dan OLDIN chaqiriladi.
  const link = useLinkFlow(flash, !!flags?.linkinapp);
  // ‹ Orqaga: mehmon ham birinchi tabga qaytadi, ilova yopilmaydi.
  const firstTab = tabs[0]?.id;
  useBackButton(!!firstTab && tab !== firstTab, () => setTab(firstTab ?? "dokon"));
  // Ko'rish uchun ochiq tab bo'lmasa — eski (tugmali) taklif ekrani.
  if (!tabs.length) {
    return (
      <div className="screen center">
        <div className="aurora" />
        {msg && <div className="toast">{msg}</div>}
        <div className="nl-card glass pad tac">
          <div className="nl-emoji">🔗</div>
          <h2>Bir qadam qoldi</h2>
          <p className="muted">Raqamingizni ulasangiz — taksi chaqirasiz, tanga va cashback yig'asiz, buyurtma berasiz.</p>
          <button className="btn-primary" onClick={() => void link.start()} disabled={link.busy}>
            {link.busy ? "⏳ Ulanmoqda…" : "📱 Raqamni ulash"}
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="app nh-app no-topbar">
      {msg && <div className="toast">{msg}</div>}
      <div className="view">
        <Suspense fallback={<Spinner />}>
          {tab === "oyin" && <OyinTeaser onLink={() => void link.start()} busy={link.busy} />}
          {tab === "dokon" && <ShopView me={me} onBanner={flash} reload={() => undefined} onBook={() => void link.start()} />}
          {tab === "restoran" && <RestoranView me={me} onBanner={flash} />}
          {tab === "xizmat" && <XizmatlarView me={me} onBanner={flash} />}
        </Suspense>
      </div>
      {/* Doimiy taklif — bosim emas, taklif: nima ochilishini aytadi va bir bosishda ulaydi. */}
      <button className="guest-bar" onClick={() => void link.start()} disabled={link.busy}>
        <span className="gb-txt"><b>Raqamni ulang</b><small>{tab === "oyin" ? "Ball yig'ish va mukofotlarda qatnashish uchun" : "Buyurtma berish, taksi va tanga uchun"}</small></span>
        <span className="gb-cta">{link.busy ? "⏳" : "Ulash"}</span>
      </button>
      <nav className="tabbar">
        {tabs.map((t) => (
          <button key={t.id} className={tab === t.id ? "tab active" : "tab"} onClick={() => { haptic(); setTab(t.id); }}>
            <Icon name={t.icon} />
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
