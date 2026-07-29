// 🧱 SHELL — yon panel · tepa panel · sahifa idishi.
import { useEffect, useState, type ReactNode } from "react";
import { clearAdminToken } from "../api";
import { Badge, Button, Kbd } from "../design/kit";
import { buildHash } from "../lib/routing";
import { labelOf, navFor } from "./nav";

const THEME_KEY = "admin_theme";

function useTheme(): [("dark" | "light"), () => void] {
  const [theme, setTheme] = useState<"dark" | "light">(() =>
    (localStorage.getItem(THEME_KEY) as "dark" | "light") || "dark",
  );
  useEffect(() => {
    document.documentElement.setAttribute("data-a2", theme);
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);
  return [theme, () => setTheme((t) => (t === "dark" ? "light" : "dark"))];
}

export function Shell({
  role,
  operatorName,
  view,
  onOpenPalette,
  children,
}: {
  role: string | null;
  operatorName?: string;
  view: string;
  onOpenPalette: () => void;
  children: ReactNode;
}) {
  const [theme, toggleTheme] = useTheme();
  const [min, setMin] = useState(() => localStorage.getItem("admin_sb_min") === "1");
  const [openMobile, setOpenMobile] = useState(false);
  const groups = navFor(role);

  useEffect(() => {
    localStorage.setItem("admin_sb_min", min ? "1" : "0");
  }, [min]);

  // ekran o'zgarganda telefon-panel yopiladi
  useEffect(() => setOpenMobile(false), [view]);

  return (
    <div className={`a2 a2-app${min ? " a2-app-min" : ""}`}>
      <aside className={`a2-sb${openMobile ? " a2-sb-open" : ""}`}>
        <div className="a2-sb-brand">
          <span className="a2-sb-mark">B</span>
          <span className="a2-sb-name">BirJoy</span>
        </div>
        <nav className="a2-sb-nav">
          {groups.map((g) => (
            <div className="a2-sb-group" key={g.label}>
              <div className="a2-sb-group-lbl">{g.label}</div>
              {g.items.map((it) => (
                <a
                  key={it.id}
                  className="a2-sb-item"
                  href={buildHash(it.id)}
                  aria-current={view === it.id ? "page" : undefined}
                  title={it.label}
                >
                  <span className="a2-sb-ico" aria-hidden>
                    {it.icon}
                  </span>
                  <span>{it.label}</span>
                </a>
              ))}
            </div>
          ))}
        </nav>
        <div className="a2-sb-foot">
          <Button size="sm" variant="ghost" block onClick={() => setMin((v) => !v)} title="Yon panelni yig'ish">
            {min ? "»" : "« Yig'ish"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            block
            onClick={() => {
              clearAdminToken();
              location.reload();
            }}
          >
            {min ? "⏻" : "Chiqish"}
          </Button>
        </div>
      </aside>

      {openMobile && <div className="a2-scrim" onClick={() => setOpenMobile(false)} />}

      <div className="a2-main">
        <header className="a2-top">
          <Button size="sm" variant="ghost" icon onClick={() => setOpenMobile((v) => !v)} title="Menyu">
            ☰
          </Button>
          <span className="a2-crumb">{labelOf(view)}</span>
          <div className="a2-spacer" />
          <button type="button" className="a2-omni" onClick={onOpenPalette}>
            <span aria-hidden>🔍</span>
            <span className="a2-omni-txt">Ekran, ism, telefon…</span>
            <Kbd>⌘K</Kbd>
          </button>
          {role === "chatops" ? (
            <Badge tone="brand">🎧 {operatorName ?? "Operator"}</Badge>
          ) : (
            <Badge tone="neutral">👑 Ega</Badge>
          )}
          <Button size="sm" variant="ghost" icon onClick={toggleTheme} title="Tema">
            {theme === "dark" ? "☀" : "🌙"}
          </Button>
        </header>
        <main className="a2-page">{children}</main>
      </div>
    </div>
  );
}
