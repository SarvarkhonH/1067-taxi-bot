// 🚕 B qism P0-2 (flag `fastopen`): the taxi screen in under a second.
//
// Three things live on the phone between opens:
//   · the last taxi-screen answer (/api/booking/boot) — so the sheet paints from it at once and the
//     network only refreshes it. NOT when that answer had a live ride: a stale ride screen, or a
//     stale "no ride" during one, would be worse than waiting — then the screen waits as before.
//   · the place catalog, with a version (a hash of its content) — the name under the pin is worked
//     out on the phone (shared/pickup.nearestPlace, the server's own rule), no request per move.
//   · nothing else. Everything is per Telegram user and read inside try/catch: no storage (private
//     mode, cleared data) simply means yesterday's behaviour.
// Plus a few timing marks (D2.6), sent once with sendBeacon — see shared/uxMarks.

import type { BookingInfoResponse, SavedAddressView, UxMarks } from "@t1067/shared";
import { getInitData, uxMarksUrl } from "./api";
import { tg } from "./telegram";
import { clearRideLive, noteRideLive, rideMayBeLive } from "./rideMark";

const INFO_MAX_AGE_MS = 7 * 24 * 3600_000;

/** Per Telegram user. Outside Telegram (the design demo in a browser) there is no user: "anon". */
function userKey(prefix: string): string {
  const id = tg?.initDataUnsafe?.user?.id;
  return `${prefix}:${id ?? "anon"}`;
}

/** The last taxi-screen answer for this user, when it is safe to paint from. */
export function readBootCache(): BookingInfoResponse | null {
  try {
    const raw = localStorage.getItem(userKey("b3:boot:v1"));
    if (!raw) return null;
    const c = JSON.parse(raw) as { at?: number; info?: BookingInfoResponse };
    if (!c.info || !c.at || Date.now() - c.at > INFO_MAX_AGE_MS) return null;
    if (c.info.active) return null; // last seen with a ride: wait for the truth
    if (rideMayBeLive()) return null; // an order went through since, or a ride was on screen
    return c.info;
  } catch {
    return null;
  }
}

export function writeBootCache(info: BookingInfoResponse): void {
  // The server's word on "is there a ride" is what the next open trusts.
  if (info.active) noteRideLive();
  else clearRideLive();
  try {
    localStorage.setItem(userKey("b3:boot:v1"), JSON.stringify({ at: Date.now(), info }));
  } catch { /* storage full / blocked — next open just waits */ }
}

/** A short content hash — the catalog's version, so an unchanged catalog is not rewritten. */
export function catalogVersion(list: SavedAddressView[]): string {
  let h = 5381;
  const s = JSON.stringify(list.map((a) => [a.id, a.name, a.lat, a.lng]));
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return `${list.length}.${(h >>> 0).toString(36)}`;
}

export function readPlacesCache(): SavedAddressView[] | null {
  try {
    const raw = localStorage.getItem("b3:places:v1");
    if (!raw) return null;
    const c = JSON.parse(raw) as { v?: string; list?: SavedAddressView[] };
    return Array.isArray(c.list) && c.list.length ? c.list : null;
  } catch {
    return null;
  }
}

/** Stores the catalog; true when it differs from what was stored (the caller then uses the new one). */
export function writePlacesCache(list: SavedAddressView[]): boolean {
  try {
    const v = catalogVersion(list);
    const raw = localStorage.getItem("b3:places:v1");
    const was = raw ? (JSON.parse(raw) as { v?: string }).v : null;
    if (was === v) return false;
    localStorage.setItem("b3:places:v1", JSON.stringify({ v, list }));
    return true;
  } catch {
    return true;
  }
}

// ── D2.6: timing marks, from the tap on "Taksi" ──
let tapAt: number | null = null;
let marks: UxMarks = {};
let sent = false;
let flushTimer: ReturnType<typeof setTimeout> | undefined;

/** The taxi screen was just asked for (App, when `booking` turns on). */
export function markTaxiTap(): void {
  if (flushTimer) clearTimeout(flushTimer);
  tapAt = performance.now();
  marks = {};
  sent = false;
}

/** Once sheet and name are both in: send with the network time if it is there, else within 3 s. */
function maybeFlush(): void {
  if (marks.sheet == null || marks.name == null) return;
  if (flushTimer) clearTimeout(flushTimer);
  if (marks.boot != null) flushUxMarks();
  else flushTimer = setTimeout(flushUxMarks, 3_000);
}

/** First time only per open (the two can arrive in either order — child effects run first). */
export function uxMark(name: "sheet" | "name", extra: Partial<UxMarks> = {}): void {
  if (tapAt == null || marks[name] != null) return;
  marks = { ...marks, ...extra, [name]: performance.now() - tapAt };
  maybeFlush();
}

export function uxBoot(ms: number): void {
  if (tapAt == null || marks.boot != null) return;
  marks = { ...marks, boot: ms };
  maybeFlush();
}

/** Send once. text/plain: the one type a cross-origin beacon may carry without a preflight. */
export function flushUxMarks(): void {
  if (sent || tapAt == null || (marks.sheet == null && marks.name == null)) return;
  sent = true;
  try {
    const initData = getInitData();
    if (!initData || typeof navigator.sendBeacon !== "function") return;
    navigator.sendBeacon(uxMarksUrl(), new Blob([JSON.stringify({ initData, marks })], { type: "text/plain" }));
  } catch { /* measuring must never break the screen */ }
}
