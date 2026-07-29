import React, { Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

// 🎨 #kit — v2 dizayn tizimi galereyasi (miniapp'dagi `#demo`/`#rstdemo` naqshi).
// LAZY ataylab: v2 tokenlari/stillari SHU chunk ichida, ya'ni oddiy panel
// ochilganda ular umuman yuklanmaydi va eski `styles.css`ni qayta bo'yamaydi.
// (v2 to'liq default bo'lgach — 12-qadam — bu izolyatsiya keraksiz bo'ladi.)
const KitDemo = lazy(() => import("./design/demo").then((m) => ({ default: m.KitDemo })));

const isKit = location.hash.replace(/^#\/?/, "") === "kit";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {isKit ? (
      <Suspense fallback={null}>
        <KitDemo />
      </Suspense>
    ) : (
      <App />
    )}
  </React.StrictMode>,
);
