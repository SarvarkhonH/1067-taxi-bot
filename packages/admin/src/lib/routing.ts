// 🧭 Hash-routing — kutubxonasiz (~40 qator).
//
// Nima uchun hash va nima uchun kutubxona yo'q:
//  · Drill-down uchun CHUQUR HAVOLA shart ("#/odamlar/1234" — operator havolani
//    boshqasiga yuborishi mumkin, F5 bosganda o'sha joyda qoladi).
//  · Panel VPS'da Caddy orqali STATIK fayl sifatida beriladi (/var/www/admin).
//    Yo'l-routing (`/odamlar/1234`) uchun Caddy'ga SPA-rewrite qo'shish kerak
//    bo'lardi — hash bunga umuman tegmaydi, ya'ni bitta infra-o'zgarish kamayadi.
//  · react-router ≈15KB + API yuki, bizga esa shu 40 qator yetadi.
import { useEffect, useState } from "react";

export interface Route {
  /** Birinchi segment — ekran ("bugun", "odamlar", …). Bo'sh bo'lsa "bugun". */
  view: string;
  /** Ikkinchi segment — obyekt id (drill-down uchun). */
  id?: string;
  /** `?` dan keyingi parametrlar (filtr holati havolada saqlanadi). */
  params: Record<string, string>;
}

/** Ekran nomi EMAS, buyruq bo'lgan hash'lar (main.tsx ularni panel-tanlash uchun
 *  ishlatadi). Router ularni BOSH EKRAN deb qabul qiladi.
 *
 *  Nima uchun kerak: `#v2` manzili odamlarga beriladi, main.tsx esa uni
 *  `#/bugun` ga almashtirishi kerak edi. Lekin `history.replaceState` bu
 *  muhitda ishlamadi (sahifa iframe ichida — o'lchov: replaceState'dan keyin
 *  ham `location.hash === "#v2"` qoldi) va router "v2" ni noma'lum ekran deb
 *  "bu ekran hali ko'chirilmagan" ko'rsatardi — ya'ni ega bergan manzilni
 *  ochganda BO'SH sahifa ko'rardi. Endi router URL'ga bog'liq emas. */
const COMMAND_HASHES = new Set(["v2", "v1", "kit"]);

export function parseHash(raw = location.hash): Route {
  const h = raw.replace(/^#\/?/, "");
  const [path, query = ""] = h.split("?");
  const [rawView = "", id] = (path ?? "").split("/");
  const view = !rawView || COMMAND_HASHES.has(rawView) ? "bugun" : rawView;
  const params: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(query)) params[k] = v;
  return { view, id: COMMAND_HASHES.has(rawView) ? undefined : id || undefined, params };
}

export function buildHash(view: string, id?: string, params?: Record<string, string | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params ?? {})) if (v != null && v !== "") q.set(k, v);
  const qs = q.toString();
  return `#/${view}${id ? `/${id}` : ""}${qs ? `?${qs}` : ""}`;
}

export function navigate(view: string, id?: string, params?: Record<string, string | undefined>): void {
  location.hash = buildHash(view, id, params);
}

/** Drill-down panelini yopish — id ni olib tashlaydi, ekran va filtrlar qoladi. */
export function closeEntity(r: Route): void {
  location.hash = buildHash(r.view, undefined, r.params);
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash());
  useEffect(() => {
    const on = (): void => setRoute(parseHash());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return route;
}
