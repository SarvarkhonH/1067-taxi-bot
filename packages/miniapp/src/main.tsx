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
