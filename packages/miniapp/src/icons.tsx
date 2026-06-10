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
    case "car":
      return (
        <svg {...p}>
          <path d="M5 16l1.5-5a2 2 0 0 1 1.9-1.4h7.2A2 2 0 0 1 17.5 11L19 16" />
          <rect x="3" y="16" width="18" height="3" rx="1.5" />
          <circle cx="7.5" cy="19" r="1.4" fill="currentColor" stroke="none" />
          <circle cx="16.5" cy="19" r="1.4" fill="currentColor" stroke="none" />
        </svg>
      );
    default:
      return null;
  }
}
