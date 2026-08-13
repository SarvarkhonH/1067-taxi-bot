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
    case "food":
      // restoran (feature "restoran") — burger silueti: 23px'da ham darhol "taom" deb o'qiladi
      // (fork+pichoq ingichka chiziqlari kichik o'lchamda noaniq bo'lib ketardi)
      return (
        <svg {...p}>
          <path d="M4 10a8 6 0 0 1 16 0Z" fill={filled ? "currentColor" : "none"} />
          <path d="M3 13h18M4 16h16" />
          <path d="M3 19a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1 2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" fill={filled ? "currentColor" : "none"} />
        </svg>
      );
    case "clock":
      // shopv2: do'kon-profildagi ish-vaqti / yetkazish-va'dasi qatori
      return (
        <svg {...p}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 3" />
        </svg>
      );
    case "bell":
      // shopv2: mockup top-strip'dagi bildirishnoma-qo'ng'irog'i
      return (
        <svg {...p}>
          <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.7 21a2 2 0 01-3.4 0" />
        </svg>
      );
    case "bolt":
      // shopv2: "Hozir ochiq" tezkor-filtr chipi (mockup'da aynan chaqmoq-belgisi, 🟢 emoji emas)
      return (
        <svg {...p} fill="currentColor" stroke="none">
          <path d="M13 2L3 14h6l-2 8 12-14h-7l1-6z" />
        </svg>
      );
    case "bag":
      // shopv2: "Buyurtmalarim" — top-strip'da ixcham ikonka-tugma (mockup naqshi)
      return (
        <svg {...p}>
          <path d="M6 8h12l-1 12H7L6 8z" />
          <path d="M9 8V6a3 3 0 016 0v2" />
        </svg>
      );
    case "back":
      // shopv2: do'kon-profildan bozorga qaytish (top-strip) — "←" matn-belgisi o'rniga
      return (
        <svg {...p}>
          <path d="M15 5l-7 7 7 7" />
        </svg>
      );
    case "heart":
      // shopv2: sevimlilar — emoji-siz chrome (❤️/🤍 o'rniga), ba'zi qurilmalarda emoji-shrift
      // yo'qligi muammosidan xoli (share ikonkasi bilan bir xil sabab).
      return (
        <svg {...p}>
          <path d="M12 20.2s-7.1-4.35-9.6-9.05A5.4 5.4 0 0 1 12 6.6a5.4 5.4 0 0 1 9.6 4.55C19.1 15.85 12 20.2 12 20.2Z" fill={filled ? "currentColor" : "none"} />
        </svg>
      );
    case "pin":
      // shopv2: mahalla-tanlov chipi (📍 o'rniga)
      return (
        <svg {...p}>
          <path d="M12 21s7-6.3 7-11.6A7 7 0 0 0 5 9.4C5 14.7 12 21 12 21Z" fill={filled ? "currentColor" : "none"} />
          <circle cx="12" cy="9.4" r="2.2" fill={filled ? "none" : "currentColor"} stroke={filled ? "currentColor" : "none"} strokeWidth={filled ? 1.9 : 0} />
        </svg>
      );
    case "cart":
      // shopv2: yopishqoq savat-bar (🧺 o'rniga)
      return (
        <svg {...p}>
          <path d="M3 4h2l2.4 12.2A2 2 0 0 0 9.36 18H18a2 2 0 0 0 1.94-1.51L21.5 9H6" />
          <circle cx="9.5" cy="20.3" r="1.3" fill="currentColor" stroke="none" />
          <circle cx="17.5" cy="20.3" r="1.3" fill="currentColor" stroke="none" />
        </svg>
      );
    case "chat":
      // shopv2: "do'konga yozish" CTA — 💬 ba'zi qurilmalarda bo'sh to'rtburchak bo'lib chiqadi
      // (real skrinshotda topildi: "🤍 Do'konga yozish" ko'rinishida chiqqan edi).
      return (
        <svg {...p}>
          <path d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-4.5 4V17H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" fill={filled ? "currentColor" : "none"} />
        </svg>
      );
    case "gift":
      // oyin: "Sovrin"/Mukofotlar — 🎁 o'rniga (ba'zi qurilmalarda emoji-shrift yo'qligi muammosi).
      return (
        <svg {...p}>
          <rect x="3" y="8" width="18" height="4" rx="1" fill={filled ? "currentColor" : "none"} />
          <rect x="4" y="12" width="16" height="9" rx="1.5" />
          <path d="M12 8v13" />
          <path d="M12 8c-1.2-3.2-6-4.3-6-1.3C6 8.3 9.2 8.3 12 8ZM12 8c1.2-3.2 6-4.3 6-1.3C18 8.3 14.8 8.3 12 8Z" fill={filled ? "currentColor" : "none"} />
        </svg>
      );
    case "cards":
      // oyin: Kartalarim/"kartalar" tugmasi — 🎟 o'rniga, ikkita ustma-ust to'plam sifatida chiziladi.
      return (
        <svg {...p}>
          <rect x="6.3" y="3.6" width="14" height="10" rx="2.2" transform="rotate(9 13.3 8.6)" fill={filled ? "currentColor" : "none"} opacity={filled ? 0.55 : 1} />
          <rect x="4" y="9" width="14" height="10" rx="2.2" fill={filled ? "currentColor" : "none"} />
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
