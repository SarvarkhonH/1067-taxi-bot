// 🧭 v2 NAVIGATSIYA — yangi ma'lumot-arxitekturasi.
//
// Eski panel: 33 tab, 6 guruh, bir-biriga bog'lanmagan orollar. Yangi: ~20
// manzil, chunki tab-per-variant o'rniga FILTR ishlatiladi:
//   · driver+client+botusers+x360+banlist+blocked → BITTA "Odamlar" (tur/holat = filtr,
//     x360 esa drill-down panelining O'ZIGA aylanadi)
//   · safarlar+restoran-orders+market-orders+intercity → BITTA "Buyurtmalar" (tur = filtr)
//   · finance+analytics → BITTA "Moliya"
export interface NavItem {
  /** hash-yo'ldagi birinchi segment */
  id: string;
  icon: string;
  label: string;
  /** Faqat egaga ko'rinadi (operator `chatops` roli uchun yashiriladi). */
  ownerOnly?: boolean;
}
export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  {
    label: "Bugun",
    items: [{ id: "bugun", icon: "◎", label: "Bugun" }],
  },
  {
    label: "Operatsiya",
    items: [
      { id: "jonli", icon: "◉", label: "Jonli" },
      { id: "buyurtmalar", icon: "▤", label: "Buyurtmalar" },
      { id: "operator", icon: "🎧", label: "Operator" },
      { id: "obzvon", icon: "☎", label: "Obzvon", ownerOnly: true },
    ],
  },
  {
    label: "Odamlar",
    items: [{ id: "odamlar", icon: "◍", label: "Odamlar" }],
  },
  {
    label: "Pul",
    items: [
      { id: "moliya", icon: "▲", label: "Moliya", ownerOnly: true },
      { id: "tranzaksiya", icon: "⇄", label: "Tranzaksiyalar", ownerOnly: true },
      { id: "yechishlar", icon: "↧", label: "Yechishlar", ownerOnly: true },
      { id: "qarzlar", icon: "◌", label: "Qarzlar", ownerOnly: true },
      { id: "integrity", icon: "⛨", label: "Integrity", ownerOnly: true },
    ],
  },
  {
    label: "Katalog",
    items: [
      { id: "dokon", icon: "▦", label: "Do'kon", ownerOnly: true },
      { id: "restoran", icon: "◗", label: "Restoran", ownerOnly: true },
      { id: "xizmatlar", icon: "✦", label: "Xizmatlar", ownerOnly: true },
      { id: "elonlar", icon: "▥", label: "E'lonlar", ownerOnly: true },
      { id: "ravella", icon: "❋", label: "Ravella", ownerOnly: true },
      { id: "bosh", icon: "⌂", label: "Bosh sahifa", ownerOnly: true },
      { id: "pik", icon: "▮", label: "Pik vaqtlar", ownerOnly: true },
    ],
  },
  {
    label: "O'sish",
    items: [
      { id: "puls", icon: "❧", label: "Puls", ownerOnly: true },
      { id: "referallar", icon: "⚯", label: "Referallar", ownerOnly: true },
      { id: "topshiriq", icon: "◈", label: "Topshiriqlar", ownerOnly: true },
      { id: "xabarlar", icon: "✉", label: "Xabarlar", ownerOnly: true },
      { id: "bilim", icon: "◆", label: "AI Bilim", ownerOnly: true },
    ],
  },
  {
    label: "Tizim",
    items: [
      { id: "flaglar", icon: "⚙", label: "Flaglar", ownerOnly: true },
      { id: "jurnal", icon: "≡", label: "Jurnal" },
      { id: "tokenlar", icon: "⚿", label: "Tokenlar", ownerOnly: true },
    ],
  },
];

/** Operator (`chatops`) uchun ko'rinadigan manzillar — reja bo'yicha 4 ta
 *  (Chat/Call-markaz/Nazorat/Jurnal), lekin v2'da ular umumiy IA ichida:
 *  Operator · Jonli · Odamlar · Jurnal. */
export function navFor(role: string | null): NavGroup[] {
  if (role === "chatops") {
    return NAV.map((g) => ({ ...g, items: g.items.filter((i) => !i.ownerOnly) })).filter((g) => g.items.length > 0);
  }
  return NAV;
}

export const ALL_ITEMS: NavItem[] = NAV.flatMap((g) => g.items);
export const labelOf = (id: string): string => ALL_ITEMS.find((i) => i.id === id)?.label ?? id;
