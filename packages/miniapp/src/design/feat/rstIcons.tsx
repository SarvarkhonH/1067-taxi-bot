// 🍽 Restoran bo'limi ikonkalari — inline SVG, `currentColor`, stroke 1.7 (dizayn talabi:
// "Emoji ishlatilmaydi", design_handoff_restoran/README.md §Assets).
//
// Har path AYNAN prototipdan (`Restoran.dc.html`) ko'chirilgan va o'z viewBox'ida qoldirilgan —
// bitta umumiy 24×24 setka'ga "moslashtirish" proporsiyani buzardi, shuning uchun qilinmadi.
// Rang berilmaydi: ikonka o'zi turgan matnning rangini oladi (`currentColor`), demak holat
// o'zgarganda (aktiv chip, oq CTA ustida) alohida qoida yozish shart emas.

type RstIconName =
  | "chevron-left" | "chevron-down" | "search" | "star" | "phone" | "orders"
  | "close" | "plus" | "minus" | "plate" | "check" | "repeat" | "clock";

/** `size` — px. Prototipdagi tabiiy o'lchov har ikonkada boshqacha, shuning uchun standart
 *  qiymat yo'q: chaqiruvchi dizayndagi raqamni beradi (masalan qidiruv lupasi 15, telefon 19). */
export function RstIcon({ name, size = 16, className }: { name: RstIconName; size?: number; className?: string }) {
  const common = { width: size, height: size, className, "aria-hidden": true, focusable: "false" as const };
  switch (name) {
    case "chevron-left":
      return (
        <svg {...common} viewBox="0 0 9 15" fill="none">
          <path d="M7.5 1L2 7.5L7.5 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case "chevron-down":
      return (
        <svg {...common} viewBox="0 0 10 7" fill="none">
          <path d="M1 1.5L5 5.5L9 1.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
    case "search":
      return (
        <svg {...common} viewBox="0 0 15 15" fill="none">
          <circle cx="6.5" cy="6.5" r="4.6" stroke="currentColor" strokeWidth="1.7" />
          <path d="M10 10l3 3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      );
    // Yulduz — YAGONA to'ldirilgan (fill) ikonka: reyting belgisi kontur bilan o'qilmaydi.
    case "star":
      return (
        <svg {...common} viewBox="0 0 12 12">
          <path d="M6 1l1.55 3.2 3.45.5-2.5 2.45.6 3.45L6 8.98 2.9 10.6l.6-3.45L1 4.7l3.45-.5L6 1z" fill="currentColor" />
        </svg>
      );
    case "phone":
      return (
        <svg {...common} viewBox="0 0 20 20" fill="none">
          <path
            d="M4 5.5C4 4.7 4.7 4 5.5 4h2l1.5 3.5L7 9c.8 2 2 3.2 4 4l1.5-2 3.5 1.5v2c0 .8-.7 1.5-1.5 1.5C8.6 16 4 11.4 4 5.5z"
            stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"
          />
        </svg>
      );
    case "orders":
      return (
        <svg {...common} viewBox="0 0 17 17" fill="none">
          <rect x="2.5" y="2.5" width="12" height="12" rx="3" stroke="currentColor" strokeWidth="1.6" />
          <path d="M5.5 7h6M5.5 10h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
    case "close":
      return (
        <svg {...common} viewBox="0 0 15 15" fill="none">
          <path d="M4 4l7 7M11 4l-7 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
    case "plus":
      return (
        <svg {...common} viewBox="0 0 16 16" fill="none">
          <path d="M8 3.2v9.6M3.2 8h9.6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
        </svg>
      );
    case "minus":
      return (
        <svg {...common} viewBox="0 0 16 16" fill="none">
          <path d="M3.2 8h9.6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
        </svg>
      );
    // Likopcha+pichoq — fotosi yo'q taom/restoran o'rniga. Tabbar "restoran" ikonkasining
    // (prototipdagi `ICONS.restoran`) bir xil tilida, shuning uchun begona ko'rinmaydi.
    case "plate":
      return (
        <svg {...common} viewBox="0 0 22 22" fill="none">
          <path d="M6.5 3v7.5a2 2 0 004 0V3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M8.5 10.5V19M15 3v16" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      );
    case "check":
      return (
        <svg {...common} viewBox="0 0 16 16" fill="none">
          <path d="M3.5 8.4l3 3 6-6.4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "repeat":
      return (
        <svg {...common} viewBox="0 0 16 16" fill="none">
          <path d="M3 8a5 5 0 018.6-3.5M13 8a5 5 0 01-8.6 3.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          <path d="M11.6 1.9v2.7h-2.7M4.4 14.1v-2.7h2.7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "clock":
      return (
        <svg {...common} viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="5.6" stroke="currentColor" strokeWidth="1.7" />
          <path d="M8 4.9V8l2.1 1.6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
  }
}
