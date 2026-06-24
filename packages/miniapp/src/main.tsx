import React, { Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ErrorBoundary } from "./ErrorBoundary";
import { initTelegram } from "./telegram";
import "./styles.css";
import "./design/tokens.css";

initTelegram();

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
