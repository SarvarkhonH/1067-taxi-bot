// 🎨 Mavzu (tema) — birinchi bo'yashdan OLDIN ishlashi kerak, shuning uchun ALOHIDA modul.
//
// Ilgari bu funksiyalar `profile.tsx` ichida turardi. `App.tsx` ularni import qilgani uchun
// zanjir hosil bo'lardi: App → profile → wallet (961 qator) — ya'ni Hamyon va Profil ekranlari
// hech kim ularni ochmasa ham HAR safar birinchi paint bilan yuklanardi. Endi App faqat shu
// kichkina faylni oladi; profile.tsx va wallet.tsx lazy chunk'larga chiqdi.
import { cloudGet, cloudSet, syncTelegramTheme } from "./telegram";
import { tg } from "./telegram";

export const THEME_KEY = "birjoy_theme";
export const THEMES = ["dark", "light", "vibrant"];

export function applyTheme(t: string): void {
  try { document.documentElement.setAttribute("data-theme", t); } catch { /* SSR-safe */ }
  // Telegram WebView xromi (header + orqa fon) ham temaga ergashsin — aks holda tema
  // almashtirilgach ilova ichi yangi rangda, Telegram paneli/orqa foni esa eski qorada qolardi.
  syncTelegramTheme();
}

export function initTheme(): void {
  let t = "dark";
  try {
    const saved = localStorage.getItem(THEME_KEY);
    t = saved || (tg?.colorScheme === "light" ? "light" : "dark");
  } catch { /* private mode */ }
  applyTheme(t);
}

/** ☁️ Mavzu tanlovini QURILMALARARO tiklash (Telegram CloudStorage). `initTheme` sinxron ishlaydi
 *  va birinchi bo'yashdan oldin mahalliy qiymatni qo'yadi (miltillash yo'q); bu esa keyin, javob
 *  kelganda, FAQAT farq bo'lsa qo'llaydi. Bulut bo'sh/qo'llab-quvvatlanmasa — hech narsa
 *  o'zgarmaydi. Telefon almashtirilsa yoki Desktop'dan kirilsa mavzu o'zi bilan keladi. */
export async function syncThemeFromCloud(): Promise<void> {
  const cloud = await cloudGet(THEME_KEY);
  if (!cloud || !THEMES.includes(cloud)) return;
  let local: string | null = null;
  try { local = localStorage.getItem(THEME_KEY); } catch { /* private mode */ }
  if (local === cloud) return;
  try { localStorage.setItem(THEME_KEY, cloud); } catch { /* ignore */ }
  applyTheme(cloud);
}

/** Foydalanuvchi mavzuni o'zgartirganda — mahalliy + bulutga (ThemePicker chaqiradi). */
export function saveTheme(t: string): void {
  try { localStorage.setItem(THEME_KEY, t); } catch { /* ignore */ }
  applyTheme(t);
  void cloudSet(THEME_KEY, t);
}
