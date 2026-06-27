// Shared map decor — rich car + ghost-person markers for the living-home map. Returns plain
// L.divIcon OPTION objects so this module stays decoupled from Leaflet (caller does L.divIcon(...)).
// The .b3-carmark / .b3-ghostperson / .lh-meloc CSS (rotation, drop-shadow, bob, pulse) lives in
// design/tokens.css. booking3 keeps its own copy of the basic car/person — this is the home superset.

export const GHOST_SHIRTS = ["#ef9f27", "#5dcaa5", "#85b7eb", "#ed93b1", "#f0997b", "#b388ff", "#c0dd97"];
export const GHOST_SKINS = ["#e8b58a", "#d9a066", "#f0c9a0"];
export const GHOST_DRESSES = ["#ff8fb3", "#ff6fae", "#c87bd6", "#7bc6ff", "#ffd166", "#ff9e7a", "#9be0c0"];
export const GHOST_HAIRS = ["#2b2b33", "#4a342a", "#1f1f24", "#5a3b2e"];

export type PersonKind = "man" | "woman" | "girl" | "mother";
export interface PersonOpts {
  shirt: string;
  skin: string;
  size: number;
  hail?: boolean;
  kind?: PersonKind;
  hair?: string;
}

export function carSvg(color: string, size: number, passenger = false): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" style="display:block">
    <rect x="9.5" y="3" width="13" height="26" rx="6" fill="${color}"/>
    <path d="M11 7 Q16 4.3 21 7 L20 12 H12 Z" fill="#0b1f3a" opacity=".78"/>
    <rect x="12" y="19.3" width="8" height="5.6" rx="2.3" fill="#0b1f3a" opacity=".62"/>
    ${passenger
      ? `<rect x="13.3" y="22.2" width="5.4" height="3.6" rx="1.8" fill="#3b4a63"/><circle cx="16" cy="20.5" r="2.3" fill="#f0c9a0"/>`
      : `<circle cx="16" cy="15.4" r="1.15" fill="#fff" opacity=".5"/>`}
  </svg>`;
}

// 💗 a cheerful PINK taxi with a tiny white high-heel on the roof — a playful feminine cab.
export function pinkTaxiSvg(size: number): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" style="display:block">
    <rect x="9.5" y="3" width="13" height="26" rx="6" fill="#ff79b0"/>
    <path d="M11 7 Q16 4.3 21 7 L20 12 H12 Z" fill="#5a1238" opacity=".7"/>
    <rect x="12" y="19.3" width="8" height="5.6" rx="2.3" fill="#5a1238" opacity=".55"/>
    <g transform="translate(11.4,13.2)"><path d="M0 2.3 Q0 1 1.9 1 L5.3 1 Q5.3 2.2 3.9 2.4 L1.4 2.6 L1.2 3.9 L.4 3.9 Z" fill="#fff"/><rect x=".25" y="3.9" width=".8" height="1.7" rx=".3" fill="#fff"/></g>
  </svg>`;
}

// A waiting ghost client. kind: man (pants) · woman (dress + hair) · girl (smaller + pigtails) ·
// mother (woman + a small child holding her hand). hail → raises a hand to flag a taxi.
export function ghostPersonSvg(o: PersonOpts): string {
  const { shirt, skin, size, hail = false, kind = "man", hair = "#2b2b33" } = o;
  const arm = (x: number) => `<rect x="${x}" y="12.4" width="2.4" height="8" rx="1.2" fill="${skin}"/>`;
  const hailArm = `<g transform="rotate(30 16.6 13)"><rect x="15.35" y="2.4" width="2.4" height="11" rx="1.2" fill="${skin}"/><circle cx="16.55" cy="2.4" r="1.85" fill="${skin}"/></g>`;

  if (kind === "man") {
    return wrap(size, 24, `
      <ellipse cx="12" cy="32" rx="6" ry="1.6" fill="rgba(0,0,0,.34)"/>
      <rect x="8.4" y="23" width="2.6" height="9" rx="1.3" fill="#28303f"/>
      <rect x="13" y="23" width="2.6" height="9" rx="1.3" fill="#28303f"/>
      <rect x="5" y="12.4" width="2.5" height="8.4" rx="1.25" fill="${shirt}"/>
      ${hail ? "" : `<rect x="16.5" y="12.4" width="2.5" height="8.4" rx="1.25" fill="${shirt}"/>`}
      <rect x="6.8" y="11.5" width="10.4" height="14" rx="4.6" fill="${shirt}"/>
      <circle cx="12" cy="6.6" r="4.4" fill="${skin}"/>
      ${hail ? hailArm : ""}`);
  }

  // shared female base: thin legs behind a flared dress, hair frame, rounder head
  const legs = `<rect x="9.7" y="24.5" width="1.9" height="7.2" rx=".9" fill="${skin}"/><rect x="12.4" y="24.5" width="1.9" height="7.2" rx=".9" fill="${skin}"/>`;
  const dress = `<path d="M8 12.5 L16 12.5 L18.7 26 Q12 28.3 5.3 26 Z" fill="${shirt}"/>`;
  const headHair = `<path d="M7.3 5.4 Q7.3 1 12 1 Q16.7 1 16.7 5.4 Q16.7 8.7 15.5 11 L14.1 9.4 Q12 8.3 9.9 9.4 L8.5 11 Q7.3 8.7 7.3 5.4 Z" fill="${hair}"/>`;
  const head = `<circle cx="12" cy="6.1" r="3.9" fill="${skin}"/>`;
  const pigtails = `<circle cx="7.2" cy="4.6" r="1.9" fill="${hair}"/><circle cx="16.8" cy="4.6" r="1.9" fill="${hair}"/>`;
  const woman = `
    <ellipse cx="12" cy="32" rx="6.2" ry="1.6" fill="rgba(0,0,0,.34)"/>
    ${legs}
    ${arm(5.4)}${hail ? "" : arm(16.2)}
    ${dress}
    ${headHair}${head}${kind === "girl" ? pigtails : ""}
    ${hail ? hailArm : ""}`;

  if (kind !== "mother") return wrap(size, 24, woman);

  // 👩‍👧 mother + small child holding her hand — wider viewBox, child ~62% to her right
  const child = `<g transform="translate(20,11) scale(.62)">
    <ellipse cx="6" cy="32" rx="5" ry="1.4" fill="rgba(0,0,0,.3)"/>
    <rect x="4.4" y="24" width="1.7" height="7.6" rx=".8" fill="${skin}"/><rect x="6.6" y="24" width="1.7" height="7.6" rx=".8" fill="${skin}"/>
    <rect x="3.4" y="13.5" width="5.4" height="12" rx="2.6" fill="${GHOST_DRESSES[3]}"/>
    <circle cx="6.1" cy="8.6" r="3.6" fill="${skin}"/></g>`;
  // a little linked-hands line between mum and child
  const handLink = `<path d="M16.4 19 Q19 19.5 21.4 18.4" stroke="${skin}" stroke-width="1.4" fill="none" stroke-linecap="round"/>`;
  return wrap(size, 32, `<g transform="translate(-1,0)">${woman}</g>${handLink}${child}`);
}

function wrap(size: number, vbW: number, inner: string): string {
  const h = (size / vbW) * 34;
  return `<svg viewBox="0 0 ${vbW} 34" width="${size}" height="${h}" aria-hidden="true">${inner}</svg>`;
}

/** L.divIcon options for a rotated taxi (green = free, grey = busy; busy carries a passenger). */
export function carDivIcon(color: string, bearing: number, size = 26, passenger = false) {
  return {
    className: "",
    html: `<div class="b3-carmark" style="transform:rotate(${bearing}deg)">${carSvg(color, size, passenger)}</div>`,
    iconSize: [size, size] as [number, number],
    iconAnchor: [size / 2, size / 2] as [number, number],
  };
}

/** L.divIcon options for a parked pink high-heel taxi (kept upright — no rotation). */
export function pinkTaxiDivIcon(size = 26) {
  return {
    className: "",
    html: `<div class="b3-carmark">${pinkTaxiSvg(size)}</div>`,
    iconSize: [size, size] as [number, number],
    iconAnchor: [size / 2, size / 2] as [number, number],
  };
}

/** L.divIcon options for a waiting ghost client (man/woman/girl/mother; some hailing). */
export function ghostPersonDivIcon(o: PersonOpts) {
  const vbW = o.kind === "mother" ? 32 : 24;
  const w = o.size * (vbW / 24);
  const h = (o.size / 24) * 34;
  return {
    className: "",
    html: `<div class="b3-ghostperson">${ghostPersonSvg(o)}</div>`,
    iconSize: [w, h] as [number, number],
    iconAnchor: [w / 2, h - 2] as [number, number],
  };
}

// A modern teardrop location pin (gold, white-outlined, white core) — the universal «here» marker.
function meLocPinSvg(w: number): string {
  const h = w * 1.32;
  return `<svg width="${w}" height="${h}" viewBox="0 0 28 37" xmlns="http://www.w3.org/2000/svg" style="display:block">
    <defs><linearGradient id="mlg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd24d"/><stop offset="1" stop-color="#ff9a00"/></linearGradient></defs>
    <path d="M14 1.6 C6.9 1.6 2.6 6.7 2.6 12.5 C2.6 20 14 34.6 14 34.6 C14 34.6 25.4 20 25.4 12.5 C25.4 6.7 21.1 1.6 14 1.6 Z" fill="url(#mlg)" stroke="#fff" stroke-width="1.6"/>
    <circle cx="14" cy="12.5" r="5" fill="#fff"/>
    <circle cx="14" cy="12.5" r="2.6" fill="#ff9a00"/>
  </svg>`;
}

/** L.divIcon options for the rider's own location — a modern pin that floats over a ground pulse. */
export function myLocationDivIcon(size = 34) {
  const w = size;
  const h = size * 1.32;
  return {
    className: "",
    html: `<div class="lh-meloc"><span class="lh-meloc-pulse"></span>${meLocPinSvg(w)}</div>`,
    iconSize: [w, h] as [number, number],
    iconAnchor: [w / 2, h] as [number, number], // tip sits exactly on the location
  };
}
