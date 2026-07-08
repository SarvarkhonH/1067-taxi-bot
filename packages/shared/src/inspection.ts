// 🏅 1067 TEKSHIRUVI — 100-ballik 5-mezonli audit standart (1067 Tekshiruvi Standartlari, PDF).
// Bitta joyda hisoblanadi (server + admin + miniapp bir xil natijani ko'rsin) — tier chegaralarini
// FAQAT shu yerda o'zgartiring.
export interface InspBreakdown {
  clean: number; // 🧼 Tozalik va sanitariya
  prof: number; // 👔 Professionalizm va muomala
  price: number; // 💰 Narx-sifat muvofiqligi
  trust: number; // 📜 Ishonchlilik
  quality: number; // ⭐ Xizmat/mahsulot sifati
}

export const INSP_CATEGORY_MAX = 20;
export const INSP_TOTAL_MAX = 100;
export const INSP_PASS_MIN = 60; // shundan past — ommaviy belgi UMUMAN chiqmaydi

export type InspTier = "gold" | "silver" | "bronze" | null;

export const INSP_CATEGORIES: { key: keyof InspBreakdown; emoji: string; label: string }[] = [
  { key: "clean", emoji: "🧼", label: "Tozalik va sanitariya" },
  { key: "prof", emoji: "👔", label: "Professionalizm va muomala" },
  { key: "price", emoji: "💰", label: "Narx-sifat muvofiqligi" },
  { key: "trust", emoji: "📜", label: "Ishonchlilik" },
  { key: "quality", emoji: "⭐", label: "Xizmat sifati" },
];

export function inspTotal(b: Partial<InspBreakdown> | null | undefined): number | null {
  if (!b) return null;
  const vals = [b.clean, b.prof, b.price, b.trust, b.quality];
  if (vals.some((v) => v == null)) return null; // to'liq audit qilinmagan — hali baholanmagan
  return (vals as number[]).reduce((s, v) => s + v, 0);
}

export function inspTier(total: number | null): InspTier {
  if (total == null || total < INSP_PASS_MIN) return null;
  if (total >= 90) return "gold";
  if (total >= 75) return "silver";
  return "bronze";
}

export const INSP_TIER_LABEL: Record<NonNullable<InspTier>, string> = {
  gold: "Oltin tasdiq",
  silver: "Kumush tasdiq",
  bronze: "Tasdiqlangan",
};

export const INSP_TIER_EMOJI: Record<NonNullable<InspTier>, string> = {
  gold: "🏆",
  silver: "🥈",
  bronze: "🥉",
};
