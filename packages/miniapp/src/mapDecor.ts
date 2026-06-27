// Shared map decor — rich car + ghost-person markers used on the living-home map (and a
// mirror of what booking3 draws). Returns plain L.divIcon OPTION objects so this module
// stays decoupled from Leaflet (caller does L.divIcon(...)). The .b3-carmark / .b3-ghostperson
// CSS (rotation, drop-shadow, gentle bob) already lives in design/tokens.css.

export const GHOST_SHIRTS = ["#ef9f27", "#5dcaa5", "#85b7eb", "#ed93b1", "#f0997b", "#b388ff", "#c0dd97"];
export const GHOST_SKINS = ["#e8b58a", "#d9a066", "#f0c9a0"];

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

// hail → right arm raised with a skin-coloured hand (someone flagging a taxi); else arms at the sides
export function ghostPersonSvg(shirt: string, skin: string, size: number, hail = false): string {
  return `<svg viewBox="0 0 24 34" width="${size}" height="${size * 1.4}" aria-hidden="true">
    <ellipse cx="12" cy="32" rx="6" ry="1.6" fill="rgba(0,0,0,.34)"/>
    <rect x="8.4" y="23" width="2.6" height="9" rx="1.3" fill="#28303f"/>
    <rect x="13" y="23" width="2.6" height="9" rx="1.3" fill="#28303f"/>
    <rect x="5" y="12.4" width="2.5" height="8.4" rx="1.25" fill="${shirt}"/>
    ${hail ? "" : `<rect x="16.5" y="12.4" width="2.5" height="8.4" rx="1.25" fill="${shirt}"/>`}
    <rect x="6.8" y="11.5" width="10.4" height="14" rx="4.6" fill="${shirt}"/>
    <circle cx="12" cy="6.6" r="4.4" fill="${skin}"/>
    ${hail ? `<g transform="rotate(30 16.6 13)"><rect x="15.35" y="2.4" width="2.5" height="11.2" rx="1.25" fill="${shirt}"/><circle cx="16.6" cy="2.4" r="1.85" fill="${skin}"/></g>` : ""}
  </svg>`;
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

/** L.divIcon options for a waiting ghost client (some hailing). */
export function ghostPersonDivIcon(shirt: string, skin: string, size = 22, hail = false) {
  return {
    className: "",
    html: `<div class="b3-ghostperson">${ghostPersonSvg(shirt, skin, size, hail)}</div>`,
    iconSize: [size, size * 1.4] as [number, number],
    iconAnchor: [size / 2, size * 1.4 - 2] as [number, number],
  };
}
