// ⌘K — GLOBAL QIDIRUV VA O'TISH
//
// Eski panelda yo'q edi: 33 tab orasida kerakli ekranni topish uchun sichqoncha
// bilan yon paneldan izlash kerak edi, obyektni topish uchun esa avval to'g'ri
// tabga o'tib, keyin o'sha tabning qidiruv maydonini topish kerak edi.
//
// Bu yerda ikkisi BIRGA: ekran nomi VA obyekt (telefon/ism/mashina-raqam) —
// bitta maydonda. Obyekt-qidiruv mavjud `/api/admin/users` endpointidan
// (adminSearchUsers) — yangi backend ishi YO'Q.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { adminApi, type AdminUserRow } from "../api";
import { Kbd } from "../design/kit";
import { phone as fmtPhone } from "../lib/fmt";
import { navigate } from "../lib/routing";
import { navFor, type NavItem } from "./nav";

interface Hit {
  kind: "view" | "member";
  label: string;
  sub?: string;
  go: () => void;
}

export function CommandPalette({ open, onClose, role }: { open: boolean; onClose: () => void; role: string | null }) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const [people, setPeople] = useState<AdminUserRow[]>([]);
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const views: NavItem[] = useMemo(() => navFor(role).flatMap((g) => g.items), [role]);

  useEffect(() => {
    if (open) {
      setQ("");
      setSel(0);
      setPeople([]);
    }
  }, [open]);

  // Obyekt-qidiruv: 2+ belgidan keyin, 250ms debounce (har harfda so'rov yubormaslik)
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setPeople([]);
      return;
    }
    let alive = true;
    setBusy(true);
    const t = window.setTimeout(() => {
      adminApi
        .searchUsers(term)
        .then((rows) => {
          if (alive) setPeople(rows.slice(0, 6));
        })
        .catch(() => alive && setPeople([]))
        .finally(() => alive && setBusy(false));
    }, 250);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [q]);

  const hits: Hit[] = useMemo(() => {
    const term = q.trim().toLowerCase();
    const vh: Hit[] = views
      .filter((v) => !term || v.label.toLowerCase().includes(term) || v.id.includes(term))
      .map((v) => ({ kind: "view" as const, label: v.label, sub: "ekran", go: () => navigate(v.id) }));
    const ph: Hit[] = people.map((p) => ({
      kind: "member" as const,
      label: p.fullName || `#${p.id}`,
      sub: fmtPhone(p.phone),
      go: () => navigate("odamlar", String(p.id)),
    }));
    return [...vh.slice(0, 7), ...ph];
  }, [q, views, people]);

  useEffect(() => setSel(0), [hits.length]);

  const run = useCallback(
    (h: Hit | undefined) => {
      if (!h) return;
      h.go();
      onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") return onClose();
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSel((s) => Math.min(hits.length - 1, s + 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSel((s) => Math.max(0, s - 1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        run(hits[sel]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, hits, sel, run, onClose]);

  // tanlangan qatorni ko'rinishda ushlab turish (klaviatura bilan yurganda)
  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  if (!open) return null;

  let lastKind: Hit["kind"] | null = null;

  return (
    <div className="a2-pal-wrap" role="dialog" aria-modal aria-label="Qidiruv va o'tish">
      <div className="a2-scrim" onClick={onClose} />
      <div className="a2-pal">
        <input
          className="a2-pal-in"
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ekran, ism, telefon, mashina raqami…"
          aria-label="Qidirish"
        />
        <div className="a2-pal-list" ref={listRef}>
          {hits.length === 0 && (
            <div className="a2-pal-item a2-dim-2">{busy ? "Qidirilmoqda…" : "Hech narsa topilmadi"}</div>
          )}
          {hits.map((h, i) => {
            const head = h.kind !== lastKind ? (h.kind === "view" ? "Ekranlar" : "Odamlar") : null;
            lastKind = h.kind;
            return (
              <div key={`${h.kind}-${i}`}>
                {head && <div className="a2-pal-sec">{head}</div>}
                <button
                  type="button"
                  className="a2-pal-item"
                  aria-selected={i === sel}
                  onMouseEnter={() => setSel(i)}
                  onClick={() => run(h)}
                >
                  <span>{h.label}</span>
                  {h.sub && <span className="a2-pal-item-sub">{h.sub}</span>}
                </button>
              </div>
            );
          })}
        </div>
        <div className="a2-pal-foot">
          <Kbd>↑↓</Kbd> tanlash <Kbd>↵</Kbd> ochish <Kbd>Esc</Kbd> yopish
          {busy && <span className="a2-spacer" />}
          {busy && <span className="a2-spin" />}
        </div>
      </div>
    </div>
  );
}
