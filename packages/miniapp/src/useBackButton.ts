import { useEffect, useRef } from "react";
import { pushBack } from "./telegram";

/**
 * ‹ Telegram'ning native orqaga tugmasini shu ekranga bog'laydi.
 *
 * `active` — tugma AYNAN shu ekran uchun ko'rinishi kerakmi. `onBack` har renderda yangi
 * funksiya bo'lishi mumkin (inline arrow), shuning uchun u ref'da saqlanadi: effekt FAQAT
 * `active` o'zgarganda qayta ishga tushadi. Aks holda har render stekni bo'shatib-to'ldirib,
 * ichma-ich ochilgan ekranlar tartibini buzardi.
 *
 * `priority`: qobiq (tab/overlay) darajasi = 0 (standart), tab ICHIDA ustma-ust ochiladigan
 * ekranlar = 1+. Ular bir vaqtda faol bo'lib qolsa, yuqori prioritet g'olib.
 *
 * Ishlatish: `useBackButton(booking, () => setBooking(false));`
 * Hooks qoidasi: erta `return` lardan OLDIN chaqirilishi shart.
 */
export function useBackButton(active: boolean, onBack: () => void, priority = 0): void {
  const ref = useRef(onBack);
  ref.current = onBack;
  useEffect(() => {
    if (!active) return;
    return pushBack(() => ref.current(), priority);
  }, [active, priority]);
}
