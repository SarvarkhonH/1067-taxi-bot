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
import { adminApi, clearAdminToken, hasAdminToken } from "../api";
import { LoginScreen } from "../App";
import { Button, Panel, Spinner, ToastHost } from "../design/kit";
import { useRoute } from "../lib/routing";
import { CommandPalette } from "./CommandPalette";
import { Shell } from "./Shell";
import "../design/tokens.css";
import "../design/base.css";
import "../design/feat/kit.css";
import "../design/feat/chart.css";
import "../design/feat/shell.css";
import "../design/feat/table.css";

// Ekranlar lazy — har biri o'z chunk'ida (33 ekranni bitta bundle'ga
// yig'ish eski panelning muammosi edi: 406KB bitta fayl).
const Bugun = lazy(() => import("./views/Bugun").then((m) => ({ default: m.Bugun })));
const Odamlar = lazy(() => import("./views/Odamlar").then((m) => ({ default: m.Odamlar })));
const Jonli = lazy(() => import("./views/Jonli").then((m) => ({ default: m.Jonli })));
const Hikoyalar = lazy(() => import("./views/Hikoyalar").then((m) => ({ default: m.Hikoyalar })));

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
  if (view === "odamlar") return <Odamlar />;
  if (view === "jonli") return <Jonli />;
  if (view === "hikoyalar") return <Hikoyalar />;
  return <Todo view={view} />;
}

export function AdminV2() {
  const route = useRoute();
  const [role, setRole] = useState<string | null>(null);
  const [operatorName, setOperatorName] = useState<string | undefined>();
  const [authed, setAuthed] = useState<boolean>(hasAdminToken);
  const [pal, setPal] = useState(false);

  useEffect(() => {
    if (!authed) return;
    adminApi
      .whoami()
      .then((r) => {
        setRole(r.role);
        setOperatorName(r.operatorName);
      })
      .catch((e) => {
        // 403 → tokenni tozalab LOGIN ekraniga (qayta yuklash EMAS).
        // Avval bu yerda `clearAdminToken(); location.reload()` turgan edi va
        // v2'da login ekrani yo'q edi → 403 → token o'chadi → reload → yana 403
        // → CHEKSIZ QAYTA YUKLANISH, panel hech qachon ochilmasdi (jonli
        // o'lchov: localStorage.admin_token === null, sahifa bo'sh).
        if (e instanceof Error && e.message === "forbidden") {
          clearAdminToken();
          setAuthed(false);
          return;
        }
        // Boshqa xato (tarmoq/server) — rolni bilmasak ham panel ISHLAYVERADI;
        // har ekran o'z xatosini o'zi ko'rsatadi. Butun sahifani bo'shatmaymiz.
        console.error("[v2] whoami failed:", e);
      });
  }, [authed]);

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

  // Token yo'q/yaroqsiz → eski paneldagi AYNAN o'sha login ekrani (qayta
  // yozilmaydi; v2 ham, v1 ham bir xil kirish oqimidan foydalanadi).
  if (!authed) return <LoginScreen onAuthed={() => setAuthed(true)} />;

  return (
    <ToastHost>
      <Shell role={role} operatorName={operatorName} view={route.view} onOpenPalette={() => setPal(true)}>
        {/* Router HAR DOIM render bo'ladi — `whoami` javobini KUTMAYDI.
            Avval butun kontent `Async data={role}` ichida edi va bitta so'rov
            yiqilsa yoki sekinlashsa EKRAN BUTUNLAY bo'shab qolardi. */}
        <Suspense fallback={<div className="a2-center"><Spinner large /></div>}>
          <Router view={route.view} />
        </Suspense>
      </Shell>
      <CommandPalette open={pal} onClose={() => setPal(false)} role={role} />
    </ToastHost>
  );
}
