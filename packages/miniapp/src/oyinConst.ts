// 🎯 O'yin ekranlari uchun KICHIK umumiy doimiylar. ATAYLAB alohida modul: `uy.tsx` (bosh
// ekran, kritik yo'l) `oyin.tsx` dan import qilsa, butun o'yin chunk'i (~95 KB) va `oyk.css`
// bosh bundle'ga tortilardi — o'yin esa lazy bo'lishi kerak.

/** STANDART MAQSAD (ega qarori 2026-08-19: «iPhone 17 Pro hammaga default bo'lishi kerak»).
 *  Mijoz O'ZI maqsad tanlamagan bo'lsa ekranlar shu sovrinni ko'rsatadi (avval «eng arzon»
 *  edi). Bu faqat KO'RSATISH tanlovi — ball/pul mantig'iga tegmaydi. Katalogda bunday kalit
 *  bo'lmasa yoki sovrin to'lgan bo'lsa, avvalgi «eng arzon» mantig'i ishlaydi (ekran hech
 *  qachon bo'sh qolmaydi). Kalit — admin katalogidagi `key`. */
export const OYIN_DEFAULT_GOAL_KEY = "iphone-17-pro";
