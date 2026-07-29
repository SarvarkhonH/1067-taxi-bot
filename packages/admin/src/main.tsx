import React, { Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

// 🎨 #kit — v2 dizayn tizimi galereyasi (miniapp'dagi `#demo`/`#rstdemo` naqshi).
const KitDemo = lazy(() => import("./design/demo").then((m) => ({ default: m.KitDemo })));
// 🆕 v2 panel — eski App.tsx bilan YONMA-YON. LAZY ataylab: v2 tokenlari/stillari
// shu chunk ichida, eski panel ochilganda ular umuman yuklanmaydi va
// `styles.css`ni qayta bo'yamaydi (legacy 12-qadamgacha buzilmaydi).
const AdminV2 = lazy(() => import("./v2/AdminV2").then((m) => ({ default: m.AdminV2 })));

const UI_KEY = "admin_ui";
const hash = location.hash.replace(/^#\/?/, "");

// `#v2` / `#v1` — qaysi panelni ishlatishni belgilaydi va ESLAB QOLADI.
//
// `history.replaceState` ishlatiladi, `location.hash =` + `reload()` EMAS: ikkinchi
// yo'l ishlamaydi, chunki (a) faqat hash o'zgarishi sahifani qayta yuklamaydi va
// (b) darhol chaqirilgan `reload()` hali yangilanmagan manzilni oladi — natijada
// `#v2` ochilganda eski panel chiqib turardi (o'lchov bilan topilgan bug).
// `replaceState` esa manzilni navigatsiyasiz almashtiradi, quyidagi `isV2` esa
// localStorage'dan SHU YERDA o'qiladi, ya'ni qayta yuklash kerak emas.
if (hash === "v2" || hash === "v1") {
  if (hash === "v2") localStorage.setItem(UI_KEY, "v2");
  else localStorage.removeItem(UI_KEY);
  history.replaceState(null, "", location.pathname + (hash === "v2" ? "#/bugun" : ""));
}

const isKit = hash === "kit";
const isV2 = !isKit && localStorage.getItem(UI_KEY) === "v2";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {isKit ? (
      <Suspense fallback={null}>
        <KitDemo />
      </Suspense>
    ) : isV2 ? (
      <Suspense fallback={null}>
        <AdminV2 />
      </Suspense>
    ) : (
      <App />
    )}
  </React.StrictMode>,
);
