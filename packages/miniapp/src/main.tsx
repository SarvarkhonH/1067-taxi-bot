import React, { Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ErrorBoundary } from "./ErrorBoundary";
import { initTelegram } from "./telegram";
import "./styles.css";
import "./design/tokens.css";

initTelegram();

// 🔄 Stale-SPA self-heal: after a new deploy, a Telegram-cached old index.html references chunk
// hashes that no longer exist on the alias → a lazy tab (Do'kon/Xizmatlar/E'lonlar/…) fails to load
// («kirib bo'lmayapti»). Vite fires `vite:preloadError` on such a failure — reload ONCE (guarded by a
// sessionStorage flag so a genuinely-broken chunk can't loop) to fetch the fresh index + chunks.
window.addEventListener("vite:preloadError", (e) => {
  e.preventDefault();
  if (!sessionStorage.getItem("chunk_reloaded")) {
    sessionStorage.setItem("chunk_reloaded", "1");
    window.location.reload();
  }
});
window.addEventListener("load", () => { try { sessionStorage.removeItem("chunk_reloaded"); } catch { /* ignore */ } });

// 🔄 VERSIYA QOROVULI (ega, 2026-07-29: «har qancha vaqtga bir bot eski dizaynga o'tadi»).
// Telegram Mini App yopilganda WebView O'CHMAYDI — fonda turadi va qayta ochilganda ESKI JS
// davom etadi. Shuning uchun deploy chiqqani bilan mijoz uni ko'rmasligi mumkin (ba'zan
// kunlab). Bu qorovul: ilova ko'rinadigan bo'lganda serverdagi `version.txt` ni so'raydi va
// o'zining `<meta name="birjoy-build">` shtampi bilan solishtiradi; farq bo'lsa BIR MARTA
// qayta yuklanadi.
// XAVFSIZLIK: (1) faqat ikkala qiymat ham bo'lsa va farq qilsa; (2) sessiyada bir marta —
// tarmoq g'alati javob qaytarsa ham cheksiz sikl bo'lmaydi; (3) tekshiruv 60 soniyada bir
// martadan tez emas; (4) xato bo'lsa jim (ilova ishlashda davom etadi).
const MY_BUILD = document.querySelector('meta[name="birjoy-build"]')?.getAttribute("content") ?? "";
let lastCheck = 0;
async function checkForNewBuild(): Promise<void> {
  if (!MY_BUILD || document.hidden) return;
  if (Date.now() - lastCheck < 60_000) return;
  lastCheck = Date.now();
  try {
    const res = await fetch(`/version.txt?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return;
    const live = (await res.text()).trim();
    if (!live || live === MY_BUILD) return;
    if (sessionStorage.getItem("build_reloaded") === live) return; // shu versiyaga bir marta
    sessionStorage.setItem("build_reloaded", live);
    // ⚠️ Oddiy `reload()` YETARLI EMAS (ega: «bir yangisi, bir eskisi ochilyapti»): bot har xil
    // joyda har xil manzil beradi — menyu tugmasi `?v=<bundle-hash>` bilan, ESKI xabarlardagi
    // tugmalar esa eski `?v=` yoki umuman `v` siz. Har manzil WebView uchun ALOHIDA kesh yozuvi,
    // shuning uchun goh yangi, goh eski ochiladi. `v` ni JORIY shtampga almashtirsak kesh kaliti
    // ham yangilanadi. `hash` SAQLANADI — Telegram initData aynan o'sha yerda (yo'qotsak
    // "Telegram orqali oching" xatosi chiqadi).
    try {
      const u = new URL(window.location.href);
      u.searchParams.set("v", live.replace(/[^0-9]/g, ""));
      window.location.replace(u.toString());
    } catch {
      window.location.reload();
    }
  } catch { /* tarmoq — jim */ }
}
document.addEventListener("visibilitychange", () => { void checkForNewBuild(); });
window.addEventListener("focus", () => { void checkForNewBuild(); });
setTimeout(() => { void checkForNewBuild(); }, 5_000); // birinchi ochilishdan keyin ham

// 🛡 family-safety: a public ?track=<token> link opens the read-only live trip view (lazy → leaflet
// loads only for this case), bypassing the authed app entirely. No login / Telegram needed.
const trackToken = new URLSearchParams(location.search).get("track");
const TrackView = lazy(() => import("./TrackView").then((m) => ({ default: m.TrackView })));

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      {trackToken ? (
        <Suspense fallback={null}>
          <TrackView token={trackToken} />
        </Suspense>
      ) : (
        <App />
      )}
    </ErrorBoundary>
  </React.StrictMode>,
);
