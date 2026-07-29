// ═══════════════════════════════════════════════════════════════════════════
// BirJoy Admin v2 — ILDIZ (shell + routing). Eski 5419-qatorli App.tsx bilan
// YONMA-YON yashaydi: `localStorage.admin_ui = "v2"` tanlaydi (yoki `chatops`
// roli — operator uchun v2 majburiy, chunki eski panelda operator-shell yo'q).
//
// Reja 12-qadamida parity-audit tugagach v2 default bo'ladi va LegacyApp
// o'chadi. Shu paytgacha eski panel BITTA tugma naridа turadi — hech qanday
// imkoniyat yo'qolmaydi.
// ═══════════════════════════════════════════════════════════════════════════
import { Suspense, lazy, useEffect, useState } from "react";
import { adminApi, clearAdminToken } from "../api";
import { Async, Button, Panel, Spinner, ToastHost } from "../design/kit";
import { useRoute } from "../lib/routing";
import { CommandPalette } from "./CommandPalette";
import { Shell } from "./Shell";
import "../design/tokens.css";
import "../design/base.css";
import "../design/feat/kit.css";
import "../design/feat/chart.css";
import "../design/feat/shell.css";

// Ekranlar lazy — har biri o'z chunk'ida (33 ekranni bitta bundle'ga
// yig'ish eski panelning muammosi edi: 406KB bitta fayl).
const Bugun = lazy(() => import("./views/Bugun").then((m) => ({ default: m.Bugun })));

/** Hali ko'chirilmagan ekranlar uchun halol placeholder — "tayyor" ko'rinib
 *  turmasin. Reja bo'yicha 5-11 qadamlarda to'ldiriladi. */
function Todo({ view }: { view: string }) {
  return (
    <Panel title={view}>
      <div className="a2-col-3">
        <p className="a2-dim">Bu ekran hali v2'ga ko'chirilmagan.</p>
        <p className="a2-dim-2">
          Hozircha eski paneldan foydalaning — pastdagi tugma bir bosishda qaytaradi va u yerda hamma narsa
          o'z holida ishlayapti.
        </p>
        <div>
          <Button
            size="sm"
            onClick={() => {
              localStorage.removeItem("admin_ui");
              location.reload();
            }}
          >
            ← Eski panelga qaytish
          </Button>
        </div>
      </div>
    </Panel>
  );
}

function Router({ view }: { view: string }) {
  if (view === "bugun") return <Bugun />;
  return <Todo view={view} />;
}

export function AdminV2() {
  const route = useRoute();
  const [role, setRole] = useState<string | null>(null);
  const [operatorName, setOperatorName] = useState<string | undefined>();
  const [err, setErr] = useState<string | null>(null);
  const [pal, setPal] = useState(false);

  useEffect(() => {
    adminApi
      .whoami()
      .then((r) => {
        setRole(r.role);
        setOperatorName(r.operatorName);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, []);

  // ⌘K / Ctrl+K — global qidiruv. `/` ham ochadi (input ichida bo'lmasa).
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const inField = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement)?.tagName ?? "");
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setPal(true);
      } else if (e.key === "/" && !inField) {
        e.preventDefault();
        setPal(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (err === "forbidden") {
    clearAdminToken();
    location.reload();
    return null;
  }

  return (
    <ToastHost>
      <Shell role={role} operatorName={operatorName} view={route.view} onOpenPalette={() => setPal(true)}>
        <Async data={role ?? (err ? null : undefined)} error={err} skeleton={<div className="a2-center"><Spinner large /></div>}>
          {() => (
            <Suspense fallback={<div className="a2-center"><Spinner large /></div>}>
              <Router view={route.view} />
            </Suspense>
          )}
        </Async>
      </Shell>
      <CommandPalette open={pal} onClose={() => setPal(false)} role={role} />
    </ToastHost>
  );
}
