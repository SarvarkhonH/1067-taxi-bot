// 🎮 Koson O'yini — mavsum homiysi (KOSON_OYIN_PLAN.md v9.2 §5). Yangi Prisma model OCHILMAYDI
// (schema-taqiqqa mos, ARCHITECTURE.md §5) — bitta AppState yozuvi. Sozlanmagan/o'chirilgan holatda
// BirJoy o'zi homiy sifatida ko'rinadi (kod darajasidagi fallback — mijozga hech qachon bo'sh
// joy qolmaydi). Rasm-manba: `RavellaItem`ning ikki-usul naqshi (ravellaService.ts:423-431) — faqat
// to'g'ridan-to'g'ri URL (Telegram file_id yuklash bu yerda ortiqcha murakkablik: sponsor bitta,
// Ravella kabi o'nlab bezak emas).
import { prisma } from "../db";

const KEY = "sponsor:current";

export interface SponsorView {
  name: string;
  photoUrl: string | null;
  active: boolean;
  isDefault: boolean; // true = BirJoy fallback (admin hech narsa sozlamagan yoki o'chirgan)
}

const BIRJOY_DEFAULT: SponsorView = { name: "BirJoy", photoUrl: null, active: true, isDefault: true };

interface SponsorStored {
  name: string;
  photoUrl: string | null;
  active: boolean;
}

/** Mijozga/admin panelga ko'rsatiladigan joriy homiy — sozlanmagan yoki active:false bo'lsa BirJoy. */
export async function getSponsor(): Promise<SponsorView> {
  const row = await prisma.appState.findUnique({ where: { key: KEY } }).catch(() => null);
  if (!row) return BIRJOY_DEFAULT;
  const saved = parseStored(row.value);
  if (!saved || !saved.active || !saved.name.trim()) return BIRJOY_DEFAULT;
  return { name: saved.name.trim(), photoUrl: saved.photoUrl, active: true, isDefault: false };
}

/** Admin: homiyni sozlash/yangilash (nom + rasm-URL + yoqish/o'chirish). */
export async function setSponsor(input: { name: string; photoUrl: string | null; active: boolean }): Promise<SponsorView> {
  const stored: SponsorStored = {
    name: (input.name || "").trim().slice(0, 60),
    photoUrl: input.photoUrl?.trim() || null,
    active: !!input.active,
  };
  await prisma.appState.upsert({
    where: { key: KEY },
    create: { key: KEY, value: JSON.stringify(stored) },
    update: { value: JSON.stringify(stored) },
  });
  return getSponsor();
}

function parseStored(raw: string): SponsorStored | null {
  try {
    const v = JSON.parse(raw) as Partial<SponsorStored>;
    if (typeof v.name !== "string") return null;
    return { name: v.name, photoUrl: typeof v.photoUrl === "string" ? v.photoUrl : null, active: !!v.active };
  } catch {
    return null;
  }
}
