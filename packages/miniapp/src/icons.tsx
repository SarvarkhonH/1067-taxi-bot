// Clean line/solid icons for the tab bar — premium feel vs emoji. `filled`
// renders the active (solid) variant.
export function Icon({ name, filled = false, size = 24 }: { name: string; filled?: boolean; size?: number }) {
  const p = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: filled ? "currentColor" : "none",
    stroke: "currentColor",
    strokeWidth: 1.9,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (name) {
    case "search":
      return (
        <svg {...p}>
          <circle cx="11" cy="11" r="7" fill={filled ? "currentColor" : "none"} />
          <path d="m20 20-3.5-3.5" />
        </svg>
      );
    case "wallet":
      return (
        <svg {...p}>
          <path d="M3 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v1H5a2 2 0 0 1-2-2Z" fill={filled ? "currentColor" : "none"} />
          <rect x="3" y="6" width="18" height="13" rx="3" />
          <circle cx="16.5" cy="12.5" r="1.4" fill="currentColor" stroke="none" />
        </svg>
      );
    case "games":
      return (
        <svg {...p}>
          <rect x="2" y="7" width="20" height="11" rx="4" />
          <path d="M7 12h3M8.5 10.5v3" />
          <circle cx="16" cy="11" r="1" fill="currentColor" stroke="none" />
          <circle cx="18" cy="13.5" r="1" fill="currentColor" stroke="none" />
        </svg>
      );
    case "missions":
      return (
        <svg {...p}>
          <circle cx="12" cy="12" r="8" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
        </svg>
      );
    case "league":
      return (
        <svg {...p}>
          <path d="M7 4h10v3a5 5 0 0 1-10 0V4Z" />
          <path d="M5 5H3v1a3 3 0 0 0 3 3M19 5h2v1a3 3 0 0 1-3 3M9 19h6M10 15.5l-.5 3.5M14 15.5l.5 3.5" />
        </svg>
      );
    case "friends":
      return (
        <svg {...p}>
          <circle cx="9" cy="8" r="3.2" />
          <path d="M3.5 19a5.5 5.5 0 0 1 11 0M16 6.5a3 3 0 0 1 0 5M17 19a5.5 5.5 0 0 0-2.5-4.5" />
        </svg>
      );
    case "market":
      return (
        <svg {...p}>
          <path d="M4 9h16l-1-4a2 2 0 0 0-2-1.5H7A2 2 0 0 0 5 5L4 9Z" />
          <path d="M5 9v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9" />
          <path d="M9.5 13a2.5 2.5 0 0 0 5 0" />
        </svg>
      );
    case "board":
      return (
        <svg {...p}>
          <rect x="4" y="3" width="16" height="18" rx="2" />
          <path d="M9 3v2a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1V3" fill={filled ? "currentColor" : "none"} />
          <path d="M8 11h8M8 15h5" />
        </svg>
      );
    case "car":
      return (
        <svg {...p}>
          <path d="M5 16l1.5-5a2 2 0 0 1 1.9-1.4h7.2A2 2 0 0 1 17.5 11L19 16" />
          <rect x="3" y="16" width="18" height="3" rx="1.5" />
          <circle cx="7.5" cy="19" r="1.4" fill="currentColor" stroke="none" />
          <circle cx="16.5" cy="19" r="1.4" fill="currentColor" stroke="none" />
        </svg>
      );
    case "home":
      return (
        <svg {...p}>
          <path d="M4 11l8-6 8 6" />
          <path d="M6 10v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-9" />
          <path d="M10 20v-5h4v5" />
        </svg>
      );
    case "route":
      // intercity road: two roadside edges + a dashed centre line (A→B corridor)
      return (
        <svg {...p}>
          <path d="M8 3 6.5 21M16 3 17.5 21" />
          <path d="M12 5v2.5M12 11v2.5M12 16.5V19" />
        </svg>
      );
    case "user":
      return (
        <svg {...p}>
          <circle cx="12" cy="8" r="3.4" />
          <path d="M5 20a7 7 0 0 1 14 0" />
        </svg>
      );
    case "share":
      // Telegram's own "forward/share" glyph (paper-plane) — some devices render 📤 as a blank
      // box (missing emoji font), an SVG never fails to draw.
      return (
        <svg {...p}>
          <path d="M21 3 3 10.5l7 2.5M21 3l-6.5 17-2.5-7M21 3 10.5 13.5" fill="none" />
        </svg>
      );
    default:
      return null;
  }
}
