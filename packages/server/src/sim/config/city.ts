// 🏙 Koson shahar-tuzilishi: real mahalla-nomlari (mahalla_candidates.txt dan bir-martalik
// ko'chirilgan LITERAL — runtime'da fayl o'qilmaydi), xonadon-o'lchami va do'stlik-graf sozlari.
// POI-qatorlar (market/bar/maktab/idora/TEST) tashlab yuborilgan — faqat mahalla-nomlar qoldi.
import type { Rng } from "../rng";
import { rngInt } from "../rng";

/** Real Koson mahalla-nomlari (~30 ta, mahalla_candidates.txt `name` ustunidan). */
export const MAHALLA_NAMES: readonly string[] = [
  "ARABXONA",
  "AMON-OTA",
  "ARALIQ",
  "BAHOR",
  "BOGʼISHAMOL",
  "DO'STLIK",
  "ESABOY",
  "ISTIQBOL",
  "ISHONCH",
  "JIZZALIK",
  "KUXNA QALA",
  "LOLAZOR",
  "MUG'JAGUL",
  "NARTIBALAND",
  "NARTCHUQUR",
  "OLON",
  "OQTEPA",
  "OQYO'L",
  "PILAQUM",
  "QUYBOQ",
  "QUYI OBRON",
  "RAVOT",
  "REGZOR",
  "SARIPUL",
  "SARG'AYMA",
  "SULTONZODALAR",
  "TAHTABOZOR",
  "TEMIRCHI GUZAR",
  "TOKZOR",
  "UMAROTA",
  "UCHQIRA",
  "YANGIOBOD",
  "YUQORI OBRON",
  "ZARSAROY",
  "O'RTA OBRON",
  "SHABADA",
  "SHOHSAROY",
  "CHINOR",
  "CHORBOG'",
  "5-MIKRORAYON",
] as const;

/** Xonadon-o'lchami: 2..6 katta-yosh a'zo (Koson oila-tuzilishi taxmini). */
export const HOUSEHOLD_SIZE_MIN = 2;
export const HOUSEHOLD_SIZE_MAX = 6;

/** Do'stlik-graf: har agentga 3..12 qirra. */
export const FRIEND_EDGES_MIN = 3;
export const FRIEND_EDGES_MAX = 12;

/** Qirralarning qancha ulushi O'Z mahallasi ichida (qolgani shahar bo'ylab). */
export const P_FRIEND_SAME_MAHALLA = 0.8;

export function sampleHouseholdSize(rng: Rng): number {
  return rngInt(rng, HOUSEHOLD_SIZE_MIN, HOUSEHOLD_SIZE_MAX);
}

export function sampleFriendCount(rng: Rng): number {
  return rngInt(rng, FRIEND_EDGES_MIN, FRIEND_EDGES_MAX);
}
