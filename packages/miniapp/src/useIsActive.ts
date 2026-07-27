import { useEffect, useState } from "react";
import { isAppActive, onActiveChange } from "./telegram";

/**
 * ⏸ Ilova old planda (ko'rinib turibdi) mi.
 *
 * So'rov halqalarini shunga bog'lash uchun: `if (!active) return;` + `deps` ga `active` qo'shiladi.
 * Natijada fonda halqa TO'XTAYDI, ilovaga qaytilganda esa effekt qaytadan ishga tushib darhol
 * bir marta yangilaydi — ya'ni foydalanuvchi eskirgan ma'lumot ko'rmaydi.
 *
 * Telegram `activated`/`deactivated` bermasa (eski klient) — brauzer `visibilitychange` i.
 */
export function useIsActive(): boolean {
  const [active, setActive] = useState(isAppActive);
  useEffect(() => onActiveChange(setActive), []);
  return active;
}
