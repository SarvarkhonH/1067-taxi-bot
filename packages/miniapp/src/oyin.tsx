// 🎮 KOSON O'YINI ekrani (feature "oyin", DEFAULT_OFF — QORONG'I qurilish, KOSON_OYIN_PLAN.md v9.2,
// KOSON_ADMIN_DOD.md B4). Real API'ga ulangan — mock-data YO'Q. Dizayn-manba: Claude Design
// "BirJoy home screen states" → "Koson Game World.dc.html" (ega tanlagan yakuniy prototip).
//
// ⚠️ B4'da ATAYLAB OLIB TASHLANGAN prototip-elementlari (soxta ma'lumot ko'rsatmaslik uchun):
// "Bugungi maqsad" halqasi (3 vazifa) va "Haftalik vazifa" chizig'i — B1-B5 DoD doirasida haqiqiy
// backend'i qurilmagan (bular alohida, hali boshlanmagan ish); soxta kontakt-ro'yxati — Telegram
// Mini App'lar tanishlar ro'yxatiga kira olmaydi, shuning uchun "Do'st chaqir" endi mavjud
// `shareLink`/`shareStory` (telegram.ts) orqali Telegramning HAQIQIY ulashish oynasini ochadi;
// soxta QR-kvadrat — real QR-generatsiya (referralQrService) B1-B5 doirasida qurilmagan, shuning
// uchun olib tashlandi (ishlamaydigan grafika ko'rsatish — yolg'on).
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { OYIN_FINAL_LOCK_MS, OYIN_CANCEL_WINDOW_MS, OYIN_JAMOA_MIN, OYIN_JAMOA_MAX, OYIN_PRIZE_FILTERS, oyinFilterPrizes, oyinHintOf, type OyinCardDetail, type OyinCommentListResponse, type OyinPrizeCardsResponse, type OyinPrizeFilter, type OyinActivityAction, type OyinActivityResponse, type OyinFriendRow, type OyinGashtakSearchHit, type OyinJamoamResponse, type OyinJamoaResult, type OyinJamoaView, type OyinMyTicketsResponse, type OyinPrizeView, type OyinPublicWinner, type OyinSeasonClientView, type OyinStateResponse, type OyinVitrinaResponse } from "@t1067/shared";
import { api } from "./api";
import { addToHomeScreen, copyText, haptic, homeScreenStatus, inviteLandingUrl, onHomeScreenAdded, openUserChat, shareLink, shareStory } from "./telegram";
import { OyinStory } from "./oyinStory";
import { Icon } from "./icons";
import { OYIN_DEFAULT_GOAL_KEY } from "./oyinConst";
import "./design/feat/oyk.css"; // bu ekran ochilgandagina yuklanadi (kritik yo'lda emas)

const OB_SEEN_KEY = "oyk_onboard_seen";
const FRIENDS_PAGE = 8; // "Do'stlarim" ro'yxati shuncha ko'rsatiladi, keyin "ko'proq" tugmasi

/** 🤝 Gashtak-tushuntirish (2026-08-06/07, ega talabi — "rasmli, story-uslubida bir-ma-bir
 *  o'tiladigan varoq", "hamma slayd chiroyli animatsiya bilan bo'lsin"). `obSlides`/`.oyk-onboard`
 *  bilan BIR XIL naqsh qayta ishlatildi. HAR slaydda — matn o'rniga/ustiga jonli, qo'lda qurilgan
 *  illyustratsiya (tashqi rasm/video EMAS — mualliflik-huquq xavfi + DIZAYN_QOIDALARI #16 faqat
 *  transform/opacity talabi). Faqat oxirgi (chiqish/tarqatish) slayd ATAYLAB oddiy qoldirildi —
 *  bu ogohlantirish, "quvnoq" animatsiya ohangga zid bo'lardi. */
const GASHTAK_HELP_SEEN_KEY = "oyk_gashtak_help_seen";
function gashtakSlides(): { icon: string; text: string; visual?: "unity" | "join" | "compare" | "goal" | "message" }[] {
  return [
    { icon: "🤝", text: "Gashtak — o'zbekona hamjihatlik: yaqinlaringiz bilan birlashib, navbat bilan bir-biringizga yordam berasiz", visual: "unity" },
    { icon: "👥", text: `${OYIN_JAMOA_MIN}–${OYIN_JAMOA_MAX} kishi — oila, do'stlar, mahalla. Kod yoki havola bilan qo'shiling`, visual: "join" },
    {
      icon: "🎯",
      text: "Boshliq istalgan payt 'kimga ball yig'amiz' deb belgilaydi. Hammaning safari o'sha bitta odamga ishlaydi",
      visual: "compare",
    },
    {
      icon: "📱",
      text: "Misol: yolg'iz yursangiz, telefon kabi katta sovg'aga yetish ancha vaqt oladi. Lekin navbatingiz kelganda — 10 kishi birga yursa, odatdagidan 2-3 baravar ko'p ball yig'asiz. Katta orzuga eng tez yetish yo'li — birga yurish",
      visual: "goal",
    },
    { icon: "📢", text: "Boshliq a'zolarga to'g'ridan-to'g'ri xabar yubora oladi — masalan \"yana 2 safar qilsak yetadi\"", visual: "message" },
    { icon: "🚪", text: "Istalgan payt chiqishingiz mumkin. Boshliq gashtakni butunlay tarqatishi ham mumkin — bu qaytarib bo'lmaydi" },
  ];
}
/** 🎬 "Hamjihatlik" — bir qator odam birga "nafas oladi" (navbat bilan pulslanadi), ostida
 *  ularni bog'lovchi chiziq. Slayd 1. */
function GashtakUnityViz() {
  return (
    <div className="oyk-gun" aria-hidden="true">
      <div className="oyk-gun-line" />
      {[0, 1, 2, 3, 4].map((i) => (
        <span key={i} className="oyk-gun-dot" style={{ animationDelay: `${i * 150}ms` }} />
      ))}
    </div>
  );
}
/** 🎬 "Qo'shilish" — a'zolar birma-bir paydo bo'ladi (guruh tuzilishi). Slayd 2. */
function GashtakJoinViz() {
  return (
    <div className="oyk-gjoin" aria-hidden="true">
      {[0, 1, 2, 3, 4].map((i) => (
        <span key={i} className="oyk-gjoin-dot" style={{ animationDelay: `${i * 220}ms` }} />
      ))}
    </div>
  );
}
/** 🎬 Solo vs gashtak-oyi — ball tezligi taqqoslash animatsiyasi. Ikkita panjara chizig'i bir
 *  vaqtda to'ladi, gashtak chizig'i ANIQ tezroq va uzoqroqqa yetadi. Real nisbat emas (bu his-
 *  tuyg'u uchun illyustratsiya) — lekin yo'nalish rost: gashtak-oyi doim solo-oydan ko'proq beradi.
 *  Slayd 3. */
function GashtakCompareViz() {
  return (
    <div className="oyk-gcmp" aria-hidden="true">
      <div className="oyk-gcmp-col">
        <div className="oyk-gcmp-track"><span className="oyk-gcmp-fill is-solo" /></div>
        <div className="oyk-gcmp-label">Yolg'iz</div>
      </div>
      <div className="oyk-gcmp-col">
        <div className="oyk-gcmp-track">
          <span className="oyk-gcmp-fill is-group" />
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="oyk-gcmp-spark" style={{ animationDelay: `${i * 260}ms` }} />
          ))}
        </div>
        <div className="oyk-gcmp-label is-accent">Navbat sizda</div>
      </div>
    </div>
  );
}
/** 🎬 "Maqsadga oqim" — atrofdan zarrachalar markazdagi orzu-belgiga uchib kiradi, u esa
 *  nafas oladi — guruhning hissasi bitta katta maqsadga yig'ilishini ko'rsatadi. Slayd 4. */
function GashtakGoalViz() {
  const angles = [0, 60, 120, 180, 240, 300];
  return (
    <div className="oyk-ggoal" aria-hidden="true">
      <div className="oyk-ggoal-icon">📱</div>
      {angles.map((deg, i) => (
        <span key={deg} className="oyk-ggoal-spark" style={{ ["--ang" as string]: `${deg}deg`, animationDelay: `${i * 200}ms` }} />
      ))}
    </div>
  );
}
/** 🎬 "Xabar yuborish" — chat-belgisi jo'natilayotgandek suriladi va so'nadi, qayta paydo bo'ladi.
 *  Slayd 5. */
function GashtakMessageViz() {
  return (
    <div className="oyk-gmsg" aria-hidden="true">
      <span className="oyk-gmsg-bubble">💬</span>
    </div>
  );
}
const START_TAB_KEY = "oyk_start_tab"; // uy-hero'dagi "Sovrinlarni ko'rish" shu orqali vitrina'ga ochadi
// Qulf oynasi SERVER bilan BITTA manbadan. Avval mustaqil `48 * 3600_000` turardi: ega
// oynani o'zgartirsa ekran va server ayri ketardi (ekran "yopiq" der, server sotardi).
const FINAL_WARN_MS = OYIN_FINAL_LOCK_MS;

// ⚠️ `toLocaleDateString("uz-UZ", …)` ba'zi klientlarda "M08 14" qaytaradi (lokal ma'lumot yo'q).
// Sana mijozga ko'rinadigan joyda — taxmin qilib bo'lmaydi, shuning uchun o'zimiz yozamiz.
const UZ_OYLAR = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"];
export function uzDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return `${d.getDate()}-${UZ_OYLAR[d.getMonth()] ?? ""}`;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
/** 📋 Huquqiy hujjat uchun TO'LIQ sana — YIL bilan ("4-avgust 2026-yil"). `uzDate` yilni
 *  ko'rsatmaydi: kartada bu yetarli, rasmiy qoidalarda esa muddat yilsiz ma'nosiz.
 *  Sana yo'q yoki buzuq bo'lsa BO'SH qaytadi — chaqiruvchi o'sha qatorni umuman chizmaydi
 *  (DIZAYN_QOIDALARI #5: `NaN` hech qachon ekranga chiqmaydi). */
function uzDateFull(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return `${d.getDate()}-${UZ_OYLAR[d.getMonth()] ?? ""} ${d.getFullYear()}-yil`;
}
/** Sana + soat. Mukofot kuni uchun soat MUHIM (efir necha soatda boshlanadi). */
function uzDateTimeFull(iso: string | null): string {
  const day = uzDateFull(iso);
  if (!day || !iso) return day;
  const d = new Date(iso);
  return `${day}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
/** 🔔 Qo'ng'iroq qatorining vaqti. Avval faqat `uzDate` turardi va bir kunda tushgan hamma
 *  ball "3-avgust" bo'lib chiqardi — ro'yxat tartibi ko'rinardi, VAQTI ko'rinmasdi ("bu safar
 *  balim tushdimi yoki eskisimi?" degan savol javobsiz qolardi). Sana buzuq bo'lsa (`NaN`)
 *  bo'sh qaytariladi — DIZAYN_QOIDALARI #5. */
function uzWhen(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(new Date()) - day(d)) / 86400_000);
  if (diff === 0) return `Bugun, ${hm}`;
  if (diff === 1) return `Kecha, ${hm}`;
  return `${uzDate(iso)}, ${hm}`;
}
/** 👥 Do'st avatarining rangi — a'zo raqamidan (ro'yxat qayta saralansa ham rang o'zgarmasin).
 *  Avval hammaga `oyk-av-0` qotirilgan edi: butun ro'yxat bir xil binafsha doiraga aylanib,
 *  ko'z bilan bir-biridan ajralmasdi (palitradagi 4 rang esa o'lik kod bo'lib yotardi). */
function avatarClass(memberId: number): string {
  return `oyk-av-${Math.abs(Math.trunc(memberId)) % 5}`;
}
// Ekran fazasi = server fazasi + "final48" (oxirgi 48 soat — chipta olish yopiladi).
type ScreenPhase = "unset" | "upcoming" | "active" | "final48" | "ended";
function screenPhase(season: OyinSeasonClientView): ScreenPhase {
  if (!season.configured) return "unset";
  if (season.phase !== "active") return season.phase; // upcoming | ended
  const end = season.endIso ? Date.parse(season.endIso) : NaN;
  if (Number.isFinite(end) && end - Date.now() <= FINAL_WARN_MS) return "final48";
  return "active";
}
/** ⚠️ `Date.parse(null) → NaN`, `Math.max(0, NaN) → NaN` — qo'riqsiz qoldirilsa ekranda
 *  "NaN kun qoldi" chiqadi. Sana yo'q bo'lsa nol qaytariladi va chaqiruvchi umuman chizmaydi. */
function countdownTo(iso: string | null): { d: number; h: number; m: number; totalMs: number } {
  const target = iso ? Date.parse(iso) : NaN;
  const left = Number.isFinite(target) ? Math.max(0, target - Date.now()) : 0;
  const d = Math.floor(left / 86400_000);
  const h = Math.floor((left % 86400_000) / 3600_000);
  const m = Math.floor((left % 3600_000) / 60_000);
  return { d, h, m, totalMs: left };
}

/** Ball jadvali — YAKUNIY DIZAYN §4: varaqda YASHIRILMAYDI, ekranning o'zida turadi.
 *  "Nima qilsam ball ko'payadi?" — o'yindagi eng muhim savol; javob bir bosish ortida
 *  turgani sari odam uni umuman ko'rmasdi. Raqamlar knoblardan keladi, qotirilmagan. */
type BallRow = { ic: string; label: string; ball: number; note: string };
function ballRows(h: OyinStateResponse["hints"]): BallRow[] {
  return ([
    ["📸", "Hikoya joylash", h.storyBall, "admin tasdig'idan keyin"],
    ["🎉", "Do'stingiz BIRINCHI safarini qildi", h.referFirstRideBall, "har do'st uchun bir marta"],
    ["🥇", "Birinchi safaring", h.firstRideBall, "dasturda bir marta"],
    ["🔥", "3 kun ketma-ket safar", h.streakBall, "har 3 kun ketma-ket yursangiz"],
    ["🤝", "Do'stingizning har safari", h.referRideBall, "cheksiz — u yurgani sari"],
    ["👥", "Do'stingiz raqamini uladi", h.referJoinBall, "har do'st uchun bir marta"],
    // 🔴 F5 (2026-08-16 audit): botdan yoki 1067ga qo'ng'iroq qilib — bir xil ball (kas —
    // ikkala kanal uchun yagona manba). Eng ko'p so'raladigan savol shu qatorda javob topadi.
    ["🚕", "O'z safaringiz", h.rideBall, "cheksiz — botdan yoki 1067ga qo'ng'iroq qilib"],
    ["📱", "Telefon tasdiqlash", h.phoneBall, "bir marta"],
    ["📤", "Ulashish", h.shareBall, "kuniga bir marta"],
    ["🗓", "Kunlik kirish", h.loginBall, "kuniga bir marta"],
  ] as const)
    .filter(([, , ball]) => ball > 0)
    .sort((a, b) => b[2] - a[2])
    .map(([ic, label, ball, note]) => ({ ic, label, ball, note }));
}

/** Xarid xatolari — HAR BIRI o'z matni bilan. Avval nomlanmagan sabablar (`unknown_prize`,
 *  `final_lock`) "Ball yetarli emas" ga tushardi: balansi to'la mijozga balansi haqida yolg'on
 *  aytilardi va u nima qilishni bilmay qolardi. */
/** ⚖️ Bitta sovrindan ol(in)adigan maksimum — SERVER formulasining AYNAN nusxasi
 *  (`oyinService.buyTicket`: `min(knob, prize.limit)`).
 *
 *  Ega qarori 2026-08-19 (ikki marta tasdiqlangan): LIMIT YO'Q — xohlagancha karta olish
 *  mumkin, hatto sovrinning hamma joyini (o'shanda mijoz 100% g'olib bo'ladi). Yarim-slot
 *  qo'rig'i OLIB TASHLANDI. Klient formulani BILISHI shart — aks holda ekran serverdan
 *  ko'proq/kamroq va'da qiladi. */
function prizeCap(limit: number, knobMax: number): number {
  return Math.max(1, Math.min(Math.round(knobMax), limit));
}

function buyReasonText(reason: string | undefined, maxPerPrize?: number): string {
  switch (reason) {
    case "sold_out": return "😔 Bu mukofot uchun o'rinlar tugadi — boshqasini tanlang";
    case "drawn": return "🏁 Bu mukofot allaqachon egasiga topshirilgan";
    case "off": return "📅 Dastur hali yopiq — tez orada boshlanadi";
    case "season_off": return "📅 Dastur hozir faol emas — karta olish yopiq";
    case "final_lock": return "🔒 Karta olish yopildi — ro'yxat mukofot kuniga tayyor. Kartalaringiz «Kartalarim» bo'limida";
    // Limit olib tashlangach (ega qarori 2026-08-19) bu holat FAQAT sovrinning hamma joyini
    // olib bo'lganda yuz beradi — ya'ni mijoz allaqachon 100% g'olib.
    case "own_limit": return "🏆 Bu mukofotning hamma kartasi sizda — boshqa sovrinni tanlang";
    case "unknown_prize": return "🚫 Bu mukofot ro'yxatdan olib tashlandi — boshqasini tanlang";
    // ⚠️ `staff` ENDI SERVERDAN KELMAYDI — ega/admin xaridi to'silish o'rniga TEST-karta bo'ladi.
    // Matn eski javoblar (kesh/qayta urinish) uchun qoldirildi.
    case "staff": return "🚫 Xodim va ega mukofot kunida qatnashmaydi — bu adolat qoidasi";
    case "banned": return "🚫 Hisobingiz dasturdan chetlatilgan. Savol bo'lsa — qo'llab-quvvatlashga yozing";
    case "frozen": return "🔒 Mukofot kuni ro'yxati muzlatildi — karta olish yakunlandi. Kartalaringiz «Kartalarim»da";
    case "no_ride": return "🚕 Karta uchun kamida bitta real safar kerak — avval taksi chaqiring";
    case "insufficient": return "⚡ Ball yetarli emas";
    default: return "Xatolik — qayta urinib ko'ring";
  }
}

/** Qo'ng'iroq ro'yxati uchun yorliqlar.
 *
 *  ⚠️ Bu ikkala jadval `Record<OyinActivityAction, …>` deb TIPLANGAN — bu ATAYLAB qilingan.
 *  Avval ular `Record<string, string>` edi va natijasi shu bo'ldi: kalit `daily_login` deb
 *  yozilgan, server esa HECH QACHON bunday harakat yubormaydi — u `login` yuboradi. Ya'ni
 *  "Kunlik kirish" qatori mijozga xom inglizcha `• login` bo'lib chiqardi. Server yangi
 *  `quest` va `home` harakatlarini qo'shganda ular ham jim ravishda `• quest` / `• home`
 *  bo'lib tushdi — hech qanday xato, hech qanday signal.
 *
 *  Endi shunday bo'lishi MUMKIN EMAS: `OYIN_ACTIVITY_ACTIONS` ga yangi element qo'shilsa,
 *  bu yerda yorliq yozilmaguncha `typecheck` YIQILADI. Ega bu ekran haqida "ballar qayerdan
 *  kelayotgani to'liq ro'yxati yo'qku" degan edi — ro'yxat to'liqligi endi kompilyator ishi. */
const ACTION_EMOJI: Record<OyinActivityAction, string> = {
  ride: "🚕", first_ride: "🥇", phone: "📱",
  refer_join: "👥", refer_first_ride: "🎉", refer_ride: "🤝",
  login: "🗓", share: "📤", quest: "🎯", home: "🏠",
  story: "📸", streak: "🔥", sprint_bonus: "🏁", ticket_buy: "🎟", adjust: "🛠", jamoa: "🤝",
};
const ACTION_LABEL: Record<OyinActivityAction, string> = {
  ride: "Safar qildingiz",
  first_ride: "Dasturdagi birinchi safaringiz",
  phone: "Telefon tasdiqlandi",
  refer_join: "Do'stingiz raqamini uladi",
  refer_first_ride: "Do'stingiz birinchi safarini qildi",
  refer_ride: "Do'stingiz safar qildi",
  login: "Ilovaga kirdingiz",
  share: "Ulashdingiz",
  quest: "Kunlik topshiriqni bajardingiz",
  home: "Ilovani telefon ekraniga o'rnatdingiz",
  story: "Hikoyangiz tasdiqlandi",
  streak: "Ketma-ket safar bonusi",
  sprint_bonus: "Haftalik bonus",
  ticket_buy: "Sodiqlik kartasi oldingiz",
  // 🛠 Admin qo'lda tuzatgan ball. Sabab qatorning `note` maydonida chiqadi — mijoz nima
  // uchun ekanini KO'RADI (yashirin tuzatish = "ball qayerdan keldi" savoli javobsiz qolishi).
  adjust: "Ball tuzatildi (admin)",
  // 🤝 Gashtak navbati — jamoaning umumiy safarlari navbatchiga ball olib keladi.
  jamoa: "Gashtak navbati sizda edi",
};
/** Do'st ishtirok etgan voqealar — ism EGA bo'lgan shakl ("Amir safar qildi"). */
const FRIEND_LABEL: Partial<Record<OyinActivityAction, string>> = {
  refer_ride: "safar qildi",
  refer_first_ride: "birinchi safarini qildi",
  refer_join: "raqamini uladi",
};
/** ⚠️ Fallback HECH QACHON xom kalitni chizmaydi. Eski kod `?? r.action` qilardi va shuning
 *  uchun yetishmayotgan yorliq ekranda inglizcha bo'lib ko'rinardi — endi eng yomon holatda
 *  ham o'zbekcha umumiy matn chiqadi (va typecheck buni oldindan ushlaydi). */
function actionLabel(a: string): string {
  return (ACTION_LABEL as Record<string, string | undefined>)[a] ?? "Ball harakati";
}
function actionEmoji(a: string): string {
  return (ACTION_EMOJI as Record<string, string | undefined>)[a] ?? "•";
}

// ── 📋 RASMIY QOIDALAR (S4 — huquqiy qalqon) ─────────────────────────────────────────────
// O'zbekiston "Reklama to'g'risida"gi qonunining rag'batlantiruvchi (sovg'ali) aksiyalarga oid
// talablari UCHTA narsani so'raydi: (1) tashkilotchi ANIQ ko'rsatilgan; (2) qoidalar OCHIQ
// e'lon qilingan — muddat, mukofotlar soni, mukofot egasini aniqlash hamda topshirish tartibi
// va joyi; (3) ishtirok xizmatning ODATDAGI narxi ichida (alohida to'lov yo'q).
//
// ⚠️ TIL: bu varaqda "lotereya / qimor / stavka / tiraj / chipta" atamalari ISHLATILMAYDI —
// ular boshqa, litsenziya talab qiladigan faoliyatning atamalari. Bu yerda faqat:
// sodiqlik kartasi · mukofot · mukofot kuni · sovg'ali aksiya.
//
// ⚠️ MA'LUMOT MANBAI: muddat `season` dan, mukofotlar ro'yxati/soni va har mukofotning
// chegarasi `prizes` dan — JONLI. Qotirilgan sana yoki qotirilgan sovrin ro'yxati YO'Q: ega
// katalogni yoki mavsumni o'zgartirsa, qoidalar hujjati o'zi bilan birga o'zgaradi.

/** ⚠️ EGA TO'LDIRADI — huquqiy majburiy rekvizitlar, UCHALASI SHU YERDA (bitta joy).
 *  Bo'sh qolsa varaqda "______ (ega to'ldiradi)" bo'lib KO'RINIB turadi. Soxta tashkilotchi
 *  nomi, soxta manzil yoki soxta telefon O'YLAB TOPILMAYDI: yolg'on rekvizit huquqiy qalqonni
 *  qalqon emas, mijozga qarshi ishlaydigan dalilga aylantiradi.
 *  Tip ATAYLAB `string` (literal `""` emas) — aks holda TypeScript qiymatni "har doim bo'sh"
 *  deb toraytiradi va to'ldirilgach shartlar ustida ogohlantirish beradi. */
const RULES_ORGANIZER: string = ""; // YaTT/MChJ TO'LIQ nomi + STIR
const RULES_HANDOVER: string = ""; // mukofot topshiriladigan JOY va MUDDAT
const RULES_CONTACT: string = ""; // savol/shikoyat uchun bog'lanish (telefon yoki @username)

/** To'ldirilmagan rekvizit — YASHIRILMAYDI. Yashirilgan bo'sh joy hech qachon to'ldirilmaydi;
 *  ko'rinib turgani esa to'ldirilmaguncha "hujjat tayyor emas" deb turadi. */
function RuleFill({ value }: { value: string }) {
  const v = value.trim();
  if (v) return <>{v}</>;
  return <span className="oyk-rules-fill">______ <i>(ega to'ldiradi)</i></span>;
}

function RuleSec({ n, t, children }: { n: number; t: string; children: ReactNode }) {
  return (
    <section className="oyk-rules-s">
      <h3 className="oyk-rules-n"><i>{n}</i>{t}</h3>
      <div className="oyk-rules-x">{children}</div>
    </section>
  );
}

/** Qoidalar varag'i. ⚠️ O'Z scrim'i bilan keladi (umumiy `sheet` konteyneri ichida EMAS):
 *  qoidalar mavsum BOSHLANMAGAN ekranda ham ochilishi kerak, u ekran esa erta `return`
 *  bilan chiqadi va umumiy konteynergacha yetmaydi. Huquqiy hujjat "mavsum faol bo'lsa
 *  ko'rinadi" bo'lishi mumkin emas — u DOIM ochiq bo'lishi shart. */
function RulesSheet({ season, prizes, maxPerPrize, onClose }: {
  season: OyinSeasonClientView;
  prizes: OyinPrizeView[];
  maxPerPrize: number;
  onClose: () => void;
}) {
  const from = uzDateFull(season.startIso);
  const to = uzDateTimeFull(season.endIso);
  // Qulf oynasi SERVER bilan bitta manbadan (soat qotirilmagan): ega oynani o'zgartirsa
  // qoidalar matni ham o'zgaradi, aks holda hujjat serverdan boshqa gap aytardi.
  const lockH = Math.round(OYIN_FINAL_LOCK_MS / 3600_000);
  const cards = prizes.reduce((s, p) => s + p.limit, 0);
  return (
    <div className="oyk-scrim" onClick={onClose}>
      <div className="oyk-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="oyk-sheet-grip" />
        <div className="oyk-sheet-title">📋 Dastur qoidalari</div>
        <div className="oyk-rules">
          <div className="oyk-rules-lead">
            <b>BirJoy sodiqlik dasturi qoidalari</b>
            <small>
              BirJoy taksi xizmati mijozlari uchun sovg'ali aksiya. Dasturda qatnashish — shu
              qoidalarga rozilik bildirish demakdir.
            </small>
          </div>

          <RuleSec n={1} t="Dastur nomi">
            <b>BirJoy sodiqlik dasturi.</b> Mijoz BirJoy orqali taksi chaqiradi, ball yig'adi va
            yig'ilgan ballga sodiqlik kartasi oladi. Sovrinning kartalari to'lgach, shu kartalar
            orasidan mukofot egasi aniqlanadi (jonli efirda).
          </RuleSec>

          <RuleSec n={2} t="Tashkilotchi">
            Tashkilotchi: <RuleFill value={RULES_ORGANIZER} /><br />
            Mukofotlar bo'yicha barcha majburiyat tashkilotchi zimmasida.{" "}
            <b>Yutilgan sovg'ani berish — BirJoy platformasining majburiy vazifasi:</b> mukofot
            egasi 9-bandda tasvirlangan tartibda aniqlangach, sovg'a berilishi shart va
            kechiktirilmaydi.
          </RuleSec>

          {/* ⏳ Muddat — JONLI (`season.startIso` / `endIso`). Mavsum sozlanmagan bo'lsa
              (`configured: false`) ikkala sana ham `null` bo'ladi va bu yerda "NaN" emas,
              rost gap chiqadi: sana hali e'lon qilinmagan. */}
          <RuleSec n={3} t="Dastur muddati">
            {from || to ? (
              <>
                {from ? <>Boshlanishi: <b>{from}</b>.<br /></> : null}
                {to
                  ? <>Yakunlanishi va mukofot kuni: <b>{to}</b>.<br /></>
                  : <>Yakunlanish sanasi hali e'lon qilinmagan.<br /></>}
                Sodiqlik kartalari va ularning raqamlari <b>muddatdan keyin ham saqlanadi</b>.
              </>
            ) : (
              <>Muddat hali e'lon qilinmagan. Sana belgilangach shu yerda ko'rsatiladi.</>
            )}
          </RuleSec>

          {/* 🛡 ENG MUHIM BAND: ishtirok xizmatning ODATDAGI narxi ichida. Aynan shu gap
              sovg'ali aksiyani litsenziya talab qiladigan faoliyatdan ajratadi. */}
          <RuleSec n={4} t="Qanday qatnashiladi">
            BirJoy orqali taksi chaqirasiz va safar uchun xizmatning <b>odatdagi narxini</b>
            {" "}to'laysiz. Safar va boshqa bepul harakatlar uchun ball yig'iladi. Yig'ilgan
            ballga sodiqlik kartasi olasiz.<br />
            <b>Sodiqlik kartasi uchun alohida pul to'lanmaydi.</b> Ishtirok safarning odatdagi
            narxi ichida: xizmat narxi dastur tufayli oshirilmaydi va dasturda qatnashmaydigan
            mijoz ham aynan shu narxni to'laydi. Ball ham, karta ham faqat ilova ichidagi hisob
            birligi — ular pul emas.
          </RuleSec>

          <RuleSec n={5} t="Ball qanday yig'iladi">
            Ball — turli ijobiy harakatlar uchun beriladigan ilova ichidagi hisob birligi.
            Asosiy manbalar: BirJoy orqali qilingan <b>haqiqiy safarlar</b>, do'st taklif qilish,
            ilovaga muntazam kirish, sovrinni ijtimoiy tarmoqda ulashish va <b>gashtak</b>{" "}
            (7-band) orqali guruh bo'lib yig'ilgan ball. Har manbaning aniq miqdori dastur
            ichida — "Ball yig'ish" varag'ida — ko'rsatiladi va ehtiyojga qarab o'zgarishi
            mumkin.
            {/* 🔴 F5 (2026-08-16 audit): tekshirildi — ball-berish mexanizmi buyurtma
                botdan yoki 1067ga qo'ng'iroq qilib yaratilganidan qat'iy nazar bir xil
                ishlaydi (kas — ikkala kanal uchun yagona manba), lekin bu hech qayerda
                aytilmagan edi. */}{" "}
            <b>1067ga qo'ng'iroq qilib taksi chaqirsangiz ham</b> — botdan chaqirgandek xuddi
            shu ball tushadi, farqi yo'q.
          </RuleSec>

          <RuleSec n={6} t="Sodiqlik kartasi nima">
            Sodiqlik kartasi — ballingiz mukofot narxiga yetganda olinadigan, <b>noyob raqamli</b>{" "}
            hisob yozuvi. Bitta mukofot uchun bir nechta karta olish mumkin — qancha ko'p bo'lsa,
            mukofot kunidagi imkoniyat shuncha yuqori (14-band). Karta egasiga biriktiriladi va
            egasi o'zgartirilmaydi; mavsum tugashi kartaga ta'sir qilmaydi (14-band).
          </RuleSec>

          <RuleSec n={7} t="Gashtak qoidalari">
            Gashtak — {OYIN_JAMOA_MIN}–{OYIN_JAMOA_MAX} kishilik guruh: oila, do'stlar yoki mahalla birgalikda ball yig'adi.
            Qo'shilish faqat boshliq ulashgan <b>kod yoki havola</b> orqali — gashtak nomi bilan
            qo'shilib bo'lmaydi. Istalgan a'zo istalgan payt guruhdan chiqishi mumkin.<br />
            Boshliq istalgan payt <b>«bu safarlar kimga hisoblansin»ni belgilaydi</b> — o'sha
            paytdan e'tiboran gashtakning umumiy safarlari shu a'zoga ball olib keladi. Belgilov
            keyinchalik boshqa a'zoga qayta o'zgartirilishi mumkin. Bir a'zoga oyiga qo'shiladigan
            ball yuqori chegarasi bor — aniq son "⚙️ Boshqarish" varag'ida ko'rinadi.
          </RuleSec>

          {/* 🎁 Mukofotlar — TURLARI umumiy tasvirlanadi (sovg'a nomlari EMAS, ega talabi
              2026-08-13): katalog tez-tez yangilanadi, aniq nomlarni qoidalarga qotirish
              hujjatni tezda eskirtiradi. Joriy aniq ro'yxat — Mukofotlar tabida, jonli. Son
              (jami mukofot/karta) hamon rost va JONLI — bu hisob emas, sanoq. */}
          <RuleSec n={8} t="Mukofotlar">
            Mukofotlar — turmushda kerakli buyumlar (masalan: maishiy texnika, elektronika,
            aksessuarlar). Aniq nomlar, narxlar va har birining sodiqlik kartasi soni doim
            o'zgarib turadi — <b>joriy to'liq ro'yxat "Mukofotlar" bo'limida, jonli</b> ko'rinadi.
            {prizes.length > 0 && <> Hozircha jami <b>{prizes.length} ta mukofot</b> · <b>{cards} ta sodiqlik kartasi</b> e'lon qilingan.</>}
            {" "}Har mukofot yonida topshirilishi uchun kerak bo'lgan karta soni oldindan
            ko'rsatiladi; yetmasa, o'sha mukofot o'ynalmaydi va bu haqda ochiq e'lon qilinadi.
          </RuleSec>

          <RuleSec n={9} t="Mukofot egasi qanday aniqlanadi">
            Har mukofot o'z sodiqlik kartalarining belgilangan qismi tarqatilganda EGASIGA TOPSHIRILADI —
            kerakli son har mukofot yonida (8-band) OLDINDAN ko'rsatilgan. Kerakli son
            yig'ilmasa, o'sha mukofot o'ynalmaydi va bu haqda ochiq e'lon qilinadi.<br />
            Muddat tugashiga <b>{lockH} soat</b> qolganda karta berish to'xtaydi: ro'yxat
            muzlatiladi va ommaga e'lon qilinadi.<br />
            Mukofot egasi <b>jonli efirda</b>, ishonchli guvoh ishtirokida, muzlatilgan
            ro'yxatdan tasodifiy tanlash yo'li bilan aniqlanadi. Natija va ro'yxat keyinchalik
            tekshirish uchun saqlanadi.
          </RuleSec>

          <RuleSec n={10} t="Mukofotni topshirish">
            Topshirish joyi va muddati: <RuleFill value={RULES_HANDOVER} /><br />
            Mukofot faqat egasining o'ziga topshiriladi: shaxsni tasdiqlovchi hujjat va dasturda
            ro'yxatdan o'tgan telefon raqami talab qilinadi.{" "}
            <b>Aniqlangan g'olibga sovg'a berilishi — BirJoy platformasining majburiy vazifasi</b>{" "}
            (2-band).
          </RuleSec>

          <RuleSec n={11} t="Soliq">
            {/* ⚠️ «Yutuq solig'i» — Soliq kodeksidagi RASMIY atama. Uni butunlay olib tashlash
                huquqiy hujjatni noaniq qilardi, shuning uchun mahsulot tili birinchi, rasmiy
                atama qavsda: hujjat ham to'g'ri, ekran ham lug'atga mos. */}
            Mukofot solig'i (qonunda «yutuq solig'i», 12%) 500 000 so'mgacha bo'lgan mukofotlarda tashkilotchi zimmasida.
            Undan qimmatroq mukofotlarda soliq mukofot egasi bilan birgalikda rasmiylashtiriladi.
          </RuleSec>

          <RuleSec n={12} t="Kim qatnasha olmaydi">
            Tashkilotchi, uning xodimlari va ularning oila a'zolari mukofot kunida qatnasha
            olmaydi.<br />
            Bir odam bir nechta hisob ochsa, soxta ma'lumot yoki qalbaki taklif ishlatsa — uning
            bali va kartalari bekor qilinadi.
          </RuleSec>

          <RuleSec n={13} t="Savol va shikoyat">
            Murojaat uchun: <RuleFill value={RULES_CONTACT} /><br />
            Har bir murojaat ko'rib chiqiladi va javob beriladi.
          </RuleSec>

          <RuleSec n={14} t="Muhim chegaralar">
            <ul className="oyk-rules-ul">
              <li>Sodiqlik kartasi pulga sotilmaydi, boshqa odamga berilmaydi va naqd pulga almashtirilmaydi.</li>
              <li>Ball ham sotilmaydi, boshqa hisobga o'tkazilmaydi va pulga almashtirilmaydi.</li>
              <li>Kartaga sarflangan ball qaytarilmaydi.</li>
              {/* 🔴 O1 — TUZATILDI (2026-08-12). Avvalgi uchta band («muddatga bog'liq emas»,
                   «6 oy harakatsiz», «24 oy tarix») HAMMASI kod bilan zid edi: 6 oylik so'nish
                   olib tashlangan, ball oynasi 24 oy emas — MAVSUM (`computeBallMap`,
                   2026-08-11 ega qarori). Mijoz shu ekranda aynan qoidaning o'zidagi eng
                   muhim jumlani o'qiydi — matn kod bilan ZID bo'lsa bu yolg'on va'da. */}
              <li><b>Ball mavsum ichida yashaydi.</b> Mavsum tugaganda ball hisobi hammada
                barobar noldan boshlanadi — lekin kartaga aylantirgan ballingiz kartada
                saqlanib qoladi. Ball yo'qolmaydi: u yo kartaga aylanadi, yo mavsum bilan
                yopiladi. Tanlov sizda.</li>
              {/* 🔴 K9 (OYIN_KARTA_PLAN.md §12.1) — "abadiy" so'zi huquqiy yumshatildi: karta
                   "mulk" emas, akkauntga BIRIKTIRILGAN yozuv — egasi o'zgarmaydi/qayta berilmaydi,
                   lekin akkaunt o'chsa arxivlanadi (cheksiz kafolat va'da qilinmaydi). */}
              <li>Sodiqlik kartasi akkauntingizga biriktirilgan — egasi o'zgartirilmaydi va karta
                qayta berilmaydi. Mavsum tugashi kartaga ta'sir qilmaydi. Akkaunt o'chirilsa,
                karta arxivlangan holatda qoladi.</li>
              {/* ⚖️ 2026-08-19 (ega qarori, ikki marta tasdiqlangan): karta sonida CHEKLOV YO'Q.
                  Yarim-slot qo'rig'i ham olib tashlandi — mijoz sovrinning hamma joyini olsa,
                  u 100% g'olib bo'ladi. Matn shu haqiqatni ochiq aytadi. */}
              <li>Karta sonida cheklov yo'q — ko'proq karta, ko'proq imkoniyat. Sovrinning barcha
                kartalarini olsangiz, mukofot kafolatlangan holda sizniki bo'ladi.</li>
            </ul>
          </RuleSec>

          <div className="oyk-rules-foot">
            Qoidalarning amaldagi tahriri shu varaqda turadi. O'zgarish bo'lsa, yangi tahrir shu
            yerda e'lon qilinadi.
          </div>
        </div>
        <button type="button" className="oyk-sheet-ok" onClick={onClose}>Yopish</button>
      </div>
    </div>
  );
}

type OyinTab = "home" | "vitrina" | "tickets" | "jamoam";
// 🎟 2026-08-12 (ega talabi): `cards` — sovg'aning kartalar panjarasi · `card` — bitta
// kartaning sahifasi (O'ZGA odamning kartasi ham shu bilan ochiladi).
// 🎯 2026-08-12 (ega talabi — "bitta ekran bitta savolga javob"): `earn` — soddalashtirilgan
// bosh ekrandan "Ball yig'ish" bosilganda ochiladigan qatlam (safar/do'st/ulashish + kunlik
// vazifalar + topshiriq). Avval bularning HAMMASI uy tabida bir vaqtda turardi.
// 🗑 "info" (❓ Savol-javob hub) OLIB TASHLANDI 2026-08-13 — sarlavhadagi "?" tugmasi bilan
// birga ketdi. Ichidagi 4 havola HAMMASI boshqa joydan mustaqil reachable edi allaqachon
// (Dastur/Jamoam/Mukofotlar tablaridan) — hub o'zi faqat qo'shimcha qavat edi.
// 🗑 "how" (statik "Qanday ishlaydi?" varag'i) OLIB TASHLANDI 2026-08-13 — kirish tugmasi
// endi story'ni ochadi (`setOnboard`), sheet emas.
type SheetKind = "buy" | "ball" | "earn" | "bell" | "rules" | "gashtak" | "cards" | "card" | "comments" | "winners" | null;
type LoadState = "loading" | "ready" | "error";

export function OyinView({ onTaxi, joinCode }: { onTaxi?: () => void; joinCode?: string | null } = {}) {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [state, setState] = useState<OyinStateResponse | null>(null);
  const [vitrina, setVitrina] = useState<OyinVitrinaResponse | null>(null);
  const [jamoam, setJamoam] = useState<OyinJamoamResponse | null>(null);
  // 🔔 Qo'ng'iroq — ball qayerdan kelgani. Reyting OLIB TASHLANDI (ega qarori).
  const [bell, setBell] = useState<OyinActivityResponse | null>(null);
  // 🏠 Doimiy topshiriq — Telegram klienti qo'llab-quvvatlaydimi. `unsupported` bo'lsa
  // topshiriq umuman ko'rsatilmaydi (bajarib bo'lmaydigan vazifa ko'rsatish — bo'sh va'da).
  const [homeAddable, setHomeAddable] = useState<boolean | null>(null);
  // 🗑 "Qizil nuqta" (o'qilmagan voqealar soni) OLIB TASHLANDI 2026-08-13 — uni ko'rsatadigan
  // sarlavha-qo'ng'iroqchasi olib tashlandi, "Ballingiz qayerdan keldi" endi oddiy havola
  // ("Ball yig'ish" varag'i ichida). `setBellSeen` hamon `openBell`da chaqiriladi (keyingi
  // safar shu funksiya qaytarilsa hisoblash tayyor tursin).
  const [bellSeen, setBellSeen] = useState<string>(() => { try { return localStorage.getItem("oyk_bell_seen") ?? ""; } catch { return ""; } });
  const [tickets, setTickets] = useState<OyinMyTicketsResponse | null>(null);
  const [tab, setTab] = useState<OyinTab>(() => {
    try {
      const t = localStorage.getItem(START_TAB_KEY);
      if (t) localStorage.removeItem(START_TAB_KEY);
      return t === "vitrina" ? "vitrina" : "home";
    } catch { return "home"; }
  });
  const [sheet, setSheet] = useState<SheetKind>(null);
  // 🎟 Kartalar panjarasi va karta sahifasi (ega talabi 2026-08-12).
  // ⚠️ Xato holati ALOHIDA saqlanadi: `null` ma'lumot «karta yo'q» degani EMAS, u «yuklanmadi»
  // bo'lishi ham mumkin. Ikkalasini aralashtirish shu kodbazada allaqachon bir necha ekranda
  // «Hali hech narsa yo'q» degan YOLG'ON bo'sh holatni keltirgan (DIZAYN_QOIDALARI).
  const [cardsData, setCardsData] = useState<OyinPrizeCardsResponse | null>(null);
  const [cardsErr, setCardsErr] = useState(false);
  // Panjara qaysi sovg'a uchun ochilgani — bo'sh katakka bosilganda "Karta olish" tugmasi
  // shu sovg'aning narxi/qoidalari (tapPrize) bilan ishlashi uchun kerak.
  const [cardsPrize, setCardsPrize] = useState<OyinPrizeView | null>(null);
  const [cardData, setCardData] = useState<OyinCardDetail | null>(null);
  const [cardErr, setCardErr] = useState(false);
  // 💬 K8 — sovg'a ostidagi ochiq komentariya. `commentsPrize` "cardsPrize" bilan bir xil rol
  // (qaysi sovg'a uchun ochilgani), `card`/`cards` sheetlaridan ATAYLAB ALOHIDA state — ikkalasi
  // bir vaqtda ochiq bo'lmaydi, lekin aralashtirib qo'yish (masalan yopishda) osonlik uchun emas.
  const [commentsData, setCommentsData] = useState<OyinCommentListResponse | null>(null);
  const [commentsErr, setCommentsErr] = useState(false);
  const [commentsPrize, setCommentsPrize] = useState<OyinPrizeView | null>(null);
  const [commentText, setCommentText] = useState("");
  const [commentBusy, setCommentBusy] = useState(false);
  // 🛡 Panjaradan tez-tez katak almashtirilsa (yopib-boshqasini ochish), eski so'rov KECHROQ
  // qaytishi mumkin va yangi kartani eskisining ma'lumoti bilan bosib yozib qo'yishi mumkin
  // edi. `gno` shu yerda "so'nggi so'ralgan" sifatida saqlanadi — javob kelganda mos kelmasa
  // e'tiborsiz qoldiriladi.
  const cardReqRef = useRef<number | null>(null);
  // Bo'sh (hali sotilmagan) katakka bosilganda: haqiqiy karta yo'q (gno faqat xariddan keyin
  // tug'iladi), shuning uchun serverga so'rov yubormaymiz — faqat joy raqamini ko'rsatamiz.
  const [emptySlotNo, setEmptySlotNo] = useState<number | null>(null);
  // 🗒 K2/K3 (2026-08-14, karta="xotira") — egasining o'z qaydi. `cardData` yuklanganda
  // sinxronlanadi (pastdagi useEffect); tahrirlash faqat `cardData.mine` bo'lganda ko'rinadi.
  const [noteText, setNoteText] = useState("");
  const [notePublic, setNotePublic] = useState(false);
  const [noteBusy, setNoteBusy] = useState(false);
  // 👤 K4 — avatar-rozilik. `cardData.avatarOptIn` mavjud qiymat, `avatarBusy` faqat
  // so'rov davomida tugma bosilib qolishini oldini oladi.
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [filter, setFilter] = useState<OyinPrizeFilter>("hammasi");
  const [archOpen, setArchOpen] = useState(false);
  // 🧭 Jamoam tabi ichida segment: Gashtak (jamoaviy) va Do'stlarim (shaxsiy) endi bir vaqtda
  // EMAS, navbat bilan ko'rinadi (kognitiv yuk: ikki mustaqil tizim bitta uzun skrollda ustma-ust
  // turardi). Havola bilan kelgan odam (joinCode) to'g'ri Gashtakka tushadi. Mavsum tugagach
  // gashtak yo'q — segment chizilmaydi, faqat Do'stlarim qoladi.
  const [jamoamView, setJamoamView] = useState<"gashtak" | "friends">(joinCode ? "gashtak" : "friends");
  // 📸 Hikoya-poster (20 rasm panjarasi + 2 URL maydoni) default YIG'ILGAN — Jamoam tabini
  // qisqartiradi. "Hikoya qo'y" bosilganda ochiladi (yoki earn-varag'idagi havoladan `goToStory`).
  const [posterOpen, setPosterOpen] = useState(false);
  // ⋯ Vitrina kartasida ikkinchi darajali amallar (maqsad/kartalar/fikrlar) «⋯» menyusiga
  // yig'ildi (avval har kartada 4 tugma yonma-yon edi — «tugma devori»). Bir vaqtda bitta
  // karta menyusi ochiq (shu sovrin `key`i); boshqa kartaga bosilsa avvalgisi yopiladi.
  const [menuKey, setMenuKey] = useState<string | null>(null);
  // 🏆 Ochiq g'oliblar tarixi (ega talabi 2026-08-19: «hamma bilishi kerak … tarixda saqlanishi
  // kerak hamma uchun»). Xato holati ALOHIDA: `null` = yuklanmoqda, `[]` = haqiqatan bo'sh.
  const [winners, setWinners] = useState<OyinPublicWinner[] | null>(null);
  const [winnersErr, setWinnersErr] = useState(false);
  const [buyKey, setBuyKey] = useState<string | null>(null);
  const [buyQty, setBuyQty] = useState(1); // 🎟 miqdor (max 3) — YAKUNIY DIZAYN §7 tafsilot ekrani
  const [busy, setBusy] = useState(false); // faqat CHIPTA XARIDI
  // Poster/hikoya alohida flag: avval bitta `busy` uchala operatsiyani band qilardi —
  // sekin tarmoqda chipta olayotgan mijoz Jamoam tabida "⏳ Tayyorlanmoqda…" ni ko'rardi.
  const [posterBusy, setPosterBusy] = useState(false);
  // `ticketNo` — GLOBAL raqam (`gno`). Avval bu yerga sovrin-ichi tartib raqami tushardi va
  // bayramda "№0002", Chiptalarim'da esa "№ 729476" chiqardi — bitta chipta, ikki xil raqam.
  const [celebrate, setCelebrate] = useState<{ prize: OyinPrizeView; ticketNo: number; code: string; count: number } | null>(null);
  // Rasm-havolasi buzilgan sovrinlar — React-xavfsiz fallback (DOM'dan `remove()` qilish
  // React boshqaradigan tugunni tashqaridan o'chiradi va keyingi render'da qulashi mumkin;
  // bundan tashqari o'chirilgan blok ichida sovrin NOMI va NARXI ham qolib ketardi).
  const [badPhoto, setBadPhoto] = useState<Set<string>>(new Set());
  const markBadPhoto = useCallback((key: string) => setBadPhoto((s) => (s.has(key) ? s : new Set(s).add(key))), []);
  const [toast, setToast] = useState<string | null>(null);
  const [thanked, setThanked] = useState<Set<number>>(new Set());
  // Ikkita alohida, aniq nomlangan havola-maydoni (Instagram / Telegram) — pastdagi JSX'da.
  const [igUrl, setIgUrl] = useState("");
  const [tgUrl, setTgUrl] = useState("");
  // 🖼 2026-08-05: dinamik Canvas-generatsiya (matn+shablon+QR) BEKOR QILINDI — ega "oddiygina
  // qilib qo'y" dedi, 20 ta TAYYOR rasm (`state.story.posters`, statik fayl) bor, hech narsa
  // chizilmaydi. Mijoz galereyadan birini tanlaydi (`selectedPoster` = o'sha rasmning haqiqiy
  // URL'i, `blob:` EMAS — shuning uchun uzoq bosib saqlash Telegram WebView'da ham to'g'ri
  // ishlaydi, avvalgi `blob:` versiyasi tushunarsiz vaqtinchalik havola ko'rsatgan edi).
  const [selectedPoster, setSelectedPoster] = useState<string | null>(null);
  const [onboard, setOnboard] = useState<number | null>(() => {
    try { return localStorage.getItem(OB_SEEN_KEY) ? null : 0; } catch { return 0; }
  });
  // 🤝 Gashtak-tushuntirish — avtomatik CHIQMAYDI (onboard'dan farqli), faqat "?" varag'idan
  // yoki Gashtak bo'sh-holat ekranidagi "Qanday ishlaydi" havolasidan ochiladi.
  const [gashtakHelp, setGashtakHelp] = useState<number | null>(null);
  const finishGashtakHelp = useCallback(() => {
    setGashtakHelp(null);
    try { localStorage.setItem(GASHTAK_HELP_SEEN_KEY, "1"); } catch { /* xotira yopiq — muhim emas */ }
  }, []);
  const [, forceTick] = useState(0); // countdown daqiqada bir yangilansin
  const toastT = useRef<ReturnType<typeof setTimeout>>();

  // `soft=true` — QAYTA yuklash (xariddan/maqsaddan keyin). Xato bo'lsa ekran o'chirilmaydi:
  // avval chipta olgan mijoz tarmoq uzilganda bayram-oynasini ham, tab-qatorini ham, chipta
  // raqamini ham yo'qotardi va "yuklab bo'lmadi" ekraniga tushardi — ball to'langan, isbot yo'q.
  const loadHome = useCallback((soft = false) => {
    // Buzuq rasm belgisi tozalanadi: (a) bir marta tarmoq uzilib rasm kelmasa sovrin butun
    // sessiya davomida emoji bo'lib qolardi; (b) admin URL'ni TUZATSA ham yangi rasm
    // ko'rsatilmasdi — belgi URL emas, KALIT bo'yicha eslab qolinardi.
    setBadPhoto(new Set());
    // 🔔 Qo'ng'iroq ro'yxati QAYTA YUKLANADI (avval faqat `setBell(null)` turardi va boshqa
    // hech kim uni tiklamasdi): chipta olgandan keyin `loadHome` yurardi, `bell` null bo'lib
    // qolardi va qizil nuqta sessiya OXIRIGACHA yo'qolardi — ya'ni "yangi ball tushdi"
    // signali aynan ball tushgandan keyin o'chardi. Eski ro'yxat yangisi kelguncha turadi.
    api.oyinBell().then(setBell).catch(() => undefined);
    Promise.all([api.oyinState(), api.oyinVitrina()])
      .then(([s, v]) => { setState(s); setVitrina(v); setLoadState("ready"); })
      .catch(() => { if (!soft) setLoadState("error"); });
  }, []);
  useEffect(() => { loadHome(); }, [loadHome]);
  // ⏱ MAVJUD tik (yangi poller QO'SHILMAYDI — CLAUDE.md qoidasi). Ikki ish qiladi:
  // 1) sanoqni qayta chizadi;
  // 2) FAZA CHEGARASINI kuzatadi. Avval faza faqat `loadHome` da (ya'ni mount'da) hisoblanardi
  //    va ochiq turgan sessiyada mavsum tugashi HECH QACHON ko'rinmasdi: "🔒 Oxirgi 48 soat"
  //    banneri mavsum tugagandan keyin ham qotib turardi, "🏁 MAVSUM YAKUNLANDI" esa hech
  //    qachon kelmasdi. Endi chegaradan o'tilganda serverdan HAQIQIY holat so'raladi
  //    (qurilma soatiga ishonib ekranni o'zimiz almashtirmaymiz — G7 ga qarang).
  const stateRef = useRef<OyinStateResponse | null>(null);
  const phaseRef = useRef<ScreenPhase | null>(null);
  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => {
    const t = setInterval(() => {
      forceTick((n) => n + 1);
      const s = stateRef.current;
      if (!s) return;
      const now = screenPhase(s.season);
      if (phaseRef.current === null) { phaseRef.current = now; return; }
      if (phaseRef.current !== now) { phaseRef.current = now; loadHome(true); }
    }, 60_000);
    return () => clearInterval(t);
  }, [loadHome]);
  // ⚠️ Tarmoq XATOSI bo'shlikdan FARQ qiladi. Avval `catch` bo'sh ro'yxat yozardi va chiptasi
  // BOR odam "Hali chiptangiz yo'q", do'stlari BOR odam "Hali hech kimni taklif qilmagansiz"
  // deb o'qirdi — ya'ni ilova aloqa uzilganini mijozning bo'shligi deb TARJIMA qilardi.
  const [ticketsErr, setTicketsErr] = useState(false);
  const [jamoamErr, setJamoamErr] = useState(false);
  // 👥 Do'stlar ro'yxati uzun bo'lishi mumkin (ega talabi 2026-08-06: "ko'proqni bosib
  // hammasini ko'ray") — birinchi bosqichda qisqa, "ko'proq" bosilsa to'liq.
  const [friendsExpanded, setFriendsExpanded] = useState(false);
  const loadTickets = useCallback(() => {
    setTicketsErr(false);
    api.oyinTickets().then(setTickets).catch(() => setTicketsErr(true));
  }, []);
  useEffect(() => {
    if (tab === "tickets" && !tickets && !ticketsErr) loadTickets();
  }, [tab, tickets, ticketsErr, loadTickets]);
  // Jamoam BOSH yuklanishdayoq keladi (tab ochilishini kutmaydi) — bosh ekrandagi "rahmat-karta"
  // (oyk-magnet) shu ma'lumotga qaraydi; aks holda u Jamoam tabiga kirmaguncha hech ko'rinmasdi.
  const loadJamoam = useCallback(() => {
    setJamoamErr(false);
    api.oyinJamoam()
      .then((j) => { setJamoam(j); setThanked(new Set(j.friends.filter((f) => f.thankedToday).map((f) => f.memberId))); })
      .catch(() => setJamoamErr(true));
  }, []);
  useEffect(() => { loadJamoam(); }, [loadJamoam]);



  // Jamoam tabiga har kirganda yangilanadi — "do'stingiz bugun yurdi" kartasi eskirmasin.
  useEffect(() => { if (tab === "jamoam") loadJamoam(); }, [tab, loadJamoam]);

  const showToast = useCallback((text: string, ms = 2600) => {
    setToast(text);
    clearTimeout(toastT.current);
    toastT.current = setTimeout(() => setToast(null), ms);
  }, []);
  useEffect(() => () => clearTimeout(toastT.current), []);

  // 🎟 2026-08-06 (ega qarori): mijoz O'ZI chegaraga yetmagan kartasini bekor qila oladi —
  // ball qaytadi, boshqa sovringa sarflay oladi. Faqat `!t.willDraw` (hozircha tirajga
  // tayyor EMAS) — g'olib bo'lishi mumkin bo'lgan kartani bekor qilishga ruxsat YO'Q.
  const [cancellingGno, setCancellingGno] = useState<number | null>(null);
  // ⚠️ Hook Qoidasi buzilgan edi (2026-08-06): `goalBusyKey` avval `setGoal` yonida, YA'NI
  // "unset/upcoming/skeleton/error" erta-return'laridan KEYIN e'lon qilingan edi — shu holatlarda
  // hook chaqirilmay qolib, "Rendered more hooks than during the previous render" xatosini berardi
  // (brauzerda `#oyindemo` orqali darhol topildi). Barcha hooklar erta-return'lardan OLDIN bo'lishi
  // SHART — shuning uchun bu yerga, boshqa `useState`lar bilan bir qatorga ko'chirildi.
  const [goalBusyKey, setGoalBusyKey] = useState<string | null>(null);
  const cancelTicket = useCallback(async (gno: number) => {
    if (!window.confirm("Bu karta bekor qilinsin — ball hisobingizga qaytadi. Davom etasizmi?")) return;
    setCancellingGno(gno);
    try {
      const r = await api.oyinCancelTicket(gno);
      if (r.ok) {
        haptic();
        showToast("✅ Bekor qilindi — ballingiz qaytdi", 3400);
        loadTickets();
        loadHome();
        return;
      }
      showToast(
        r.reason === "will_draw" ? "Bu sovrin allaqachon mukofot kuniga tayyor — bekor qilib bo'lmaydi"
          : r.reason === "final_lock" ? "Davr yakuniga yaqin — bekor qilish yopiq"
          : r.reason === "season_off" ? "Dastur hozir faol emas"
          // 🔴 O11 (2026-08-12): o'tgan mavsum kartasi bekor qilinsa ball QAYTMAYDI (u eski
          // mavsum balansidan to'langan) — sabab shu yerda ANIQ aytiladi, aks holda mijoz
          // kartasini bekorga yo'qotib, «nega ball qaytmadi» deb qoladi.
          : r.reason === "past_season" ? "Bu karta o'tgan mavsumda olingan — bekor qilinsa ball qaytmaydi, shuning uchun bekor qilib bo'lmaydi"
          : r.reason === "too_late" ? "Bekor qilish oynasi yopildi — karta endi sarflangan hisoblanadi"
          : "Bekor qilib bo'lmadi",
        3400,
      );
    } catch {
      showToast("Bekor qilib bo'lmadi — internetni tekshiring");
    } finally {
      setCancellingGno((g) => (g === gno ? null : g));
    }
  }, [showToast, loadTickets, loadHome]);

  // 🤝 Gap-jamoa (gashtak). Alohida yuklanadi — do'st-ro'yxati bilan bog'liq emas va biri
  // yiqilsa ikkinchisi ko'rinishda qolsin.
  // 💡 Kunlik maslahat — a'zo va kun bo'yicha deterministik, so'rov ham saqlash ham KERAK EMAS.
  const dailyHint = oyinHintOf(new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10));

  const [jamoa, setJamoa] = useState<OyinJamoaView | null>(null);
  // 🤝 Gashtak taklif-havolasi (`?go=oyin&gsk=<code>`, 2026-08-05): odam hali gashtakda bo'lmasa
  // qo'shilish maydoni OLDINDAN TO'LDIRILADI. Faqat BIRINCHI yuklashda — keyin foydalanuvchi
  // o'zi tahrirlashi mumkin bo'lishi kerak (har `jamoa` yangilanishida qayta yozib qo'ymaymiz).
  const [jamoaInput, setJamoaInput] = useState(() => joinCode ?? "");
  // 🔑 Kod-input ENDI nom-inputdan JISMONAN alohida (2026-08-13, pastdagi izohga qarang) —
  // `joinCode` chuqur-havoladan kelsa ikkalasi ham shu qiymatdan boshlanadi (join-only ko'rinish).
  const [joinInput, setJoinInput] = useState(() => joinCode ?? "");
  const [jamoaBusy, setJamoaBusy] = useState(false);
  const loadJamoa = useCallback(() => { api.oyinJamoa().then(setJamoa).catch(() => undefined); }, []);
  useEffect(() => { loadJamoa(); }, [loadJamoa]);
  const jamoaReasonText = useCallback((reason: OyinJamoaResult["reason"], cooldownDaysLeft?: number): string => {
    // Har sabab O'Z matni bilan — "xatolik" degan umumiy so'z hech narsa aytmaydi (T4 saboqi).
    switch (reason) {
      case "already_in": return "Siz allaqachon gashtakdasiz";
      case "not_found": return "Bunday kod topilmadi — bu gashtak NOMI emas, boshliq yuborgan kod kerak";
      case "full": return `Gashtak to'lgan (${jamoa?.maxSize ?? 10} kishi)`;
      case "bad_name": return "Nom kamida 2 harf bo'lsin";
      case "not_in": return "Siz gashtakda emassiz";
      case "off": return "📅 Dastur hali yopiq — tez orada boshlanadi";
      case "disbanded": return "Bu gashtak tarqatilgan — havola endi ishlamaydi";
      case "leader_only": return "Faqat gashtak boshlig'i qila oladi";
      case "self_target": return "O'zingizni chiqara olmaysiz — «Gashtakni tarqatish» dan foydalaning";
      case "already_in_group": return "Bu odam allaqachon boshqa gashtakda";
      case "not_group_member": return "Bu odam gashtakda emas";
      case "cooldown": return `⏳ Yana ${cooldownDaysLeft ?? "bir necha"} kundan keyin qo'shilishingiz mumkin — bu gashtak almashtirishni tez-tez qilishning oldini oladi`;
      default: return "Bajarilmadi — birozdan keyin urinib ko'ring";
    }
  }, [jamoa?.maxSize]);
  const doJamoa = useCallback(async (action: "create" | "join" | "leave", v?: string) => {
    haptic();
    setJamoaBusy(true);
    try {
      const r = await api.oyinJamoaAct(action, v);
      setJamoa(r.view);
      if (r.ok) {
        setJamoaInput("");
        setJoinInput("");
        loadHome(true); // jamoa balli darhol balansda ko'rinsin
        showToast(action === "leave" ? "Gashtakdan chiqdingiz" : action === "create" ? "🤝 Gashtak tuzildi — kodni do'stlaringizga yuboring" : "🤝 Gashtakka qo'shildingiz");
      } else {
        showToast(jamoaReasonText(r.reason, r.cooldownDaysLeft));
      }
    } catch {
      showToast("Aloqa uzildi — birozdan keyin urinib ko'ring");
    } finally {
      setJamoaBusy(false);
    }
  }, [loadHome, showToast, jamoaReasonText]);

  // ── 👑 Gashtak boshlig'i (2026-08-05) — kick/add/qidiruv/kod-yangilash/tarqatish/xabar ─────
  const [gashtakSearchPhone, setGashtakSearchPhone] = useState("");
  const [gashtakHits, setGashtakHits] = useState<OyinGashtakSearchHit[] | null>(null);
  const [gashtakMsgTarget, setGashtakMsgTarget] = useState<number | "all" | null>(null);
  const [gashtakMsgText, setGashtakMsgText] = useState("");
  // 🎯 "Kimga ball yig'amiz" (2026-08-05, ega talabi) — boshliq ONGLI belgilaydi, HAMMAGA
  // ko'rinadigan e'lon bo'ladi (asosiy banner, yuqorida).
  const [gashtakTurnTarget, setGashtakTurnTarget] = useState<number | null>(null);
  const [gashtakTurnNote, setGashtakTurnNote] = useState("");
  // ⚙️ Boshqarish varag'i endi segmentlangan (2026-08-05, "qulayroq interfeys" so'ralgach) —
  // avval 5 ta bo'lim bitta uzun ro'yxatda edi, boshliq birinchi ochganda cho'kib qolardi.
  const [gashtakSheetTab, setGashtakSheetTab] = useState<"ball" | "add" | "message" | "settings">("ball");
  const doGashtakSetTurn = useCallback(async () => {
    if (gashtakTurnTarget == null) return;
    haptic();
    setJamoaBusy(true);
    try {
      const r = await api.oyinGashtakSetTurn(gashtakTurnTarget, gashtakTurnNote.trim() || undefined);
      setJamoa(r.view);
      if (r.ok) { setGashtakTurnTarget(null); setGashtakTurnNote(""); }
      showToast(r.ok ? "🎯 E'lon qilindi" : jamoaReasonText(r.reason));
    } catch { showToast("Aloqa uzildi — birozdan keyin urinib ko'ring"); }
    finally { setJamoaBusy(false); }
  }, [gashtakTurnTarget, gashtakTurnNote, jamoaReasonText, showToast]);
  const doGashtakKick = useCallback(async (targetMemberId: number) => {
    if (!window.confirm("Bu a'zoni gashtakdan chiqarasizmi?")) return;
    haptic();
    setJamoaBusy(true);
    try {
      const r = await api.oyinGashtakKick(targetMemberId);
      setJamoa(r.view);
      showToast(r.ok ? "Chiqarildi" : jamoaReasonText(r.reason));
    } catch { showToast("Aloqa uzildi — birozdan keyin urinib ko'ring"); }
    finally { setJamoaBusy(false); }
  }, [jamoaReasonText, showToast]);
  const doGashtakAdd = useCallback(async (targetMemberId: number) => {
    haptic();
    setJamoaBusy(true);
    try {
      const r = await api.oyinGashtakAdd(targetMemberId);
      setJamoa(r.view);
      if (r.ok) { setGashtakHits(null); setGashtakSearchPhone(""); }
      showToast(r.ok ? "🤝 Qo'shildi" : jamoaReasonText(r.reason, r.cooldownDaysLeft));
    } catch { showToast("Aloqa uzildi — birozdan keyin urinib ko'ring"); }
    finally { setJamoaBusy(false); }
  }, [jamoaReasonText, showToast]);
  const doGashtakSearch = useCallback(async () => {
    if (gashtakSearchPhone.replace(/\D/g, "").length < 7) { showToast("To'liq telefon raqamini kiriting"); return; }
    haptic();
    try {
      setGashtakHits(await api.oyinGashtakSearch(gashtakSearchPhone));
    } catch { showToast("Aloqa uzildi — birozdan keyin urinib ko'ring"); }
  }, [gashtakSearchPhone, showToast]);
  const doGashtakRotate = useCallback(async () => {
    if (!window.confirm("Eski havola ishlamay qoladi. Kodni yangilaysizmi?")) return;
    haptic();
    setJamoaBusy(true);
    try {
      const r = await api.oyinGashtakRotateCode();
      setJamoa(r.view);
      showToast(r.ok ? "🔄 Kod yangilandi" : jamoaReasonText(r.reason));
    } catch { showToast("Aloqa uzildi — birozdan keyin urinib ko'ring"); }
    finally { setJamoaBusy(false); }
  }, [jamoaReasonText, showToast]);
  const doGashtakDisband = useCallback(async () => {
    if (!window.confirm("Gashtak butunlay tarqatiladi — hamma chiqariladi. Davom etasizmi?")) return;
    haptic();
    setJamoaBusy(true);
    try {
      const r = await api.oyinGashtakDisband();
      setJamoa(r.view);
      showToast(r.ok ? "Gashtak tarqatildi" : jamoaReasonText(r.reason));
    } catch { showToast("Aloqa uzildi — birozdan keyin urinib ko'ring"); }
    finally { setJamoaBusy(false); }
  }, [jamoaReasonText, showToast]);
  const doGashtakMessage = useCallback(async () => {
    const text = gashtakMsgText.trim();
    if (!text || gashtakMsgTarget == null) return;
    haptic();
    setJamoaBusy(true);
    try {
      const r = await api.oyinGashtakMessage(text, gashtakMsgTarget === "all" ? undefined : gashtakMsgTarget);
      if (r.sent > 0) { setGashtakMsgText(""); setGashtakMsgTarget(null); }
      showToast(r.sent > 0 && r.failed === 0 ? `📨 ${r.sent} kishiga yetdi` : r.sent > 0 ? `📨 ${r.sent} kishiga yetdi, ${r.failed} taga yo'q` : "Yetkazib bo'lmadi");
    } catch { showToast("Aloqa uzildi — birozdan keyin urinib ko'ring"); }
    finally { setJamoaBusy(false); }
  }, [gashtakMsgText, gashtakMsgTarget, showToast]);

  // 🏠 Ekranga o'rnatish — ⚠️ 2026-08-03 QAYTA YOZILDI (ega jonli sinovda topdi: "men ekranga
  // qo'shmagankuman nega ball bergan").
  //
  // ESKI KOD: `if (st === "added") api.oyinHomeScreen(true)` — ya'ni ilova HAR OCHILGANDA
  // Telegram'dan holat so'ralardi va u "added" desa BALL TUSHARDI, mijoz hech narsa qilmasa ham.
  // Ustidagi izoh esa "faqat haqiqiy qo'shilish tasdiqlanadi" deb VA'DA berardi — bu yolg'on edi:
  // Android'da tizim yorliq qo'shilganini ilovaga AYTMAYDI, Telegram so'rov yuborilishi bilanoq
  // "added" deb belgilaydi; Desktop/Web'da javob umuman boshqacha. Ya'ni bu signalni SERVER
  // TEKSHIRA OLMAYDI va unga 300 ball qurilgan edi.
  //
  // YANGI QOIDA (ega qarori): ball FAQAT jonli oqimdan — mijoz tugmani bosib Telegram'ning
  // qo'shish oynasidan o'tganda (`homeScreenAdded` hodisasi). "Allaqachon qo'shilgan" holati
  // uchun HECH QACHON to'lanmaydi.
  // Topshiriq esa faqat `missed` (ya'ni ROSTDAN qo'shilmagan va qo'shish MUMKIN) bo'lganda
  // ko'rsatiladi — aks holda bajarib bo'lmaydigan topshiriq ekranda osilib turardi.
  useEffect(() => {
    let alive = true;
    void homeScreenStatus().then((st) => {
      if (!alive) return;
      setHomeAddable(st === "missed");
      // O'chirib tashlagan bo'lsa belgi olib tashlanadi (ball saqlanib qolmasin).
      if (st === "missed") api.oyinHomeScreen(false).catch(() => undefined);
    });
    // ⚠️ `r.ok` TEKSHIRILADI. Avval natija umuman qaralmasdi va server rad etsa ham (mavsum
    // yopiq, ball allaqachon berilgan, knob 0) ekran "ball tushdi!" deb aytardi — balansda esa
    // hech narsa o'zgarmasdi (DIZAYN_QOIDALARI #9: va'da qilingan ball REAL berilishi shart).
    const off = onHomeScreenAdded(() => {
      api.oyinHomeScreen(true).then((r) => {
        loadHome(true);
        showToast(r.ok ? "🏠 Ilova ekranga qo'shildi — ball tushdi!" : "🏠 Ilova ekranga qo'shildi. Rahmat!");
      }).catch(() => undefined);
    });
    return () => { alive = false; off(); };
  }, [loadHome, showToast]);

  // 🔔 Qo'ng'iroq — ball qayerdan kelgani. Ochilganda "ko'rildi" belgisi yangilanadi.
  const openBell = useCallback(() => {
    haptic();
    setSheet("bell");
    api.oyinBell().then((r) => {
      setBell(r);
      const newest = r.rows[0]?.at ?? "";
      if (newest) { setBellSeen(newest); try { localStorage.setItem("oyk_bell_seen", newest); } catch { /* xotira yopiq */ } }
    }).catch(() => setBell({ rows: [], total: 0, page: 1, pageSize: 30 }));
  }, []);

  // Ulashish matni ANIQ bo'lishi kerak (ega 2026-08-02: "chiroyli va aniq qilish kerak"):
  // bosh sovrin nomi + nima qilish kerakligi + nima uchun bepul. Umumiy "qo'shil" chaqirig'i
  // hech kimni qiziqtirmaydi. Havolani ochgan odam esa botdan rasm+tugmali kartochka oladi
  // (server: bot/oyin.ts sendOyinJoinCard) — chiroylik qabul qiluvchi tomonda.
  const inviteFriend = useCallback(async (nudge?: string) => {
    haptic();
    try {
      const r = await api.referral();
      // 🎯 F8 (2026-08-16, ega misoli: "men iPhone 17 olish uchun ball yig'moqdaman —
      // mening uchun 1067dan foydalan va yutishimga hissa qo'sh"): O'Z maqsadi bo'lsa — SHU
      // sovrin nomi bilan shaxsiy, birinchi shaxs ohangida. Maqsad tanlanmagan/tugagan bo'lsa
      // — avvalgi "bosh mukofot" e'lon ohangiga tushiladi (yangi mijozda hali maqsad yo'q).
      const myPrize = vitrina?.prizes.find((p) => p.key === state?.goalPrizeKey && !p.soldOut)
        ?? [...(vitrina?.prizes ?? [])].sort((a, b) => b.price - a.price)[0];
      const text = nudge ?? (myPrize
        ? `🎮 Men ${myPrize.name} uchun ball yig'moqdaman — mening havolam bilan BirJoydan foydalan va yutishimga hissa qo'sh!\n\nHech narsa to'lamaysan: shunchaki taksida yur, ball yig', sodiqlik kartasini ol. Mening havolam bilan kirsang — ikkalamizga ham ball tushadi 🤝`
        : "🎁 BirJoy sodiqlik dasturi — taksida yur, ball yig', jonli efirda mukofot egasi bo'l. Mening havolam bilan kirsang, ikkalamizga ham ball tushadi 🤝");
      // `inviteLandingUrl` — landing sahifa OG-kartasi bilan (rasm + sarlavha). Xom bot
      // havolasi ulashilsa Telegram quruq, rasmsiz preview chizadi.
      shareLink(inviteLandingUrl(r.link), text);
    } catch {
      showToast("Havolani ochib bo'lmadi — birozdan keyin urinib ko'ring");
    }
  }, [showToast, vitrina, state]);

  // 🚕⏰ "Turtki"/"Uyg'ot" — ANIQ do'stning chatini ochish, tayyor matn bilan (2026-08-06, ega
  // talabi). Username bo'lsa to'g'ridan-to'g'ri o'sha odamning suhbati ochiladi; bo'lmasa (ko'p
  // foydalanuvchida ochiq username yo'q) umumiy ulashish oynasiga tushamiz — lekin bu holatda
  // mijozga NIMA bo'layotgani aytiladi, aks holda "Turtki" bosilgach kimga ketayotgani noaniq
  // qolib ketardi (oynada o'nlab chat bor, mijoz Ismni o'zi topib tanlashi kerak).
  const nudgeFriend = useCallback((f: OyinFriendRow, text: string) => {
    haptic();
    if (f.username) { openUserChat(f.username, text); return; }
    showToast(`Ochilgan oynada ${f.name}ni tanlang`, 2600);
    void inviteFriend(text);
  }, [inviteFriend, showToast]);

  // 🎟 Sovg'aning kartalar panjarasini ochadi. Mijoz bo'sh raqamni O'ZI tanlaydi —
  // «menga farqi yo'q» tugmasi ATAYLAB yo'q (ega qarori 2026-08-12). `p` saqlanadi — bo'sh
  // katakka bosilganda "Karta olish" shu sovg'aning tapPrize qoidalari bilan ishlashi uchun.
  const openCards = useCallback((p: OyinPrizeView) => {
    haptic();
    setCardsData(null); setCardsErr(false); setCardsPrize(p); setSheet("cards");
    void api.oyinPrizeCards(p.key).then(setCardsData).catch(() => setCardsErr(true));
  }, []);
  // 🔎 Bitta karta sahifasi — O'Z kartasi ham, BOSHQA odamniki ham.
  const openCard = useCallback((gno: number) => {
    haptic();
    cardReqRef.current = gno;
    setCardData(null); setCardErr(false); setEmptySlotNo(null); setSheet("card");
    void api.oyinCard(gno)
      .then((d) => { if (cardReqRef.current === gno) setCardData(d); })
      .catch(() => { if (cardReqRef.current === gno) setCardErr(true); });
  }, []);
  // 🗒 K2/K3 — har safar YANGI karta yuklanganda tahrir-maydoni o'sha kartaning o'z qaydiga
  // sinxronlanadi (avvalgi kartadan "qoldiq" matn ko'rinib qolmasin).
  useEffect(() => {
    if (cardData) { setNoteText(cardData.note ?? ""); setNotePublic(cardData.notePublic); }
  }, [cardData]);
  const saveCardNote = useCallback(async () => {
    if (!cardData) return;
    haptic();
    setNoteBusy(true);
    try {
      const r = await api.oyinSetCardNote(cardData.gno, noteText.trim(), notePublic);
      if (r.ok) {
        setCardData({ ...cardData, note: noteText.trim() || null, notePublic });
        showToast(noteText.trim() ? "Qayd saqlandi" : "Qayd o'chirildi");
      } else {
        showToast(r.reason === "too_long" ? "Qayd juda uzun — 140 belgigacha" : "Saqlanmadi");
      }
    } catch {
      showToast("Saqlanmadi — aloqa uzildi");
    } finally {
      setNoteBusy(false);
    }
  }, [cardData, noteText, notePublic]);
  // 👤 K4 — avatar-rozilik almashtirish. Yoqilganda server Telegram'dan rasm tortishga
  // urinadi; topilmasa ham HAQIQATNI aytamiz (bo'sh va'da bermaslik, DIZAYN_QOIDALARI #7).
  const toggleAvatarOptIn = useCallback(async () => {
    if (!cardData) return;
    haptic();
    setAvatarBusy(true);
    try {
      const next = !cardData.avatarOptIn;
      const r = await api.oyinSetAvatarOptIn(next);
      if (r.ok) {
        setCardData({ ...cardData, avatarOptIn: r.optIn, ownerPhotoUrl: r.optIn && !r.photoFound ? null : cardData.ownerPhotoUrl });
        showToast(!r.optIn ? "Rasm yashirildi" : r.photoFound ? "Rasm ko'rsatiladi" : "Yoqildi — lekin Telegram'da ochiq profil-rasmingiz topilmadi");
      } else {
        showToast("Saqlanmadi");
      }
    } catch {
      showToast("Saqlanmadi — aloqa uzildi");
    } finally {
      setAvatarBusy(false);
    }
  }, [cardData]);
  // 💬 K8 — sovg'a ostidagi ochiq komentariyalar. `openCards`/`openCard` bilan bir xil naqsh.
  const openComments = useCallback((p: OyinPrizeView) => {
    haptic();
    setCommentsData(null); setCommentsErr(false); setCommentsPrize(p); setCommentText(""); setSheet("comments");
    void api.oyinComments(p.key).then((d) => { setCommentsData(d); setCommentText(d.myText ?? ""); }).catch(() => setCommentsErr(true));
  }, []);
  const saveComment = useCallback(async () => {
    if (!commentsPrize || !commentText.trim()) return;
    haptic();
    setCommentBusy(true);
    try {
      const r = await api.oyinPostComment(commentsPrize.key, commentText.trim());
      if (r.ok && r.comment) {
        setCommentsData((d) => d ? { ...d, myText: r.comment!.text, comments: [r.comment!, ...d.comments.filter((c) => !c.mine)] } : d);
        showToast("Fikringiz qo'shildi");
      } else {
        showToast(r.reason === "too_long" ? "Juda uzun — 140 belgigacha" : r.reason === "banned" ? "Bu sovrinda yozish sizga yopilgan" : "Yuborilmadi");
      }
    } catch {
      showToast("Yuborilmadi — aloqa uzildi");
    } finally {
      setCommentBusy(false);
    }
  }, [commentsPrize, commentText, showToast]);
  const deleteComment = useCallback(async (id: number) => {
    haptic();
    try {
      const r = await api.oyinDeleteComment(id);
      if (r.ok) {
        setCommentsData((d) => d ? { ...d, myText: null, comments: d.comments.filter((c) => c.id !== id) } : d);
        setCommentText("");
        showToast("O'chirildi");
      }
    } catch {
      showToast("O'chirilmadi — aloqa uzildi");
    }
  }, [showToast]);
  const reportComment = useCallback(async (id: number) => {
    haptic();
    try {
      await api.oyinReportComment(id);
      setCommentsData((d) => d ? { ...d, comments: d.comments.filter((c) => c.id !== id) } : d); // darhol ko'zdan yashiriladi — server 3-shikoyatda haqiqatan yashiradi
      showToast("Shikoyat qabul qilindi");
    } catch {
      showToast("Yuborilmadi — aloqa uzildi");
    }
  }, [showToast]);
  // 🆕 Bo'sh katakka bosilganda (ega talabi 2026-08-12: «har bir karta yasalgan payt ham
  // kirib ko'rib bo'lishi kerak, egasiz bo'lsa ham»). Serverga so'rov YO'Q — `gno` faqat
  // xariddan tug'iladi (K1 rejasi), shuning uchun bu joyda haqiqiy karta ma'lumoti yo'q,
  // faqat "bu joy bo'sh, olishga arziydi" holati ko'rsatiladi.
  const openEmptySlot = useCallback((no: number) => {
    haptic();
    cardReqRef.current = null; // oldingi openCard so'rovi (bo'lsa) endi ESKIRGAN
    setCardData(null); setCardErr(false); setEmptySlotNo(no); setSheet("card");
  }, []);

  const openWinners = useCallback(() => {
    haptic();
    setSheet("winners");
    setWinnersErr(false);
    setWinners(null);
    api.oyinWinners()
      .then((r) => setWinners(r.winners))
      .catch(() => setWinnersErr(true));
  }, []);

  const tapPrize = useCallback((p: OyinPrizeView) => {
    haptic();
    if (p.soldOut) { showToast(buyReasonText("sold_out")); return; }
    // 🔒 To'siq FAQAT server aytgan fazadan (`season.phase === "ended"`).
    // ⚠️ Avval bu yerda klient hisoblagan `final48` ham to'sardi. `final48` esa QURILMA
    // soatidan chiqadi: telefoni 3 soat oldinda ketgan mijozga mavsum FAOL bo'la turib
    // "chipta olish yopildi" deb aytilardi va boshqa yo'l qoldirilmasdi — server esa o'sha
    // chiptani bemalol sotardi. Endi klient to'smaydi; haqiqiy qulfni server qo'yadi
    // (`final_lock`) va sababi `buyReasonText` orqali aytiladi.
    if (state?.season.phase === "ended") { showToast("🔒 Dastur davri yakunlandi — karta olish yopiq. Kartalaringiz «Kartalarim» bo'limida"); return; }
    // 🚕 Safar darvozasi. Server safarsiz mijozga `no_ride` qaytaradi, ekran esa bu haqda
    // HECH NARSA demasdi: tugma "🎟 Chipta ol" bo'lib yonardi → varaq ochilardi → "Tasdiqlash"
    // → xato. Uch qadamli chalkashlik. Ball bepul yo'llardan ham yig'ilgani uchun bu holat
    // real va tez-tez uchraydi, shuning uchun endi BIRINCHI qadamda aytiladi.
    if ((state?.seasonRides ?? 0) <= 0) { showToast("🚕 Karta uchun kamida bitta real safar kerak — avval taksi chaqiring"); return; }
    // Limit ekranda yozilgan, lekin tugma baribir varaq ochardi va server rad etardi —
    // "bo'lmaydi / bo'ladi / bo'lmaydi" uch qadamli chalkashlik. Endi darhol aytiladi.
    const maxP = prizeCap(p.limit, state?.hints.maxPerPrize ?? 50);
    if (p.mine >= maxP) { showToast(buyReasonText("own_limit", maxP)); return; }
    if ((state?.ball ?? 0) < p.price) { showToast(`⚡ Yana ${p.price - (state?.ball ?? 0)} ball kerak — do'st chaqiring!`); return; }
    setBuyQty(1);
    setBuyKey(p.key);
    setSheet("buy");
  }, [state, showToast]);

  const confirmBuy = useCallback(async () => {
    if (!buyKey || busy) return;
    setBusy(true);
    const prize = vitrina?.prizes.find((p) => p.key === buyKey) ?? null;
    // Miqdor (max 3) — server bitta chipta beradi, shuning uchun ketma-ket chaqiramiz.
    // Har chaqiruv o'zi atomik va idempotent; oraliqda tugab qolsa nechtasi olingani AYTILADI
    // (jim "muvaffaqiyat" ko'rsatib qolgan pulni yeb qo'yish — eng yomon xatolardan).
    let got = 0;
    let lastGno: number | null = null;
    let lastCode: string | null = null;
    let stopReason: string | undefined;
    // ⚠️ Miqdor SHU YERDA ham qisqartiriladi. Varaq `qty` ni (limit/qoldiq/ball bo'yicha
    // qisqartirilgan) ko'rsatadi, lekin xom `buyQty` bilan tsikl qilinsa ular ayri ketadi:
    // mijoz "2" ni ko'rib, tizim 3 marta urinadi va oxirgisi xato bilan qaytadi.
    const want = prize && state
      ? Math.max(1, Math.min(buyQty, prizeCap(prize.limit, state.hints.maxPerPrize) - prize.mine, prize.remaining, Math.floor(state.ball / prize.price)))
      : 1;
    try {
      for (let i = 0; i < want; i++) {
        const r = await api.oyinBuyTicket(buyKey);
        if (r.ok && r.gno != null) { got++; lastGno = r.gno; lastCode = r.code ?? null; continue; }
        stopReason = r.reason;
        break;
      }
      setSheet(null);
      if (got > 0 && lastGno != null && lastCode != null && prize) {
        haptic();
        setCelebrate({ prize, ticketNo: lastGno, code: lastCode, count: got });
        // ⚠️ Chiptalar keshini BEKOR qilamiz — aks holda mijoz Chiptalarim tabiga o'tib
        // "Hali chiptangiz yo'q" ni o'qiydi (kesh bir marta yuklanib qotib qolardi).
        setTickets(null);
        // ⚠️ `loadHome(true)` — SOFT. Avval bu yerda `loadHome()` (soft EMAS) turardi va
        // xariddan keyingi qayta-yuklash tarmoq blipida yiqilsa `loadState="error"` bo'lib
        // butun ekran "yuklab bo'lmadi" ga almashardi: ball TO'LANGAN, chipta OLINGAN, lekin
        // bayram oynasi ham, chipta raqami ham mijozga ko'rinmasdi. Yuqoridagi izoh aynan shu
        // bugni "tuzatilgan" deb yozardi — izoh haqiqat emas edi, endi kod izohga mos.
        loadHome(true);
        if (stopReason) showToast(`${got} ta olindi. Qolganini olib bo'lmadi: ${buyReasonText(stopReason, state?.hints.maxPerPrize)}`, 3600);
      } else {
        showToast(buyReasonText(stopReason, state?.hints.maxPerPrize));
        // Server "yopildi" yoki "mavsum faol emas" desa — ekran ESKI holatda qolmasin:
        // haqiqiy fazani serverdan olib kelamiz (klient soatiga ishonmaymiz, G7).
        if (stopReason === "final_lock" || stopReason === "season_off" || stopReason === "sold_out" || stopReason === "drawn") loadHome(true);
      }
    } catch {
      // ⚠️ Tsikl o'rtasida tarmoq uzilsa `got` ALLAQACHON olingan chiptalar sonini bildiradi.
      // Avval bu qiymat tashlanardi: bayram yo'q, balans eski, Chiptalarim keshi eski —
      // mijoz "hech narsa bo'lmadi" deb qayta bosardi va YANA chipta sotib olardi.
      setSheet(null);
      if (got > 0) { setTickets(null); loadHome(true); showToast(`${got} ta karta olindi. Aloqa uzildi — qolganini keyin oling.`, 3600); }
      else showToast("Bajarilmadi — internetni tekshirib qayta urinib ko'ring");
    } finally {
      setBusy(false);
      setBuyKey(null);
    }
  }, [buyKey, buyQty, busy, vitrina, state, loadHome, showToast]);

  // 🤝 Rahmat: tugma DARHOL "✓ Aytildi" ga o'tadi (<100ms javob qoidasi), server rad etsa qaytadi.
  const sayThanks = useCallback(async (friendMemberId: number) => {
    haptic();
    setThanked((s) => new Set(s).add(friendMemberId));
    try {
      const r = await api.oyinThanks(friendMemberId);
      if (r.ok) { showToast("🤝 Rahmatingiz yuborildi!"); return; }
      if (r.reason === "already") { showToast("Bugun allaqachon rahmat aytdingiz"); return; }
      setThanked((s) => { const n = new Set(s); n.delete(friendMemberId); return n; });
      // ⚠️ Har sabab O'ZI aytiladi. Avval HAMMASI "do'stingiz botni bloklagan bo'lishi mumkin"
      // deb chiqardi — eng ko'p uchraydigan sabab esa kunlik push limiti edi (server endi uni
      // umuman qo'llamaydi). Mijoz do'stidan bekorga xafa bo'lardi.
      showToast(
        r.reason === "blocked" ? "Do'stingiz botni bloklagan — xabar yetib bormadi"
          : r.reason === "notify_off" ? "Do'stingiz bildirishnomalarni o'chirgan"
          : r.reason === "no_chat" ? "Do'stingiz hali bot bilan yozishmagan — xabar yuborib bo'lmaydi"
          : "Yuborib bo'lmadi — birozdan keyin urinib ko'ring",
      );
    } catch {
      setThanked((s) => { const n = new Set(s); n.delete(friendMemberId); return n; });
      showToast("Rahmat yuborilmadi — birozdan keyin urinib ko'ring");
    }
  }, [showToast]);

  // 🖼 Rasm tanlash — HECH NARSA generatsiya qilinmaydi, shunchaki tayyor statik faylning
  // haqiqiy URL'i ko'rsatiladi (uzoq bosib saqlash uchun).
  const pickPoster = useCallback((url: string) => { haptic(); setSelectedPoster(url); }, []);
  const closePosterPreview = useCallback(() => setSelectedPoster(null), []);

  // 📸 Uy-tabidagi promo-kartochkadan Jamoam-tabidagi hikoya-bo'limiga o'tish + shu yerga
  // scroll qilish (bo'lim tab ichida pastda, o'zi ko'rinmasligi mumkin).
  const [scrollToStoryPending, setScrollToStoryPending] = useState(false);
  const storyAnchorRef = useRef<HTMLDivElement>(null);
  const goToStory = useCallback(() => { haptic(); setTab("jamoam"); setScrollToStoryPending(true); }, []);
  useEffect(() => {
    if (scrollToStoryPending && tab === "jamoam") {
      // Poster endi Do'stlarim ko'rinishida va default yig'ilgan — havoladan kelgan odam
      // to'g'ri ochiq formaga tushsin.
      setJamoamView("friends");
      setPosterOpen(true);
      storyAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      setScrollToStoryPending(false);
    }
  }, [scrollToStoryPending, tab]);

  // 🖼 2026-08-05: bitta umumiy input o'rniga IKKITA alohida, aniq nomlangan maydon
  // (Instagram / Telegram) — ega talabi: mijoz "bu yerga qaysi havola" deb chalkashmasin.
  // Serverning o'zi ikkalasini ham qabul qiladi (`ALLOWED_HOSTS`), shuning uchun bitta
  // umumiy `submitStory(url, clear)` yetarli — faqat qaysi input tozalanishi farq qiladi.
  const submitStory = useCallback(async (url: string, clear: () => void) => {
    if (posterBusy) return;
    setPosterBusy(true);
    try {
      const r = await api.oyinStory(url.trim());
      if (r.ok) {
        clear();
        showToast("✅ Yuborildi — 24 soat ichida tekshiramiz", 3400);
        loadHome();
        return;
      }
      showToast(
        r.reason === "bad_url" ? "Havola noto'g'ri — Instagram yoki Telegram havolasini yuboring"
          : r.reason === "pending" ? "Oldingi arizangiz hali tekshiruvda"
          : r.reason === "limit" ? "Bu davrda limitga yetdingiz"
          : r.reason === "duplicate" ? "Bu havola allaqachon yuborilgan"
          : r.reason === "season_off" ? "Dastur hozir faol emas"
          : r.reason === "cooldown" ? `Keyingi hikoyani ${r.hoursLeft ?? 72} soatdan keyin joylay olasiz`
          : "Yuborib bo'lmadi",
        3400,
      );
    } catch {
      showToast("Havolani yuborib bo'lmadi — internetni tekshiring");
    } finally {
      setPosterBusy(false);
    }
  }, [posterBusy, showToast, loadHome]);

  // ⚠️ Avval bu tugma HECH NARSA ulashmasdan ball berardi (bepul ball, ulashuv nol).
  // Endi avval Telegram ulashish oynasi ochiladi, ball undan KEYIN beriladi.
  //
  // 🖼 2026-08-05: avval FAQAT `shareLink` (bitta chatga yuborish) chaqirilardi. Endi avval
  // `shareStory` (Telegram Bot API 7.8) sinaladi — bu mijozning O'Z HIKOYASIGA rasm bilan
  // qo'yadi, ya'ni BITTA bosishda BARCHA obunachi/kontaktlariga bir yo'la ko'rinadi (ega
  // so'ragan "hammani belgilab birdan tashlash"ning Telegram platformasidagi HAQIQIY analogi —
  // chatga bitta-bittadan forward qilishdan farqli, umuman tanlov talab qilmaydi). Eski/mos
  // kelmaydigan klientda `shareStory` `false` qaytaradi — o'sha holda avvalgi `shareLink`
  // (bitta chatga forward) yo'liga qaytiladi, hech kim "hech narsa bo'lmadi" holatida qolmaydi.
  const doShareBonus = useCallback(async () => {
    haptic();
    try {
      const r = await api.referral();
      // 🎯 F8 — xuddi `inviteFriend`dagidek: o'z maqsadi bo'lsa shu sovrin nomi bilan shaxsiy ohang.
      const myPrize = vitrina?.prizes.find((p) => p.key === state?.goalPrizeKey && !p.soldOut)
        ?? [...(vitrina?.prizes ?? [])].sort((a, b) => b.price - a.price)[0];
      const link = inviteLandingUrl(r.link);
      const text = myPrize
        ? `🎮 Men ${myPrize.name} uchun ball yig'moqdaman — sen ham BirJoydan foydalanib menga hissa qo'sh!

Taksida yur, ball yig', sodiqlik kartasini ol. Davr oxirida jonli efirda mukofot egalari aniqlanadi. Mening havolam bilan kirsang — ikkalamizga ham ball 🤝`
        : "🎁 BirJoy sodiqlik dasturi — taksida yur, ball yig', jonli efirda mukofot egasi bo'l 🤝";
      if (!shareStory(text, link)) shareLink(link, text);
      const b = await api.oyinShare();
      // ⚠️ Avval bu yerda `loadHome` YO'Q edi: server ballni yozardi, ekran esa eski holatda
      // qolardi — "Ball qo'shildi" toast'i chiqib, balans o'zgarmasdi va "Ulashish" qatori
      // galochkasiz turaverardi (DIZAYN_QOIDALARI #9: va'da qilingan ball KO'RINISHI ham kerak).
      if (b.ok) { loadHome(true); showToast(`📤 Rahmat! +${state?.hints.shareBall ?? 0} ball qo'shildi`); }
      // ⚠️ "ertaga yana bo'ladi" MAVSUM TUGAGACH yolg'on — ertasi yo'q. Matn fazaga qaraydi.
      else if (state?.season.phase === "ended") showToast("Dastur davri yakunlandi — ulashish boni endi berilmaydi. Ulashganingiz uchun rahmat!");
      else showToast("Bugungi ulashish bonusini allaqachon oldingiz — ertaga yana bo'ladi");
    } catch {
      showToast("Ulashish bonusini olib bo'lmadi — qayta urinib ko'ring");
    }
  }, [showToast, vitrina, state, loadHome]);

  const finishOnboard = useCallback(() => {
    setOnboard(null);
    try { localStorage.setItem(OB_SEEN_KEY, "1"); } catch { /* xotira yopiq — muhim emas */ }
  }, []);

  // ── 1) SKELETON ──
  if (loadState === "loading") {
    return (
      <div className="oyk">
        <div className="oyk-skel">
          <div className="oyk-skel-block oyk-skel-head" />
          <div className="oyk-skel-block oyk-skel-draw" />
          <div className="oyk-skel-block oyk-skel-goalc" />
          <div className="oyk-skel-block oyk-skel-acts" />
          <div className="oyk-skel-block oyk-skel-daily" />
        </div>
      </div>
    );
  }
  // ── 2) XATO ──
  if (loadState === "error" || !state || !vitrina) {
    return (
      <div className="oyk">
        <div className="oyk-error">
          <div className="oyk-error-icon">🎮</div>
          <div className="oyk-error-text">Dastur ma'lumotlarini yuklab bo'lmadi. Internetni tekshirib qayta urinib ko'ring.</div>
          <button type="button" className="oyk-error-retry" onClick={() => { setLoadState("loading"); loadHome(); }}>🔄 Qayta urinish</button>
        </div>
      </div>
    );
  }

  const phase = screenPhase(state.season);
  const seasonName = state.season.label ? `BirJoy sodiqlik dasturi · ${state.season.label}` : "BirJoy sodiqlik dasturi";

  // ── 3a) MAVSUM SOZLANMAGAN / HALI BOSHLANMAGAN ──
  if (phase === "unset" || phase === "upcoming") {
    const start = countdownTo(state.season.startIso);
    const soon = [...vitrina.prizes].sort((a, b) => b.price - a.price).slice(0, 6);
    return (
      <div className="oyk">
        <div className="oyk-scroll">
          <div className="oyk-soon-top">
            <div className="oyk-ended-icon">{phase === "unset" ? "🎮" : "🚀"}</div>
            <div className="oyk-ended-title">{phase === "unset" ? "Dastur tez orada" : "Dastur boshlanmoqda"}</div>
            {/* Sanoq kun/soat/daqiqa bilan (YAKUNIY DIZAYN §7). Faqat "4 kun" — jonsiz;
                soat va daqiqa ko'rinsa boshlanish YAQIN ekani his qilinadi. */}
            {phase === "upcoming" && (
              <div className="oyk-cdown">
                <div className="oyk-cdown-c"><b>{start.d}</b><small>kun</small></div>
                <div className="oyk-cdown-c"><b>{pad(start.h)}</b><small>soat</small></div>
                <div className="oyk-cdown-c"><b>{pad(start.m)}</b><small>daqiqa</small></div>
              </div>
            )}
            {/* ⚠️ Avval bu yerda "safar qiling, do'st chaqiring" deb yozilardi — YOLG'ON edi:
                ball faqat MAVSUM ICHIDAGI harakatlardan yig'iladi, boshlanishdan oldingi
                safar hech narsa bermaydi. Endi matn haqiqatni aytadi. */}
            <div className="oyk-ended-note">
              {phase === "upcoming" && state.season.startIso
                ? <><b>{uzDate(state.season.startIso)}</b> kuni start. Ball o'shandan boshlab yig'iladi —
                  shu kuni birinchi safaringiz darhol <b>+{state.hints.firstRideBall} ball</b> olib keladi. 🎁</>
                : <>Mukofotlar tayyor, sana hali belgilanmagan. Belgilangach shu yerda sanoq boshlanadi. 🎁</>}
            </div>
          </div>

          {/* Sovrinlar HOZIROQ ko'rinadi (§7) — odam nima uchun kutayotganini bilishi kerak.
              Chipta olish yopiq: tugma yo'q, faqat ko'rgazma. */}
          {soon.length > 0 && (
            <div>
              <div className="oyk-rail-head">
                <div className="oyk-rail-title">🎁 Dastur mukofotlari</div>
                <div className="oyk-rail-sub">{vitrina.prizes.reduce((s, p) => s + p.limit, 0)} ta karta</div>
              </div>
              <div className="oyk-rail">
                {soon.map((p) => (
                  <div key={p.key} className="oyk-pcard">
                    <div className="oyk-pcard-icon">
                      {p.photoUrl && !badPhoto.has(p.key)
                        ? <img src={p.photoUrl} alt="" loading="lazy" onError={() => markBadPhoto(p.key)} />
                        : p.icon}
                    </div>
                    <div className="oyk-pcard-name">{p.name}</div>
                    <div className="oyk-pcard-meta">{p.price} ball · {p.limit} dona</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button type="button" className="oyk-cta" onClick={() => void inviteFriend()}>
            <span className="oyk-cta-label">👥 Do'stni chaqirib qo'y — start birga bo'lsin</span>
            <span className="oyk-cta-shine" />
          </button>

          {/* 📋 Qoidalar SHU EKRANDA HAM ochilishi shart. Bu ekran erta `return` bilan
              chiqadi, ya'ni tepadagi "?" tugmasi ham, umumiy varaq konteyneri ham bu yerda
              yo'q — qoidalarga yagona yo'l aynan shu tugma. Huquqiy hujjat "mavsum faol
              bo'lsagina ko'rinadi" bo'lishi mumkin emas: odam qoidani mavsum boshlanishidan
              OLDIN o'qiydi. */}
          <button type="button" className="oyk-info-link" onClick={() => { haptic(); setSheet("rules"); }}>
            <span>📋 Dastur qoidalari</span>
            <span aria-hidden="true">›</span>
          </button>
        </div>

        {sheet === "rules" && (
          <RulesSheet
            season={state.season}
            prizes={vitrina.prizes}
            maxPerPrize={state.hints.maxPerPrize}
            onClose={() => setSheet(null)}
          />
        )}
      </div>
    );
  }

  // ⚠️ MAVSUM YAKUNI uchun avval bu yerda ERTA RETURN turardi va butun ekran bitta kartaga
  // almashardi: tab-qatori, Chiptalarim va "?" shundan KEYIN chizilardi, ya'ni chizilmasdi.
  // Natijada 600 ball to'lab chipta olgan odam AYNAN TIRAJ KUNI chiptasini ocha olmasdi —
  // §2 ning butun g'oyasi ("chipta qoladi va yig'iladi") eng kerakli kunida yo'qolardi.
  // Endi qobiq saqlanadi: yakun xulosasi — O'yin tabining kontenti, boshqa tablar tirik.
  const ended = phase === "ended";
  // 🔒 Tugma QULFI faqat SERVER aytgan fazadan. Klient hisoblagan `final48` bu yerda ATAYLAB
  // ishlatilmaydi: u qurilma soatidan chiqadi va soati oldinda ketgan telefonda mavsum faol
  // bo'la turib butun katalogni muzlatib qo'yardi (G7). `final48` endi faqat OGOHLANTIRISH.
  const locked = ended;
  // 🚕 Safarsiz mijoz chipta ola olmaydi (server sharti). Tugma buni OLDINDAN aytadi.
  const needsRide = state.seasonRides <= 0;

  const isNew = !ended && state.ball === 0 && state.ticketCount === 0;
  // 🎯 Maqsad-sovrin: mijoz tanlagani, tanlamagan bo'lsa eng arzoni. Hero SHUNGA qarab
  // chiziladi — "660 ball qoldi · Choy serviz" mavhum "340 ball" dan ancha kuchli.
  // ⚠️ Sotilib ketgan sovrin maqsad bo'lib qolsa hero abadiy "Ball yetdi — chiptani oling!"
  // deb turardi va bosilganda "o'rinlar tugadi" chiqardi; maqsadni almashtirish yo'li esa
  // o'sha kartada yashiringan edi (sold-out kartada tugma chizilmaydi). Endi tugagan sovrin
  // maqsad sifatida OLINMAYDI — hero avtomatik olinadigan eng arzoniga tushadi.
  // ⚠️ Oxirgi fallback (`…sort()[0]` — filtrsiz) OLIB TASHLANDI. U `!soldOut` filtridan KEYIN
  // turgani uchun hamma sovrin sotilib bo'lganda SOTILGAN sovrinni maqsad qilib olardi va
  // balans kartasi "Air Fryer · 340 ball qoldi" deb chizardi — yig'ib bo'lgach ham olib
  // bo'lmaydigan narsa. Bo'sh va'da ko'rsatgandan ko'ra element umuman bo'lmagani yaxshi
  // (DIZAYN_QOIDALARI #7): `cheapest === null` bo'lsa karta oddiy "N ball" ga tushadi.
  const goalPrize = vitrina.prizes.find((p) => p.key === state.goalPrizeKey && !p.soldOut);
  const cheapest =
    goalPrize ??
    // 🎯 Mijoz maqsad tanlamagan bo'lsa — STANDART sovrin (iPhone 17 Pro), u ochiq bo'lsa.
    vitrina.prizes.find((p) => p.key === OYIN_DEFAULT_GOAL_KEY && !p.soldOut) ??
    [...vitrina.prizes].filter((p) => !p.soldOut).sort((a, b) => a.price - b.price)[0] ??
    null;
  // 🔒 2026-08-14 (ega talabi: "keyingi navbatdagilarni biroz qo'sh, chiroy uchun") — bosh
  // ekranga kichik "keyingi" qatori. Faqat 3 ta, faqat rasm+nom (bosilmaydi — Sovg'alar
  // tabiga o'tish uchun pastdagi tab ishlatiladi, bu yerda faqat ko'z-quvonchi).
  const nextUp = [...vitrina.prizes]
    .filter((p) => !p.soldOut && p.key !== cheapest?.key)
    .sort((a, b) => a.price - b.price)
    .slice(0, 3);

  // 🚦 O'lchangan tanqislik (YAKUNIY DIZAYN §6): tanqislik HAQIQAT bo'lgandagina ko'rsatiladi.
  // ≥50% — rangsiz · 20–50% — kahrabo · <20% — qizil. Sabab: lotereya + qizil bosim mahalliy
  // bozorda "aldov ilova" tuyg'usini beradi; kam ishlatilgan qizilga esa ishonishadi.
  const leftRatio = (p: OyinPrizeView) => (p.soldOut || p.limit <= 0 ? 1 : p.remaining / p.limit);
  // ⚠️ Bir ekranda ENG KO'PI BITTA qizil — eng tanqisi qizil, qolganlari kahraboga tushadi.
  // Aks holda uchala kartada ham qizil chiqib, hech biri o'qilmay qoladi (maket v2 xatosi).
  const hotKey = [...vitrina.prizes]
    .filter((p) => !p.soldOut && p.limit > 0 && leftRatio(p) < 0.2)
    .sort((a, b) => leftRatio(a) - leftRatio(b))[0]?.key ?? null;
  // ⚠️ 2026-08-06 (mustaqil tekshiruv topdi): `locked` (mavsum tugagan) holatda xarid tugmasi
  // allaqachon qizil "🔒 Yopildi" (`.oyk-vbtn.is-frozen`) bo'lib turadi — shu ustiga yana qizil
  // "🔥 tugayapti" belgisi qo'shilsa, bitta kartada IKKI qizil chiqib qolardi ("bir ekranda
  // bitta qizil" qoidasini buzardi). Yopiq bo'lgach shoshilish ma'nosiz — badge yashiriladi.
  const scarcity = (p: OyinPrizeView): "none" | "warn" | "hot" => {
    if (locked || p.soldOut || p.limit <= 0) return "none";
    const left = leftRatio(p);
    if (left < 0.2) return p.key === hotKey ? "hot" : "warn";
    return left < 0.5 ? "warn" : "none";
  };

  // 📅→🎴 `drawDateText` va `drawTime` OLIB TASHLANDI (ega qarori 2026-08-19: «mukofot kuni
  // kartalar to'lishiga bog'liq, aniq kun aytish kerak emas»). Ular mavsum tugash sanasini
  // "mukofot kuni" deb ko'rsatardi — sovrin esa kartalari to'lgandagina o'ynaydi, ya'ni sana
  // hech narsani kafolatlamasdi. Endi ekranlar SHARTNI aytadi (hero, chipta, karta ledgeri).

  const setGoal = async (p: OyinPrizeView) => {
    haptic();
    setGoalBusyKey(p.key);
    try {
      await api.oyinGoal(p.key);
      showToast(`🎯 Maqsad: ${p.name}`);
      loadHome();
    } catch { showToast("Maqsadni saqlab bo'lmadi"); }
    finally { setGoalBusyKey((k) => (k === p.key ? null : k)); }
  };
  const buyPrize = vitrina.prizes.find((p) => p.key === buyKey) ?? null;
  const activeFriend = jamoam?.friends.find((f) => f.status === "active_today" && f.gainToday > 0) ?? null;

  return (
    <div className="oyk">
      <div className="oyk-scroll">
        {/* Sarlavha — ega maketi 2026-08-03: avatar + brend + qo'ng'iroq.
            ⚠️ REYTING BUTUNLAY OLIB TASHLANDI (ega qarori): u ball QOLDIG'I bo'yicha
            saralanardi, ya'ni chipta olgan odamning o'rni TUSHARDI — to'g'ri xatti-harakat
            jazolanardi. Hech bir ekranda o'rin haqida gap qolmadi. */}
        {/* 🗑 Sarlavha ("BirJoy" logotip+nom+mavsum) va "?"/"🔔" tugmalari OLIB TASHLANDI
            (ega talabi 2026-08-13: "BirJoy ? va qo'ng'iroqchalarni ol — boshqa hammasidan
            ortiqchalik qiladi"). Chiqish yo'li BUNGA bog'liq emas — o'yin ekranida ilova
            menyusi chizilmaydi, orqaga qaytish Telegram BackButton orqali (yuqorida
            `useBackButton`, App.tsx:520-522). "?" ichidagi 4 havola (Qanday ishlaydi/
            Gashtak nima/Sodiqlik kartasi nima/Qoidalar) HAMMASI boshqa joydan alohida
            reachable: "Qanday ishlaydi" — Dastur tabidagi tiraj-banner tugmasidan, "Gashtak
            nima" — Jamoam tabidagi o'z havolasidan (:1761), "Qoidalar" — Mukofotlar tabidan.
            "🔔" (ball tarixi) FAQAT shu yerda edi — funksiyasi yo'qolmasin deb "Ball
            yig'ish" varag'iga ko'chirildi (pastda, `sheet === "earn"`). */}

        {/* ⚠️ Matn "yopildi" degan QAT'IY da'vodan ogohlantirishga o'tkazildi. Sabab: bu faza
            qurilma soatidan hisoblanadi va soati oldinda ketgan telefonda noto'g'ri chiqadi —
            "yopildi" deb yozib, tugmani ochiq qoldirish esa ochiq ziddiyat bo'lardi. Haqiqiy
            qulfni server qo'yadi va o'z matnini qaytaradi (`final_lock`). */}
        {phase === "final48" && (
          <div className="oyk-final-banner">
            ⏳ <b>Dastur davri tugashiga 48 soatdan kam qoldi.</b> Karta olish shu oraliqda yopiladi — kechiktirmang.
            {state.ticketCount > 0 && <> Kartalaringiz "Kartalarim" bo'limida turibdi.</>}
          </div>
        )}

        {tab === "home" && (
          <>
            {ended ? (
              /* 🏁 MAVSUM YAKUNI — endi ERTA RETURN emas, O'yin tabining kontenti.
                 Tab-qatori, Chiptalarim va "?" tirik qoladi (tiraj kuni chipta kerak bo'ladi). */
              /* Ega qarori 2026-08-03: mavsum oxirida ball TANGAGA AYLANMAYDI.
                 ⚠️ 2026-08-06: bu yerdagi matn avval "ball davr bilan kuyadi" derdi — bu Qoidalar
                 §11 bilan ZID edi (ball 6 OY HARAKATSIZLIKDA so'nadi, mavsum bilan emas). Endi
                 ikkalasi bir xil haqiqatni aytadi.
                 ⚠️ Avval bu blok `.oyk-hero` (sarg'ish) sinflarini ishlatardi — ular MEHMON-teaser
                 ekraniga ham tegishli. Natijada ikkita ekran bir-birini qulflab turardi va yakun
                 kartasi uy tabining yangi TO'Q uslubidan yiroqda, eski sarg'ish bo'lib qolgandi.
                 Endi yakunning O'Z sinflari bor (.oyk-fin*) — teaser tegilmagan. */
              <div className="oyk-fin">
                <div className="oyk-fin-label">🏁 DASTUR DAVRI YAKUNLANDI</div>
                <div className="oyk-fin-title">
                  {state.ticketCount > 0 ? "Kartalaringiz mukofot kunida" : "Bu davr tugadi"}
                </div>
                <div className="oyk-fin-card">
                  <div className="oyk-fin-row"><span>Kartalaringiz</span><b>{state.ticketCount} ta</b></div>
                  <div className="oyk-fin-row"><span>Sarflanmagan ball</span><b>{state.ball}</b></div>
                </div>
                {/* 🔴 O1 — TUZATILDI (2026-08-12). Bu ekran aynan mavsum TUGAGANDA ko'rinadi —
                    ya'ni sarflanmagan ball allaqachon yopiq (karta olish 48 soat oldin
                    to'xtagan). «Muddatga bog'liq emas, hisobingizda turadi» deyish shu
                    lahzada eng katta yolg'on edi. Endi haqiqat aytiladi, lekin ayblovsiz:
                    sabab tizimniki (mavsum qoidasi), mijoznики emas. */}
                <div className="oyk-fin-sub">
                  {state.ball > 0
                    ? <>Bu mavsumdagi <b>{state.ball} ball</b> mavsum bilan yopildi.{state.ticketCount > 0 ? " Kartalaringiz esa saqlanadi — ular mukofot kunida omad kutadi." : " Yangi mavsum boshlanganda hisob yana noldan yuguradi."}</>
                    : state.ticketCount > 0
                      ? <>Kartalaringiz saqlanadi — ular mukofot kunida omad kutadi.</>
                      : <>Keyingi mukofot kuni sanasi e'lon qilinganda shu yerda ko'rinadi.</>}
                </div>
              </div>
            ) : (
              /* ── EGA MAKETI 2026-08-03: ikkita karta ──────────────────────────────────
                 1) Binafsha — TIRAJ SANASI (sovg'alar shu kuni topshiriladi, sana yonadi)
                 2) Sarg'ish — BALANS va chiptagacha qolgan yo'l
                 Maqsad-hero, sovrin raili, JONLI lenta va haftalik zanjir OLIB TASHLANDI —
                 ega: "o'yin uy tabida sovrinlar ham, haftalik vazifa ham, jonli ham kerak emas". */
              <>
                <div className="oyk-draw">
                  {/* 📅→🎴 EGA QARORI 2026-08-19: «mukofot kuni kartalar to'lishiga bog'liq va
                      aniq kun aytish kerak emas». Avval bu yerda mavsum tugash SANASI turardi —
                      u yolg'on va'da edi: sovrin faqat kartalari to'lganda o'ynaydi
                      (`willDraw = sold >= minSell`), sana esa hech narsani kafolatlamasdi.
                      Endi QOIDA aytiladi + mavsum bo'yicha HAQIQIY to'lish soni (`soldTotal`/
                      `capacityTotal` — allaqachon keladi, yangi so'rov yo'q). */}
                  <div className="oyk-draw-h">KARTALAR TO'LGANDA MUKOFOT!</div>
                  <div className="oyk-draw-k">Har sovrin o'z kartalari to'lishi bilan jonli efirda o'ynaladi</div>
                  {state.capacityTotal > 0 && (
                    <div className="oyk-draw-d">{state.soldTotal} / {state.capacityTotal} KARTA</div>
                  )}
                  {/* 🗑 Statik 5-qatorli "how" varag'i O'RNIGA endi story ochiladi (ega talabi
                      2026-08-13: "bosilgandan o'zimizni story ko'rinishi chiqishi kerak") —
                      birinchi kirishda avtomatik ko'rsatiladigan HAQIQIY story (`OyinStory`,
                      `onboard` holati) qayta ishlatiladi, ikkinchi quruq nusxa qurilmaydi. */}
                  <button type="button" className="oyk-draw-btn" onClick={() => { haptic(); setOnboard(0); }}>
                    Qanday ishlaydi? <span aria-hidden="true">›</span>
                  </button>
                  <span className="oyk-draw-gift" aria-hidden="true"><Icon name="gift" filled size={78} /></span>
                </div>

                {/* 🪙 MAQSAD-HERO — 2026-08-13 qayta chizildi (ega rasmi bilan): katta sarlavha
                    "{sovrin} yutib olishga N ball qoldi!" endi bosh gap (avval kichik chipga
                    tushirilgan edi), rangli "gap" zonasida, sovrin fotosi kattaroq. Pastki oq
                    zonada progress + son — formulasiz (ega talabi: "= 1 ta karta" gapi yo'q). */}
                <div className="oyk-goalc">
                  {cheapest ? (
                    <>
                      <div className="oyk-goalc-hero">
                        <div className="oyk-goalc-side">
                          <div className="oyk-goalc-eyebrow"><Icon name="gift" size={13} /> Sovrin</div>
                          <h3 className="oyk-goalc-headline">
                            {cheapest.price - state.ball > 0
                              ? <>{cheapest.name} yutib olishga <b>{cheapest.price - state.ball} ball</b> qoldi!</>
                              : <>{cheapest.name} uchun ball yetdi — karta oling!</>}
                          </h3>
                        </div>
                        <div className="oyk-goalc-img">
                          {cheapest.photoUrl && !badPhoto.has(cheapest.key)
                            ? <img src={cheapest.photoUrl} alt="" loading="lazy" onError={() => markBadPhoto(cheapest.key)} />
                            : <span>{cheapest.icon}</span>}
                        </div>
                      </div>
                      <div className="oyk-goalc-lower">
                        <div className="oyk-goalc-bar">
                          <span style={{ transform: `scaleX(${Math.min(1, state.ball / cheapest.price)})` }} />
                        </div>
                        <div className="oyk-goalc-meta">
                          <span><b>{state.ball}</b> / {cheapest.price} ball</span>
                          <span>{Math.min(100, Math.round((state.ball / cheapest.price) * 100))}%</span>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="oyk-goalc-num"><b>{state.ball}</b> <span>ball</span></div>
                  )}
                </div>

                {/* 🎯 (ega talabi 2026-08-12: "bitta ekran — bitta savolga javob"). Avval shu
                    joyda o'ninchi qatorgacha (harakatlar/kunlik halqa/topshiriq/hikoya/uy-ekrani/
                    maslahat/tezyo'l/kartalar) bitta zumda turardi — endi HAMMASI "earn" varag'iga
                    ko'chdi, bosh ekranda faqat BITTA aniq keyingi qadam qoladi. */}
                <button type="button" className="oyk-sheet-ok is-hero" style={{ marginTop: 12 }} onClick={() => { haptic(); setSheet("earn"); }}>
                  Ball yig'ish <span aria-hidden="true">→</span>
                </button>

                {nextUp.length > 0 && (
                  <div className="oyk-next">
                    <div className="oyk-next-lbl">Keyingi navbatdagilar</div>
                    <div className="oyk-next-row">
                      {/* 🔴 F1 (2026-08-16 audit): avval faqat KO'RSATARDI, bosilganda hech
                          narsa bo'lmasdi. Endi Mukofotlar tabiga o'tkazadi (DIZAYN_QOIDALARI:
                          yozuv harakat va'da qilsa — tugma; kartaning o'zi ko'rinishi harakat
                          va'da qiladi). */}
                      {nextUp.map((p) => (
                        <button
                          key={p.key} type="button" className="oyk-next-card"
                          onClick={() => { haptic(); setTab("vitrina"); }}
                        >
                          <div className="oyk-next-ic">
                            {p.photoUrl && !badPhoto.has(p.key)
                              ? <img src={p.photoUrl} alt="" loading="lazy" onError={() => markBadPhoto(p.key)} />
                              : <span>{p.icon}</span>}
                          </div>
                          <div className="oyk-next-nm">{p.name}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ⛔ Kunlik halqa/topshiriq/hikoya/uy-ekrani-vazifasi/maslahat/tezyo'l/kartalar
                bu yerdan OLIB TASHLANDI (ega talabi 2026-08-12) — hammasi "earn" varag'iga
                ko'chdi (pastda, sheet bo'limida). "Mening kartalarim" havolasi ham olindi —
                pastki tab-qatorida allaqachon "Kartalarim" bor edi, ikkalasi bitta joyga
                olib borardi (ortiqcha yo'l). Bosh ekranda faqat ijtimoiy-isbot qatori qoladi. */}

            {!ended && activeFriend && (
              <div className="oyk-magnet">
                <div className="oyk-magnet-emoji">🔥</div>
                <div className="oyk-magnet-body">
                  <div className="oyk-magnet-title">{activeFriend.name} bugun {activeFriend.ridesToday > 1 ? `${activeFriend.ridesToday}-safarini` : "safarini"} qildi!</div>
                  <div className="oyk-magnet-sub">Sizga bugun <b>+{activeFriend.gainToday} ball</b> olib keldi</div>
                </div>
                <button
                  type="button"
                  className={`oyk-thanks${thanked.has(activeFriend.memberId) ? " is-done" : ""}`}
                  disabled={thanked.has(activeFriend.memberId)}
                  onClick={() => void sayThanks(activeFriend.memberId)}
                >{thanked.has(activeFriend.memberId) ? "✓ Aytildi" : "🤝 Rahmat ayt"}</button>
              </div>
            )}

          </>
        )}

        {tab === "vitrina" && (
          <>
            {/* 🗑 Sarlavha ("🎁 Mukofotlar"), "📅 MUKOFOT KUNI"+sana+balans va homiy-chizig'i
                OLIB TASHLANDI (ega talabi 2026-08-13: "ortiqcha yuzovlarni to'liq olib
                tashlash kerak... tepaga mukofotlar degan gap kerak emas, mukofot kuni ham").
                Uchalasi ham boshqa joyda BOR: "Mukofotlar" so'zi pastki tab-qatorida va
                global sarlavhada (mavsum nomi) allaqachon ko'rinadi; sana va balans Dastur
                tabidagi tiraj-banner/maqsad-hero'da; homiy — hech qayerda haqiqiy qiymat
                qo'shmasdi (faqat matn takrorlanardi). Endi tab to'g'ridan-to'g'ri harakatli
                qismdan (filtr+kartalar) boshlanadi. */}
            {vitrina.prizes.length === 0 && (
              <div className="oyk-j-report">Mukofotlar hozircha qo'yilmagan — tez orada paydo bo'ladi. Ball yig'ib turing, u yo'qolmaydi 🎁</div>
            )}
            {/* 🔎 FILTR (ega talabi 2026-08-12): «odamlarga sovg'alarni filtirlash oson
                bo'lsin — bir kartalik, ko'p kartalik, kam kartali, qimmat, arzon, yutilishiga
                kam qolganlari». Chiplar — karusel emas: karusel kontentning ko'p qismini
                yashiradi, chip esa yorliq (yashiringani arzon). */}
            <div className="oyk-fchips">
              {OYIN_PRIZE_FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className={`oyk-fchip${filter === f.id ? " is-on" : ""}`}
                  onClick={() => { haptic(); setFilter(f.id); }}
                >{f.label}</button>
              ))}
            </div>
            {/* ⚠️ Bo'sh natija — YOLG'ON bo'sh holat EMAS. «Sovg'a yo'q» deyish noto'g'ri
                bo'lardi: sovg'a bor, faqat filtr uni chiqarib tashladi. Sababni aytamiz va
                qaytish yo'lini beramiz (DIZAYN_QOIDALARI: yozuv harakat va'da qilsa — tugma). */}
            {/* 🔴 (ega talabi 2026-08-12: «arxiv o'ynab bo'lingan kartalar uchun emasmi» —
                to'g'ri edi). Avval bu yerda `!p.soldOut` edi — to'lgan-lekin-hali-tirajga-
                chiqmagan sovrin (eng qizig'i!) shu tobda yo'qolib, Arxivga tushib qolardi.
                Endi faqat HAQIQATDA o'ynalgan (`drawn`) sovrin chiqib ketadi. */}
            {oyinFilterPrizes(vitrina.prizes.filter((p) => !p.drawn), filter).length === 0
              && vitrina.prizes.some((p) => !p.drawn) && (
              <div className="oyk-fempty">
                Bu filtrga mos sovg'a yo'q.{" "}
                <button type="button" className="oyk-flink" onClick={() => { haptic(); setFilter("hammasi"); }}>Hammasini ko'rish</button>
              </div>
            )}
            {oyinFilterPrizes(vitrina.prizes.filter((p) => !p.drawn), filter).map((p) => {
              const affordable = !locked && state.ball >= p.price;
              const showPhoto = !!p.photoUrl && !badPhoto.has(p.key);
              const pCap = prizeCap(p.limit, state.hints.maxPerPrize);
              const atLimit = p.mine >= pCap;
              return (
                <div key={p.key} className={`oyk-vcard${p.soldOut ? " is-soldout" : ""}`}>
                  {/* ⚠️ Avval `onError` da `parentElement.remove()` turardi — u nafaqat rasmni,
                      balki uning ICHIDAGI sovrin NOMI va NARXINI ham o'chirardi (karta nomsiz
                      to'rtburchakka aylanardi) va React boshqaradigan tugunni tashqaridan
                      olib tashlardi. Endi holat React'da: rasm o'rniga rangli emoji-afisha. */}
                  {/* 🎴 Atom-boshli: rasm TOZA qahramon (ustida matn/qora-fade YO'Q — review topgan
                      shovqin olib tashlandi); nom+narx pastdagi oq «kamar»da. Progress endi
                      sold/limit (nechta olindi) — avval ball/price edi va «N dona» ostida inventar
                      deb o'qilardi. Affordability tugma matnida. `goalCount` — «N xohlaydi» konteksti. */}
                  <div className="oyk-vimg">
                    {showPhoto
                      ? <img src={p.photoUrl ?? ""} alt="" loading="lazy" onError={() => markBadPhoto(p.key)} />
                      : <span className="oyk-vimg-emoji">{p.icon}</span>}
                    {p.goalCount > 0 && <div className="oyk-vcard-goal">🎯 {p.goalCount} xohlaydi</div>}
                    <span className="oyk-atom-shine" />
                  </div>
                  <div className="oyk-vbelt">
                    <div className="oyk-vbelt-top">
                      <span className="oyk-atom-nm">{p.name}</span>
                      <span className="oyk-atom-ball">◆ {p.price} ball</span>
                    </div>
                    <div className="oyk-vprog"><i style={{ width: `${p.limit > 0 ? Math.min(100, (p.sold / p.limit) * 100) : 0}%` }} /></div>
                    <div className="oyk-vprog-lb">
                      <span>{p.sold} / {p.limit} karta olindi</span>
                      {state.goalPrizeKey === p.key && <span className="oyk-vgoalmine">🎯 Maqsadingiz</span>}
                    </div>
                  </div>
                  {/* 🗑 "Olingan/Qolgan/Sizda" qatori OLIB TASHLANDI (ega talabi 2026-08-13:
                      Mukofotlar kartasi soddalashtirilsin). Ikkalasi ham boshqa joyda bor:
                      "olingan/qolgan" progress-chiziqda ko'rinadi (va tanqislik chindan
                      muhim bo'lsa pastdagi 🚦 belgi orqali), "sizda N ta" esa pastdagi 💡
                      qatorida takrorlanardi — bir xil fakt ikki marta yozilardi. */}
                  {/* 🚦 Tanqislik faqat HAQIQAT bo'lganda ko'rsatiladi (§6): <20% qizil,
                      20-50% kahrabo, undan yuqorisi — rangsiz. */}
                  {scarcity(p) !== "none" && (
                    <div className={`oyk-scarce is-${scarcity(p)}`}>
                      {scarcity(p) === "hot" ? `🔥 ${p.remaining} ta qoldi — tugayapti` : `${p.remaining} ta qoldi`}
                    </div>
                  )}
                  {/* 🛡 TIRAJ SHARTI — xariddan OLDIN, ochiq. Sovrin chiptalarining ma'lum qismi
                      sotilmasa tirajda o'ynalmaydi (ega qarori 2026-08-03: busiz xarajat foizi
                      cheksiz bo'lardi — 133 chiptalik sovringa 5 ta sotilsa ham beriladi).
                      Bu shartni YASHIRISH ishonchni bir marta va butunlay buzadi: odam ball
                      sarflab chipta oladi, keyin "yetarli sotilmadi" degan gapni birinchi marta
                      eshitadi. Shuning uchun kartada, xarid varag'ida va chiptada turadi.
                      ⚠️ 2026-08-13: "✅ tayyor" tasdig'i OLIB TASHLANDI — bu OGOHLANTIRISH
                      emas, faqat quvonchli qo'shimcha edi, kartani band qilardi. Faqat HALI
                      YETARLI sotilmagan holat (haqiqiy ogohlantirish) qoladi. */}
                  {p.minSell > 0 && !p.willDraw && (
                    <div className="oyk-vcard-path">
                      🛡 Topshirilishi uchun {p.minSell} ta karta kerak — hozir {p.sold} ta
                    </div>
                  )}
                  {/* 🗑 "💡" holat-matni OLIB TASHLANDI (ega talabi 2026-08-13: "hintlar
                      ortiqcha"). Xuddi shu fakt pastdagi xarid tugmasining O'Z matnida
                      allaqachon bor edi ("🎟 Yana ol", "🎟 Karta ol", "N ball qoldi") —
                      bitta faktni ikki marta, ikki joyda aytish ortiqcha edi. */}
                  {/* Own-limit endi tugmaning O'ZIDA so'nuq «Limitga yetdingiz» bo'lib aytiladi
                      (review: avval matn taqiq derdi, tugma esa yashil «Yana ol» bo'lib chorlardi). */}
                  {/* 🎯 Asosiy harakat «Karta ol» BUTUN ENLIK — ierarxiya bir qarashda o'qiladi.
                      Ikkinchi darajali uchtasi (maqsad · kartalar · fikrlar) «⋯» menyusiga
                      yig'ildi (avval har kartada 4 tugma yonma-yon = «tugma devori»: 5 sovrin ×
                      4 = 20 tugma). Menyu bir vaqtda bittasi ochiladi (`menuKey`), amal
                      bajarilgach yopiladi. HAR amal saqlandi — faqat bir tap ortida.
                      🚕 `needsRide` tugmaning O'ZIDA aytiladi (server `no_ride` qaytaradi). */}
                  <div className="oyk-vcard-acts">
                    <button
                      type="button"
                      className={`oyk-vbtn${affordable && !p.soldOut && !needsRide && !atLimit ? " is-on" : ""}${p.soldOut || atLimit ? " is-soldout" : locked ? " is-frozen" : ""}`}
                      onClick={() => tapPrize(p)}
                    >
                      {p.soldOut ? "❌ O'rinlar tugadi"
                        : atLimit ? `⚖️ Bu sovrindan ${pCap} ta oldingiz — maksimum`
                        : locked ? "🔒 Yopildi"
                        : needsRide ? "🚕 Avval bitta safar qiling"
                        : p.mine > 0 ? `🎟 Yana ol — ${p.price} ball`
                        : affordable ? `🎟 Karta ol — ${p.price} ball`
                        : `⚡ Yana ${p.price - state.ball} ball kerak`}
                    </button>
                    <button
                      type="button" className="oyk-vmore"
                      aria-label="Boshqa amallar" aria-expanded={menuKey === p.key}
                      onClick={() => { haptic(); setMenuKey((k) => (k === p.key ? null : p.key)); }}
                    >⋯</button>
                  </div>
                  {menuKey === p.key && (
                    <div className="oyk-vmenu">
                      {/* 🎯 Maqsad — sovrin allaqachon maqsad bo'lsa inert tasdiq, aks holda belgilash.
                          To'lgan sovg'ada maqsad qo'yish yo'q (avvalgi qoida bilan bir xil). */}
                      {!p.soldOut && (
                        state.goalPrizeKey === p.key
                          ? <button type="button" className="is-current" disabled><Icon name="missions" filled size={17} /> Maqsadingiz ✓</button>
                          : <button type="button" disabled={goalBusyKey === p.key} onClick={() => { setMenuKey(null); void setGoal(p); }}><Icon name="missions" size={17} /> {goalBusyKey === p.key ? "…" : "Maqsad qilib belgilash"}</button>
                      )}
                      {/* 🎟 Kartalar panjarasi (egasi bor-yo'qligi — ijtimoiy isbot). To'lgan sovg'ada ham. */}
                      <button type="button" onClick={() => { setMenuKey(null); openCards(p); }}><Icon name="cards" size={17} /> Kartalarni ko'rish</button>
                      {/* 💬 K8 — sovg'a ostidagi ochiq komentariya (OYIN_KARTA_PLAN.md §13). */}
                      <button type="button" onClick={() => { setMenuKey(null); openComments(p); }}><Icon name="chat" size={17} /> Fikrlar</button>
                    </div>
                  )}
                </div>
              );
            })}
            {/* 🗂 ARXIV (ega talabi 2026-08-12, IKKI marta aniqlashtirilgan): «sovg'alar
                o'ynalganlari pastga tushib ketishi kerak — arxiv o'ynab bo'lingan kartalar
                uchun». Birinchi versiyada `soldOut` (o'rinlar tugadi) bilan aralashtirilgan
                edi — to'lgan-lekin-hali-tirajga-CHIQMAGAN sovrin arxivga yashiringan, aslida
                ENG QIZIG'I bo'lgani holda. To'g'ri signal — `drawn` (g'olib allaqachon
                yozilgan). Kartalari archivda ham ochiq qoladi: odam o'z kartasini va tiraj
                ro'yxatini ko'ra olishi shart. */}
            {vitrina.prizes.some((p) => p.drawn) && (
              <div className="oyk-arch">
                <button type="button" className="oyk-arch-h" onClick={() => { haptic(); setArchOpen((v) => !v); }} aria-expanded={archOpen}>
                  <span className="oyk-arch-t">🗂 Arxiv</span>
                  <span className="oyk-arch-n">{vitrina.prizes.filter((p) => p.drawn).length} ta</span>
                  <span className="oyk-arch-x" aria-hidden="true">{archOpen ? "▾" : "›"}</span>
                </button>
                {archOpen && vitrina.prizes.filter((p) => p.drawn).map((p) => (
                  <button key={p.key} type="button" className="oyk-arch-row" onClick={() => openCards(p)}>
                    <span className="oyk-arch-ico">{p.icon}</span>
                    <span className="oyk-arch-nm">
                      <b>{p.name}</b>
                      <small>{p.limit} ta karta{p.mine > 0 ? ` · sizda ${p.mine} ta` : ""}</small>
                    </span>
                    <span className="oyk-arch-go" aria-hidden="true">›</span>
                  </button>
                ))}
              </div>
            )}
            {/* 🗑 Bu blok OLIB TASHLANDI (ega talabi 2026-08-12: ortiqcha malumot qisqartirilsin).
                Sabab: shu tabning O'ZIDA tepada ("📅 MUKOFOT KUNI" + sana, :1674) allaqachon
                bor edi — pastda AYNAN o'sha faktni boshqacha so'z bilan qaytarardi. 48-soatlik
                qulf tafsiloti "📋 Dastur qoidalari" §6da ("Muddat tugashiga {lockH} soat
                qolganda...") to'liq saqlanadi — hech qanday ma'lumot yo'qolmadi, faqat
                takrorlanishi olib tashlandi. */}
            {/* 📋 Qoidalarga IKKINCHI yo'l (DIZAYN_QOIDALARI #4: har bo'limga kamida ikki
                kirish). Mijoz ballini AYNAN shu tabda sarflaydi — rasmiy shartlar shu qaror
                oldida qo'l ostida turishi kerak, "?" tugmasining ichida yashiringan emas. */}
            {/* 🏆 G'OLIBLAR TARIXI — ochiq, hamma uchun (ega talabi 2026-08-19). Bayonnoma
                abadiy saqlanadi (`oyin:winner:*`); avval faqat admin ko'rardi. */}
            <button type="button" className="oyk-info-link" onClick={openWinners}>
              <span>🏆 G'oliblar tarixi</span>
              <span aria-hidden="true">›</span>
            </button>
            <button type="button" className="oyk-info-link" onClick={() => { haptic(); setSheet("rules"); }}>
              <span>📋 Dastur qoidalari</span>
              <span aria-hidden="true">›</span>
            </button>
          </>
        )}

        {/* 🧭 Jamoam segmenti — Gashtak / Do'stlarim NAVBAT BILAN (kognitiv yuk kamaytirildi:
            avval ikki mustaqil tizim bitta tabda ustma-ust turardi). Mavsum tugagach gashtak
            yo'q — segment chizilmaydi, faqat Do'stlarim qoladi. */}
        {tab === "jamoam" && !ended && (
          <div className="oyk-jseg">
            <button type="button" className={`oyk-jseg-btn${jamoamView === "gashtak" ? " is-active" : ""}`} onClick={() => { haptic(); setJamoamView("gashtak"); }}>🤝 Gashtak</button>
            <button type="button" className={`oyk-jseg-btn${jamoamView === "friends" ? " is-active" : ""}`} onClick={() => { haptic(); setJamoamView("friends"); }}>🔗 Do'stlarim</button>
          </div>
        )}

        {/* 🤝 GAP-JAMOA — gashtak modeli. Segmentda "Gashtak" tanlanganda ko'rinadi (do'st-ro'yxatidan
            kuchliroq mexanika: jamoa umumiy ishlaydi, navbatchi oladi). Ball KO'CHIRILMAYDI. */}
        {tab === "jamoam" && !ended && jamoamView === "gashtak" && (
          <div className="oyk-jamoa">
            {jamoa === null ? (
              <div className="oyk-jamoa-empty">Yuklanmoqda…</div>
            ) : jamoa.jamoa ? (
              <>
                <div className="oyk-jamoa-head">
                  <div>
                    <div className="oyk-jamoa-name">🤝 {jamoa.jamoa.name}{jamoa.jamoa.isLeader && <span className="oyk-jamoa-crown">👑<small> siz boshliqsiz</small></span>}</div>
                    <div className="oyk-jamoa-code">Kod: <b>{jamoa.jamoa.code}</b> — do'stlaringizga yuboring</div>
                  </div>
                  <div className="oyk-jamoa-head-acts">
                    <button type="button" className="oyk-jamoa-copy" onClick={() => { haptic(); shareLink(jamoa.jamoa!.inviteLink, `🤝 «${jamoa.jamoa!.name}» gashtakiga qo'shiling — birga safar qilib navbat bilan ball yig'amiz!`); }}>Havola</button>
                    <button type="button" className="oyk-jamoa-copy is-ghost" onClick={() => { haptic(); void copyText(jamoa.jamoa!.code); showToast("Kod nusxalandi"); }}>Nusxa</button>
                  </div>
                </div>
                <div className={`oyk-jamoa-turn${jamoa.jamoa.isMine ? " is-mine" : ""}`}>
                  {jamoa.jamoa.turnNote ? (
                    // 🎯 Boshliq/admin ONGLI belgilagan (2026-08-05, ega talabi: "hammaga
                    // bilinishi kerak bugun shu uchun ball yig'ilmoqda deb") — bu HAR DOIM
                    // avtomatik navbat matnidan USTUN, chunki inson qarori.
                    <>🎯 Bugun ball <b>{jamoa.jamoa.members.find((m) => m.isNavbatchi)?.name ?? "—"}</b> uchun yig'ilmoqda — {jamoa.jamoa.turnNote}</>
                  ) : jamoa.jamoa.isMine ? (
                    <>🎯 <b>Hozir navbat sizda</b> — gashtak {jamoa.jamoa.ridesThisMonth} safar qildi, sizga <b>{jamoa.jamoa.navbatchiBall} ball</b></>
                  ) : (
                    <>Hozir navbat: <b>{jamoa.jamoa.members.find((m) => m.isNavbatchi)?.name ?? "—"}</b> · gashtak {jamoa.jamoa.ridesThisMonth} safar qildi</>
                  )}
                </div>
                {/* 🔴 F7 (2026-08-16 audit): gashtakda sovrin bilan bog'liqlik umuman yo'q edi —
                    a'zo "biz nimaga yig'yapmiz" javobini bilish uchun Mukofotlar tabiga o'tishi
                    kerak edi. Navbatchi O'Z maqsadini tanlagan bo'lsa (standart TAXMIN
                    QILINMAYDI), shu yerda rasmi bilan ko'rinadi — F3'dagi rasm-ko'rsatish
                    naqshi qayta ishlatiladi. */}
                {jamoa.jamoa.navbatchiGoal && (
                  <button type="button" className="oyk-jamoa-goal" onClick={() => { haptic(); setTab("vitrina"); }}>
                    <span className="oyk-jamoa-goal-ic">
                      {jamoa.jamoa.navbatchiGoal.photoUrl && !badPhoto.has(`jgoal${jamoa.jamoa.navbatchiGoal.key}`)
                        ? <img src={jamoa.jamoa.navbatchiGoal.photoUrl} alt="" loading="lazy" onError={() => markBadPhoto(`jgoal${jamoa.jamoa!.navbatchiGoal!.key}`)} />
                        : <span>{jamoa.jamoa.navbatchiGoal.icon}</span>}
                    </span>
                    <span className="oyk-jamoa-goal-tx"><b>{jamoa.jamoa.navbatchiGoal.name}</b>ga yig'ilmoqda</span>
                    <span className="oyk-jamoa-goal-go" aria-hidden="true">›</span>
                  </button>
                )}
                {/* 🎨 2026-08-14 (ega audit topgan bo'shliq: xom emoji 👑/🎯/✓/•/🧪 matn ichida,
                    badge yo'q edi — Jamoam ro'yxatidagi rangli avatar+belgi uslubi bu yerda
                    hali yo'q edi, ega buni "eskirib qolgan" deb topdi). `avatarClass` — Do'stlarim
                    ro'yxatida ALLAQACHON ishlatilgan funksiya, shu yerda ham ayni o'sha. */}
                <div className="oyk-jamoa-list">
                  {jamoa.jamoa.members.map((m) => (
                    <div key={m.memberId} className={`oyk-jamoa-row${m.isNavbatchi ? " is-turn" : ""}`}>
                      <div className={`oyk-avatar is-sm ${avatarClass(m.memberId)}`}>
                        {m.name[0] ?? "?"}
                        {m.isLeader && <span className="oyk-jamoa-crown-dot" aria-hidden="true">👑</span>}
                      </div>
                      <span className="oyk-jamoa-who">
                        {m.name}
                        {m.isNavbatchi ? <span className="oyk-jamoa-tag is-turn">🎯 navbatda</span>
                          : m.hadTurn && <span className="oyk-jamoa-tag is-done">✓ navbati o'tdi</span>}
                        {m.isTest && <span className="oyk-jamoa-tag">🧪 sinov</span>}
                      </span>
                      <span className="oyk-jamoa-rides">{m.ridesThisMonth} safar · {m.ballEarnedTotal} ball</span>
                      {jamoa.jamoa!.isLeader && !m.isLeader && (
                        <button type="button" className="oyk-jamoa-kick" disabled={jamoaBusy} aria-label={`${m.name}ni chiqarish`} title="Chiqarish" onClick={() => { void doGashtakKick(m.memberId); }}>✕</button>
                      )}
                    </div>
                  ))}
                </div>
                <div className="oyk-cert-teach">
                  <div className="oyk-cert-teach-li"><span className="oyk-cert-teach-em">🎯</span><span>Gashtakning umumiy safarlari <b>navbatdagi a'zoga</b> ball olib keladi — har safar <b>{jamoa.jamoa.ballPerRide} ball</b>, oyiga eng ko'pi {jamoa.jamoa.maxBall}.</span></div>
                  <div className="oyk-cert-teach-li"><span className="oyk-cert-teach-em">🔁</span><span>Boshliq «⚙️ Boshqarish»dan <b>istalgan payt</b> navbatni boshqa a'zoga o'tkaza oladi.</span></div>
                  {jamoa.jamoa.members.length < jamoa.minSize && (
                    <div className="oyk-cert-teach-li"><span className="oyk-cert-teach-em">👥</span><span>Gashtak {jamoa.minSize} kishidan boshlanadi — yana {jamoa.minSize - jamoa.jamoa.members.length} kishi qo'shilsin.</span></div>
                  )}
                </div>
                <div className="oyk-jamoa-foot">
                  {jamoa.jamoa.isLeader && (
                    <button type="button" className="oyk-jamoa-manage" disabled={jamoaBusy} onClick={() => { haptic(); setSheet("gashtak"); }}>⚙️ Boshqarish</button>
                  )}
                  <button type="button" className="oyk-jamoa-leave" disabled={jamoaBusy} onClick={() => { void doJamoa("leave"); }}>Gashtakdan chiqish</button>
                </div>
              </>
            ) : (
              // 🎨 Illyustratsiyali kirish-holati (2026-08-13, prototip "BirJoy — o'yin, barcha
              // ekranlar" g-hero naqshiga moslab): avval quruq sarlavha+matn edi. Funksiya BIR
              // HARFI o'zgarmagan (o'sha shart/handler/disabled) — faqat vizual o'ram yangilandi.
              <>
                <div className="oyk-gashtak-hero">
                  <div className="oyk-gashtak-illus" aria-hidden="true">
                    <span className="oyk-gashtak-av"><Icon name="user" size={16} /></span>
                    <span className="oyk-gashtak-av is-mid"><Icon name="friends" size={21} /></span>
                    <span className="oyk-gashtak-av"><Icon name="user" size={16} /></span>
                  </div>
                  <h3 className="oyk-gashtak-title">
                    {joinCode ? "Sizni gashtakka taklif qilishdi" : `${jamoa.minSize}–${jamoa.maxSize} kishilik gashtak tuzing`}
                  </h3>
                  <p className="oyk-gashtak-sub">
                    {joinCode
                      ? "Kodni tasdiqlab qo'shiling — gashtak birga safar qilib, boshliq belgilagan a'zoga ball yig'ib beradi."
                      : <>Boshliq istalgan payt <b>«kimga ball yig'amiz»ni belgilaydi</b> — gashtakning umumiy safarlari o'sha a'zoga ball olib keladi.</>}
                  </p>
                  <button type="button" className="oyk-info-link is-compact" onClick={() => { haptic(); setGashtakHelp(0); }}>
                    ❔ Qanday ishlaydi
                  </button>
                </div>
                {/* ⚠️ 2026-08-13 (ega IKKI MARTA topgan chalkashlik: "1111 nomli gashtagimga
                    qo'shila olmayapti", keyin qayta "gashtakga 1111 ulana olmadim") — bitta
                    umumiy input + pastdagi matn-hint YETARLI bo'lmadi: odam baribir nomni
                    "qo'shilish" maydoniga yozib ko'rardi. Endi IKKI FIZIK ALOHIDA maydon —
                    xato ehtimoli strukturaviy yo'q qilingan, hint SHART emas. */}
                {joinCode ? (
                  <div className="oyk-jamoa-acts">
                    <input className="oyk-jamoa-inp" value={jamoaInput} onChange={(e) => setJamoaInput(e.target.value)} placeholder="Kod" maxLength={40} />
                    <button type="button" className="oyk-jamoa-btn" disabled={jamoaBusy || jamoaInput.trim().length < 4} onClick={() => { void doJamoa("join", jamoaInput.trim()); }}>Qo'shilish</button>
                  </div>
                ) : (
                  <>
                    <div className="oyk-gashtak-group">
                      <div className="oyk-gashtak-group-lbl">🔑 Kodingiz bormi? — Qo'shilish</div>
                      <div className="oyk-jamoa-acts">
                        <input className="oyk-jamoa-inp" value={joinInput} onChange={(e) => setJoinInput(e.target.value)} placeholder="6 belgili kod (masalan: AB3XQ9)" maxLength={40} />
                        <button type="button" className="oyk-jamoa-btn" disabled={jamoaBusy || joinInput.trim().length < 4} onClick={() => { void doJamoa("join", joinInput.trim()); }}>Qo'shilish</button>
                      </div>
                      <div className="oyk-gashtak-hint">
                        Kod boshliqning "⚙️ Boshqarish → Havola/Nusxa" tugmasidan chiqadi —
                        gashtak <b>nomi</b> emas, faqat shu 6 belgili kod ishlaydi.
                      </div>
                    </div>
                    <div className="oyk-gashtak-div"><span>yoki</span></div>
                    <div className="oyk-gashtak-group">
                      <div className="oyk-gashtak-group-lbl">➕ Yangisini tuzasizmi?</div>
                      <div className="oyk-jamoa-acts">
                        <input className="oyk-jamoa-inp" value={jamoaInput} onChange={(e) => setJamoaInput(e.target.value)} placeholder="Gashtak nomi" maxLength={40} />
                        <button type="button" className="oyk-jamoa-btn is-ghost" disabled={jamoaBusy || jamoaInput.trim().length < 2} onClick={() => { void doJamoa("create", jamoaInput.trim()); }}>Tuzish</button>
                      </div>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        )}

        {/* 🎟 CHIPTALARIM — endi tab. Chipta "ko'rinadigan buyum" (YAKUNIY DIZAYN §2):
            global noyob raqam, sovrin, tiraj sanasi va holati. */}
        {tab === "tickets" && (
          <>
            {/* 🗑 "🎟 Kartalarim" sarlavhasi OLIB TASHLANDI 2026-08-13 — Mukofotlar tabida
                qo'llangan qoidaning O'ZI (pastki tab-qatorida "Kartalarim" allaqachon bor,
                sarlavha shu so'zni ikkinchi marta aytardi). Jami son endi pastdagi
                "Jami N ta karta" qatorida bir marta ko'rinadi. */}
            {ticketsErr ? (
              /* Tarmoq xatosi — "chiptangiz yo'q" DEMAYDI (G8). Mijozning 600 balli evaziga
                 olingan chiptasi bor bo'lishi mumkin; bizda esa shunchaki javob yo'q. */
              <div className="oyk-load-err">
                <div className="oyk-load-err-tx">Kartalarni yuklab bo'lmadi — bu ro'yxat yo'q degani EMAS, shunchaki aloqa uzildi.</div>
                <button type="button" className="oyk-load-err-btn" onClick={() => { haptic(); loadTickets(); }}>🔄 Qayta urinish</button>
              </div>
            ) : !tickets ? (
              /* Skeleton — real chiptaning NUSXASI (DIZAYN_QOIDALARI #11): binafsha koreshok +
                 oq tana + 42px rasm-kvadrat. Avval bitta 122px kulrang to'rtburchak edi va
                 balandligi ham noto'g'ri o'lchangan: real chipta 131px (koreshok 67 + tana 62 +
                 2px ramka) — yuklanganda sahifa har chiptada 9px sakrardi. Endi balandlik
                 real karta bilan BIR XIL formuladan chiqadi (o'sha padding, o'sha o'lchamlar). */
              <>{[0, 1].map((i) => (
                <div key={i} className="oyk-tkt is-skel" aria-hidden="true">
                  <div className="oyk-tkt-stub">
                    <div className="oyk-tkt-brand">&nbsp;</div>
                    <div className="oyk-tkt-no">&nbsp;</div>
                  </div>
                  <div className="oyk-tkt-body">
                    <div className="oyk-tkt-pic" />
                    <div className="oyk-tkt-info">
                      <div className="oyk-tkt-prize">&nbsp;</div>
                      <div className="oyk-tkt-when">&nbsp;</div>
                    </div>
                  </div>
                </div>
              ))}</>
            ) : tickets.tickets.length === 0 ? (
              <>
                <div className="oyk-j-report">
                  {ended
                    ? "Bu davrda sodiqlik kartasi olmagansiz. Keyingi davr sanasi e'lon qilinganda shu yerda ko'rinadi."
                    : <>Hali kartangiz yo'q.{cheapest ? ` ${cheapest.price} ball yig'ing — birinchi kartangizni oling!` : ""}</>}
                </div>
                {!ended && (
                  <button type="button" className="oyk-cta" onClick={() => { haptic(); setTab("vitrina"); }}>
                    <span className="oyk-cta-label">🎁 Mukofotlarni ko'rish</span>
                    <span className="oyk-cta-shine" />
                  </button>
                )}
              </>
            ) : (
              <>
                {tickets.tickets.map((t) => (
                  // 🎟 K1 (OYIN_KARTA_PLAN.md §12.1, ega talabi 2026-08-13: "kartalarim
                  // bo'limiga kartaga bosib bo'lsin, uning malumotlari chiqsin"). Panjaradagi
                  // BIR XIL `openCard` qayta ishlatiladi — yangi ekran/so'rov yo'q.
                  <div
                    key={`${t.prizeKey}-${t.gno}`} className={`oyk-tkt is-tappable${t.test ? " is-test" : ""}`}
                    role="button" tabIndex={0}
                    onClick={() => openCard(t.gno)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openCard(t.gno); } }}
                  >
                    <div className="oyk-tkt-stub">
                      {/* 🧪 TEST chipta OCHIQ belgilanadi. Yashirilsa ega o'z sinov chiptasini
                          haqiqiy deb o'ylab tirajni kutardi va "nega yutmadim" savoli javobsiz
                          qolardi (DIZAYN_QOIDALARI: ekran yolg'on va'da bermaydi). */}
                      <div className="oyk-tkt-brand">{t.test ? "🧪 TEST KARTA — QATNASHMAYDI" : "BIRJOY SODIQLIK KARTASI"}</div>
                      {/* 🔐 K1 (2026-08-14): ko'rinadigan raqam endi haqiqiy `gno` emas, uning
                          Feistel+Luhn kodi — o'zi uzunroq, shuning uchun yon-tomondagi TAKROR
                          raqam (avval `.oyk-tkt-side`, tor tik chiziqda) olib tashlandi — bitta
                          joyda bir marta yetarli. */}
                      <div className="oyk-tkt-no">{t.code}</div>
                    </div>
                    <div className="oyk-tkt-body">
                      {/* Sovrin RASMI chiptada — ma'lumot serverdan kelardi va tashlab
                          yuborilardi. "Jismoniy narsa = real rasm" (DIZAYN_QOIDALARI #10):
                          yig'iladigan buyum kulrang matn qatori bo'lib qolmasin. */}
                      <div className="oyk-tkt-pic">
                        {t.photoUrl && !badPhoto.has(`t${t.gno}`)
                          ? <img src={t.photoUrl} alt="" loading="lazy" onError={() => markBadPhoto(`t${t.gno}`)} />
                          : <span>{t.prizeIcon}</span>}
                      </div>
                      <div className="oyk-tkt-info">
                        <div className="oyk-tkt-prize">{t.prizeName}</div>
                        {/* 📅→🎴 Sana O'RNIGA holat (ega qarori 2026-08-19): chipta o'z
                            sovrinining `willDraw` ini biladi — «to'ldi» yoki «to'layapti».
                            Bitta qator, balandlik o'zgarmadi (skeleton #11 bilan mos). */}
                        <div className="oyk-tkt-when">{t.willDraw ? "Kartalar to'ldi — o'ynashga tayyor" : "Kartalar to'lgach o'ynaydi"}</div>
                      </div>
                      {/* ⚠️ 2026-08-14 (ega audit topgan teshik): `result` maydoni 2026-08-12 dan
                          beri serverdan kelib turardi (`t.result`), lekin bu yerda HECH QACHON
                          o'qilmasdi — g'olib chiqqan mijoz ham har doim "TUGADI" ko'rardi, karta
                          detaliga alohida kirmasa bilmasdi. Endi natija ustuvor: karta sahifasidagi
                          BIR XIL uch holat (o'yinda/yutdi/o'ynadi) shu yerda ham. */}
                      <span className={`oyk-tkt-badge${t.result === "won" ? " is-won" : t.result === "lost" ? " is-lost" : ended ? " is-done" : ""}`}>
                        {t.result === "won" ? "🏆 Yutdi" : t.result === "lost" ? "O'ynadi" : ended ? "TUGADI" : "KUCHDA"}
                      </span>
                    </div>
                    {/* 🎟 2026-08-06 (ega qarori): FAQAT hozircha chegaraga yetmagan (tirajga
                        tayyor EMAS) sovrindan bekor qilish mumkin — ball "abadiy band" bo'lib
                        qolmasin. G'olib bo'lishi mumkin kartani bekor qilish TAQIQ.
                        🔒 2026-08-12: + faqat OLINGANIGA soatdan kam bo'lsa (OYIN_CANCEL_WINDOW_MS
                        — faqat barmoq xatosi uchun). Aks holda karta «sarflangan», qaytmaydi —
                        aks holda yangi sovg'a ochilganda eski sovg'alar hech qachon to'lmasdi. */}
                    {!t.willDraw && !t.test && !ended && Date.now() - Date.parse(t.at) <= OYIN_CANCEL_WINDOW_MS && (
                      <button
                        type="button" className="oyk-tkt-cancel"
                        disabled={cancellingGno === t.gno}
                        onClick={(e) => { e.stopPropagation(); void cancelTicket(t.gno); }}
                      >
                        <span className="oyk-tkt-cancel-x" aria-hidden="true">{cancellingGno === t.gno ? "…" : "✕"}</span>
                        Endigina oldingiz — bekor qilish (ball qaytadi)
                      </button>
                    )}
                  </div>
                ))}
                <div className="oyk-note-violet">
                  {ended
                    ? <>Jami <b>{tickets.tickets.length} ta</b> karta mukofot kunida qatnashdi. Mukofot egalari Telegram kanalimizda e'lon qilinadi.</>
                    : <>Jami <b>{tickets.tickets.length} ta</b> karta. Qancha karta ko'p bo'lsa, imkoniyat shuncha yuqori.</>}
                </div>
              </>
            )}
          </>
        )}

        {tab === "jamoam" && (ended || jamoamView === "friends") && (
          <>
            {/* Gashtak (jamoaviy) va Do'stlarim (shaxsiy takliflar) endi SEGMENT orqali
                ajratilgan (yuqorida) — ustma-ust turmaydi, shuning uchun avvalgi bo'luvchi
                chiziq va "nega ikki xil ro'yxat bor" chalkashligi yo'q (R21/R17 hal qilindi). */}
            <div className="oyk-j-title">🔗 Do'stlarim <span className="oyk-j-count">({jamoam?.friends.length ?? "…"})</span></div>
            <div className="oyk-j-sub">Sizning shaxsiy taklifingiz orqali qo'shilganlar — Gashtakdan mustaqil.</div>
            {jamoamErr ? (
              /* Tarmoq xatosi ≠ "do'stingiz yo'q" (G8) */
              <div className="oyk-load-err">
                <div className="oyk-load-err-tx">Do'stlaringizni yuklab bo'lmadi — bu do'stlaringiz yo'q degani EMAS, shunchaki aloqa uzildi.</div>
                <button type="button" className="oyk-load-err-btn" onClick={() => { haptic(); loadJamoam(); }}>🔄 Qayta urinish</button>
              </div>
            ) : !jamoam ? (
              /* Skeleton — real ro'yxatning nusxasi (DIZAYN_QOIDALARI #11): avval bitta 104px
                 kartaga o'xshash blok turardi, kelgani esa 58px lik do'st qatorlari edi. */
              <div className="oyk-friends">
                {[0, 1, 2].map((i) => <div key={i} className="oyk-friend is-skel" aria-hidden="true" />)}
              </div>
            ) : jamoam.friends.length === 0 ? (
              <>
                <div className="oyk-j-report">Hali hech kimni taklif qilmagansiz. Do'st chaqirsangiz, shu yerda ular bilan bog'liq voqealarni ko'rasiz.</div>
                {/* Bo'sh holatda ham CHIQISH YO'LI bo'lsin — "hech kim yo'q" deyish yetarli emas,
                    "nima bosaman?" savoliga javob kerak (3 soniya testi). */}
                <button type="button" className="oyk-cta" onClick={() => void inviteFriend()}>
                  <span className="oyk-cta-label">👥 Birinchi do'stni chaqirish</span>
                  <span className="oyk-cta-shine" />
                </button>
              </>
            ) : (
              <div className="oyk-friends">
                {(friendsExpanded ? jamoam.friends : jamoam.friends.slice(0, FRIENDS_PAGE)).map((f) => (
                  <div key={f.memberId} className="oyk-friend">
                    {/* Rang a'zo raqamidan — avval hammaga `oyk-av-0` qotirilgan edi. */}
                    <div className={`oyk-avatar ${avatarClass(f.memberId)}`}>{f.name[0] ?? "?"}</div>
                    <div className="oyk-friend-body">
                      <div className="oyk-friend-name">{f.name}</div>
                      <div className={`oyk-friend-status${f.status === "active_today" ? " is-active" : ""}`}>
                        {f.status === "active_today"
                          ? <>✅ bugun yurdi{f.gainToday > 0 && <b className="oyk-friend-gain"> +{f.gainToday} ball</b>}</>
                          : f.status === "never_rode" ? "hali safar qilmadi"
                          : `💤 ${f.daysSilent} kun jim`}
                      </div>
                      {/* Jami olib kelgan ball — "aktiv/aktivmasligi" statusidan tashqari,
                          ega qanchalik foydali do'st ekanini ko'rishni so'ragan (2026-08-06). */}
                      {f.totalBallFromMe > 0 && (
                        <div className="oyk-friend-total">Jami olib kelgan: <b>{f.totalBallFromMe} ball</b></div>
                      )}
                    </div>
                    {/* ⚠️ HAR QATORDA TUGMA (DIZAYN_QOIDALARI #14). Avval faqat "bugun yurgan" va
                        "5+ kun jim" do'stlarda tugma bor edi: "hali safar qilmadi" va 0–4 kun jim
                        turganlar — ya'ni AYNAN turtki kerak bo'lganlar — bosiladigan joysiz o'lik
                        qator bo'lib turardi. Endi har holatning o'z harakati bor va matni ham
                        o'sha holatga yozilgan (birinchi safar chaqirig'i ≠ qaytish chaqirig'i). */}
                    {f.status === "active_today" ? (
                      <button
                        type="button"
                        className={`oyk-thanks${thanked.has(f.memberId) ? " is-done" : ""}`}
                        disabled={thanked.has(f.memberId)}
                        onClick={() => void sayThanks(f.memberId)}
                      >{thanked.has(f.memberId) ? "✓" : "🤝 Rahmat"}</button>
                    ) : f.status === "never_rode" ? (
                      <button
                        type="button" className="oyk-wake"
                        onClick={() => nudgeFriend(f, `${f.name}, birinchi safaringni qil — 1067 (BirJoy)dan foydalansang menga sovg'a berishadi 🚕🎁`)}
                      >🚕 Turtki</button>
                    ) : (
                      <button
                        type="button" className="oyk-wake"
                        onClick={() => nudgeFriend(f, `${f.name}, yur birga — 1067 (BirJoy)dan foydalansang menga sovg'a berishadi 🎁`)}
                      >⏰ Uyg'ot</button>
                    )}
                  </div>
                ))}
                {!friendsExpanded && jamoam.friends.length > FRIENDS_PAGE && (
                  <button type="button" className="oyk-info-link" onClick={() => { haptic(); setFriendsExpanded(true); }}>
                    <span>Yana {jamoam.friends.length - FRIENDS_PAGE} ta ko'rsatish</span>
                    <span aria-hidden="true">›</span>
                  </button>
                )}
              </div>
            )}
            {/* IKKITA SUMMA ALOHIDA (YAKUNIY DIZAYN §7). Bitta yig'indi o'yinning asosiy
                g'oyasini yashiradi: bir martalik bonus TUGAYDI, do'st safaridan keladigan oqim
                esa TUGAMAYDI. Mijoz shu farqni raqamda ko'rmasa "do'st chaqirish" bir martalik
                ish bo'lib tuyuladi — aslida butun iqtisod ikkinchi ustunga tayanadi. */}
            {/* IKKI SUMMA — lekin endi ixcham (2 qator, avval 3 edi). §7 saqlanadi: OQIM ("do'st
                safaridan") o'z qatorida ajralib turadi — asosiy g'oya shu (bir martalik bonus
                TUGAYDI, oqim TUGAMAYDI). Bir martalik bonus jami qatorining kichik izohida
                ko'rsatiladi — raqam yo'qolmaydi, faqat alohida qator band qilmaydi. */}
            {jamoam && jamoam.friends.length > 0 && (
              <div className="oyk-jsum">
                <div className="oyk-jsum-row is-flow">
                  <span className="oyk-jsum-lb">🔁 Do'stlar safaridan<small>cheksiz oqim — ular yurgani sari o'sadi</small></span>
                  <b>+{jamoam.rideBall}</b>
                </div>
                <div className="oyk-jsum-row is-total">
                  <span className="oyk-jsum-lb">{jamoam.friends.length} do'stdan jami<small>bir martalik +{jamoam.oneTimeBall} ball ham ichida</small></span>
                  <b>+{jamoam.totalBall} ball</b>
                </div>
              </div>
            )}
            <div className="oyk-j-hint">💡 <b>Ko'p taksi chaqiradigan</b> tanishingizni chaqiring — u sizga eng ko'p ball olib keladi</div>
            {/* ⚠️ Bu yerda IKKITA ulashish tugmasi yonma-yon turardi: "👥 Do'stimga yubor"
                (`inviteFriend`, ball bermaydi) va "📤 Sovrinni ulashish (bugungi bonus)"
                (`doShareBonus`, ball beradi). Ikkalasi ham AYNAN bir xil Telegram ulashish
                oynasini ochardi — mijoz farqni ko'ra olmasdi va ballsizini bosib ballni yo'qotardi.
                Endi bitta tugma bor va u ROSTINI aytadi: bugungi bonus olinmagan bo'lsa
                "+N ball", olingan bo'lsa oddiy chaqiruv. */}
            <div className="oyk-qr">
              <div className="oyk-qr-text">
                {state.ticketCount > 0
                  ? <>Men BirJoy sodiqlik dasturida <b>{state.ticketCount} ta karta</b> to'pladim. Sen ham qo'shil! 🎁</>
                  : <>Men BirJoy sodiqlik dasturidaman — sen ham qo'shil! 🎁</>}
              </div>
              {/* Mavsum tugagach bonus YO'Q — tugma ham, izoh ham buni aytadi (G5a). */}
              <button
                type="button" className="oyk-qr-btn"
                onClick={() => (ended || state.today.shared ? void inviteFriend() : void doShareBonus())}
              >
                {ended || state.today.shared || state.hints.shareBall <= 0
                  ? "👥 Do'stimga yubor"
                  : `📤 Ulashish — +${state.hints.shareBall} ball`}
              </button>
              <button
                type="button" className="oyk-wake"
                onClick={async () => { const r = await api.referral().catch(() => null); if (r) { await copyText(r.link); showToast("🔗 Havola nusxalandi!"); } }}
              >🔗 Havolani nusxalash</button>
              <div className="oyk-qr-note">
                {ended
                  ? <>Dastur davri yakunlandi — <b>ball berilmaydi</b>, lekin do'stingiz keyingi davrga ulguradi</>
                  : state.today.shared
                    ? <>Bugungi ulashish bonusi olindi ✓ — <b>ertaga yana</b> bo'ladi</>
                    : <>Ulashish boni <b>kuniga bir marta</b> beriladi</>}
              </div>
            </div>

            {/* 📸 Hikoya-poster — HIKOYA_POSTER_PLAN.md. Ball admin tasdig'idan keyin tushadi.
                ⚠️ `!ended` sharti QO'SHILDI: mavsum tugagach ham blok chizilardi, mijoz poster
                yasab, hikoyasiga qo'yib, havolasini yuborardi — server esa `season_off`
                qaytarardi. Ya'ni ekran bajarib bo'lmaydigan ishga chaqirardi (G5b). */}
            {/* 📸 Hikoya-poster — default YIG'ILGAN (kognitiv yuk: 20 rasm panjarasi + 2 URL
                maydoni Jamoam tabini juda cho'zardi). Yig'ilganda bitta qator; "Hikoya qo'y"
                bosilganda to'liq forma ochiladi. Limit/tekshiruv holatlarida forma yo'q —
                shuning uchun ular oddiy karta bo'lib qolaveradi. `ref` tashqi o'ramda —
                earn-varag'idan `goToStory` shu yerga scroll qiladi (poster ochilgan holda). */}
            {!ended && state.story.ballEach > 0 && (
              <div ref={storyAnchorRef}>
                {state.story.approved >= state.story.limit ? (
                  <div className="oyk-poster">
                    <div className="oyk-poster-head">
                      <span className="oyk-poster-title">📸 Hikoya qo'y — <b>+{state.story.ballEach} ball</b></span>
                      <span className="oyk-poster-count">{state.story.approved}/{state.story.limit}</span>
                    </div>
                    <div className="oyk-poster-note">✅ Bu davrda limitga yetdingiz — rahmat!</div>
                  </div>
                ) : state.story.pending ? (
                  <div className="oyk-poster">
                    <div className="oyk-poster-head">
                      <span className="oyk-poster-title">📸 Hikoya qo'y — <b>+{state.story.ballEach} ball</b></span>
                      <span className="oyk-poster-count">{state.story.approved}/{state.story.limit}</span>
                    </div>
                    <div className="oyk-poster-note">⏳ Tekshiruvda — 24 soat ichida javob beramiz</div>
                  </div>
                ) : !posterOpen ? (
                  <button type="button" className="oyk-poster-toggle" onClick={() => { haptic(); setPosterOpen(true); }}>
                    <span className="oyk-poster-toggle-ic" aria-hidden="true">📸</span>
                    <span className="oyk-poster-toggle-tx">
                      <b>Hikoya qo'y — +{state.story.ballEach} ball</b>
                      <small>{state.story.approved}/{state.story.limit} · bosing → poster tanlang</small>
                    </span>
                    <span className="oyk-poster-toggle-go" aria-hidden="true">›</span>
                  </button>
                ) : (
                  <div className="oyk-poster">
                    <div className="oyk-poster-head">
                      <span className="oyk-poster-title">📸 Hikoya qo'y — <b>+{state.story.ballEach} ball</b></span>
                      <button type="button" className="oyk-poster-x" onClick={() => { haptic(); setPosterOpen(false); }} aria-label="Yig'ish">▾</button>
                    </div>
                    <div className="oyk-poster-note">
                      Posterni yuklab oling, hikoyangizga qo'ying va havolasini shu yerga tashlang. Tekshirgach ball tushadi.
                    </div>
                    {state.story.lastRejectReason && (
                      <div className="oyk-poster-reject">⛔ Oxirgi urinish rad etildi: {state.story.lastRejectReason}</div>
                    )}
                    {/* 🖼 2026-08-05: 20 ta TAYYOR statik rasm (ega bergan asl dizaynlar) —
                        hech narsa generatsiya qilinmaydi, shunchaki tanlanadi va ko'rsatiladi. */}
                    <div className="oyk-poster-grid">
                      {state.story.posters.map((url) => (
                        <button
                          key={url} type="button"
                          className={`oyk-poster-thumb${selectedPoster === url ? " is-on" : ""}`}
                          onClick={() => pickPoster(url)}
                        >
                          <img src={url} alt="" loading="lazy" />
                        </button>
                      ))}
                    </div>
                    {selectedPoster && (
                      <div className="oyk-poster-preview">
                        <img src={selectedPoster} alt="Poster" className="oyk-poster-preview-img" />
                        <div className="oyk-poster-preview-hint">👆 Rasmni bosib turing → "Rasmni saqlash", so'ng hikoyangizga qo'ying</div>
                        <button type="button" className="oyk-poster-chip" onClick={closePosterPreview}>Yopish</button>
                      </div>
                    )}
                    {/* 🖼 2026-08-05: ikkita ALOHIDA, aniq nomlangan maydon — mijoz "bu yerga
                        qaysi havola" deb chalkashmasin (ega talabi). Ikkalasi ham xuddi shu
                        `submitStory`ga boradi — server ikkalasini ham qabul qiladi. */}
                    <div className="oyk-poster-link-row">
                      <span className="oyk-poster-link-label">📷 Instagram</span>
                      <input
                        className="oyk-poster-input" type="url"
                        value={igUrl} onChange={(e) => setIgUrl(e.target.value)}
                        placeholder="instagram.com/stories/…"
                      />
                      <button
                        type="button" className="oyk-poster-btn ghost sm"
                        disabled={!igUrl.trim() || posterBusy}
                        onClick={() => void submitStory(igUrl, () => setIgUrl(""))}
                      >Yuborish</button>
                    </div>
                    <div className="oyk-poster-link-row">
                      <span className="oyk-poster-link-label">✈️ Telegram</span>
                      <input
                        className="oyk-poster-input" type="url"
                        value={tgUrl} onChange={(e) => setTgUrl(e.target.value)}
                        placeholder="t.me/…"
                      />
                      <button
                        type="button" className="oyk-poster-btn ghost sm"
                        disabled={!tgUrl.trim() || posterBusy}
                        onClick={() => void submitStory(tgUrl, () => setTgUrl(""))}
                      >Yuborish</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* 🗑 "Dastur homiysi" chizig'i va pastki huquqiy eslatma OLIB TASHLANDI (ega talabi
            2026-08-13: "dastur homiysi degan narsalar umuman kerak emas... eng pasga
            yozilgan sodiqlik kartasi degan joyi [ham]"). HAR bir tabda (Dastur/Mukofotlar/
            Kartalarim/Jamoam) qattiq ko'rinardi — ortiqcha yuzov edi. Huquqiy matnning
            o'zi YO'QOLMAGAN: xuddi shu gap "?" — Savol-javob varag'ida ("Sodiqlik kartasi
            nima" bo'limi) va "📋 Dastur qoidalari"da to'liq saqlanadi. */}
      </div>

      <div className="oyk-tabs">
        {/* 🎟 "Chiptalarim" varaqdan TABGA chiqdi — chipta endi o'yinning asosiy obyekti
            (YAKUNIY DIZAYN §2), varaqda yashirib bo'lmaydi. */}
        {([["home", "games", "Dastur"], ["vitrina", "gift", "Mukofotlar"], ["tickets", "cards", "Kartalarim"], ["jamoam", "friends", "Jamoam"]] as const).map(([key, icon, label]) => (
          <button key={key} type="button" className={`oyk-tab${tab === key ? " is-active" : ""}`} onClick={() => { haptic(); setTab(key); }}>
            <span className="oyk-tab-icon"><Icon name={icon} filled={tab === key} size={21} /></span>
            <span className="oyk-tab-label">{label}</span>
          </button>
        ))}
      </div>

      {toast && <div className="oyk-toast">{toast}</div>}

      {/* 📋 Qoidalar O'Z scrim'i bilan keladi (RulesSheet) — shuning uchun umumiy
          konteynerdan chiqarib olingan. */}
      {sheet === "rules" && (
        <RulesSheet
          season={state.season}
          prizes={vitrina.prizes}
          maxPerPrize={state.hints.maxPerPrize}
          onClose={() => setSheet(null)}
        />
      )}

      {sheet && sheet !== "rules" && (
        <div className="oyk-scrim" onClick={() => { setSheet(null); setBuyKey(null); }}>
          <div className="oyk-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="oyk-sheet-grip" />

            {/* 🎟 KARTALAR PANJARASI — sovg'aning barcha o'rinlari. Bo'sh katak ham, band katak
                ham bosiladi (ega tuzatishi 2026-08-12: avval bo'sh katak `<span>` edi, umuman
                kirib bo'lmasdi). Band katak egasining ismi bilan. Ega qarori 2026-08-12:
                «oddiy telegram ismlari turishi yaxshi». */}
            {sheet === "cards" && (
              <>
                {/* 🎨 Sarlavha endi ODDIY MATN emas — sovg'aning o'zi (rasm/emoji) ko'rinadi,
                    DIZAYN_QOIDALARI #10 ("jismoniy narsa = real rasm"). Ega talabi 2026-08-12:
                    «kartalar tanlash joyi hali chiroyli emas». */}
                <div className="oyk-cards-head">
                  <div className="oyk-cards-ico">
                    {cardsPrize?.photoUrl ? <img src={cardsPrize.photoUrl} alt="" /> : <span>{cardsPrize?.icon ?? "🎟"}</span>}
                  </div>
                  <div className="oyk-cards-head-name">{cardsData ? cardsData.prizeName : (cardsPrize?.name ?? "Kartalar")}</div>
                </div>
                {cardsErr && (
                  <div className="oyk-cards-msg">
                    Kartalar ro'yxatini yuklab bo'lmadi — bu «karta yo'q» degani emas, aloqa uzildi.
                  </div>
                )}
                {!cardsErr && !cardsData && <div className="oyk-cards-grid is-skel">{Array.from({ length: 24 }).map((_, i) => <span key={i} className="oyk-cell is-skel" />)}</div>}
                {/* 🎴 EGALAR RO'YXATi — kinoteatr-panjara (oyk-cards-grid/oyk-cell) BEKOR: raqam
                    tanlanmasdi (xariddan keyin biriktiriladi), ya'ni «o'rindiq tanlash» yolg'on
                    affordans edi. Endi «kim olgani» ijtimoiy isbot sifatida qatorlarda ko'rinadi;
                    «Siz» tepaga qadaladi; bo'sh joylar — bitta CTA-karta (panjara emas). */}
                {cardsData && (() => {
                  const free = Math.max(0, cardsData.limit - cardsData.sold);
                  const mineCards = cardsData.cards.filter((c) => c.mine);
                  const others = cardsData.cards.filter((c) => c.ownerName !== null && !c.mine);
                  const shown = others.slice(0, 8);
                  return (
                    <>
                      <div className="oyk-coll-meter"><i style={{ width: `${cardsData.limit > 0 ? Math.min(100, (cardsData.sold / cardsData.limit) * 100) : 0}%` }} /></div>
                      <div className="oyk-coll-min">
                        {cardsData.sold} kishi karta oldi · {free} joy ochiq
                        {cardsData.minSell > 0 && !cardsData.willDraw ? ` · topshirilishi uchun yana ${Math.max(0, cardsData.minSell - cardsData.sold)} ta kerak` : ""}
                      </div>
                      {/* 🎴 ZAL — sovrinning BARCHA joylari. Egasi bor joy uning bosh harfi bilan
                          «to'lgan», bo'sh joy neytral nuqta. Raqam YO'Q (u xariddan keyin
                          biriktiriladi — ko'rsatish yolg'on tanlov taassurotini berardi).
                          Band joyga bosish → o'sha karta; bo'sh joyga bosish → karta olish. */}
                      <div className="oyk-hall">
                        {cardsData.cards.map((c) => (
                          <button
                            key={c.no} type="button"
                            className={`oyk-hdot${c.ownerName === null ? " is-free" : c.mine ? " is-mine" : ""}`}
                            style={c.ownerName !== null ? { background: `var(--oyk-av-${c.no % 5})` } : undefined}
                            title={c.ownerName ?? "Bo'sh joy"}
                            onClick={() => { if (c.gno != null) openCard(c.gno); else if (cardsPrize) tapPrize(cardsPrize); }}
                          >{c.ownerName ? (c.ownerName.trim()[0] ?? "?") : ""}</button>
                        ))}
                      </div>
                      <div className="oyk-hall-lg">
                        <span><i className="taken" />egasi bor</span>
                        <span><i className="mine" />meniki</span>
                        <span><i className="free" />bo'sh</span>
                      </div>
                      {mineCards.length > 0 && (
                        <button type="button" className="oyk-orow is-me" onClick={() => { const g = mineCards.find((c) => c.gno != null)?.gno; if (g != null) openCard(g); }}>
                          <span className={`oyk-avatar ${avatarClass(0)}`}>S</span>
                          <span className="oyk-orow-who"><b>Siz</b></span>
                          <span className="oyk-orow-mine">Meniki · {mineCards.length} ta</span>
                        </button>
                      )}
                      {shown.map((c) => (
                        <button key={c.no} type="button" className="oyk-orow" disabled={c.gno == null} onClick={() => { if (c.gno != null) openCard(c.gno); }}>
                          <span className={`oyk-avatar ${avatarClass(c.no)}`}>{(c.ownerName ?? "?").trim()[0] ?? "?"}</span>
                          <span className="oyk-orow-who">{c.ownerName}</span>
                          <span className="oyk-orow-sn">№{c.no}</span>
                        </button>
                      ))}
                      {others.length > shown.length && <div className="oyk-coll-more">Yana {others.length - shown.length} kishi oldi</div>}
                      {free > 0 && (
                        <div className="oyk-coll-cta">
                          <div className="oyk-coll-cta-tx"><b>{free} joy hali ochiq</b><small>Siz ham qo'shiling — ko'proq karta, ko'proq imkon</small></div>
                          {cardsPrize && <button type="button" onClick={() => tapPrize(cardsPrize)}>Karta ol</button>}
                        </div>
                      )}
                    </>
                  );
                })()}
                <button type="button" className="oyk-sheet-ok" onClick={() => setSheet(null)}>Yopish</button>
              </>
            )}

            {/* 🔎 BITTA KARTA — o'ziniki ham, BOSHQA odamniki ham. Telefon/familiya YO'Q.
                `emptySlotNo !== null` — bo'sh (hali sotilmagan) katak: haqiqiy `gno` yo'q
                (u faqat xariddan tug'iladi), shuning uchun server so'ralmaydi — faqat
                «bu joy bo'sh, olishga arziydi» ko'rsatiladi + to'g'ridan-to'g'ri xarid tugmasi
                (ega talabi 2026-08-12: «har bir karta yasalgan payt ham kirib ko'rib bo'lishi
                kerak, egasiz bo'lsa ham»). */}
            {sheet === "card" && (
              <>
                <div className="oyk-sheet-title">🎟 Karta</div>
                {emptySlotNo !== null ? (
                  <>
                    <div className="oyk-cert is-empty">
                      <div className="oyk-cert-stub">
                        <div className="oyk-cert-lbl">BirJoy karta</div>
                        <div className="oyk-cert-no">№ {emptySlotNo}</div>
                        {cardsPrize && <div className="oyk-cert-pz">{cardsPrize.icon} {cardsPrize.name}</div>}
                        <div className="oyk-cert-st">Hali bo'sh</div>
                      </div>
                    </div>
                    {/* Aniq shu raqam VA'DA QILINMAYDI — joylashtirish xarid tartibidan chiqadi,
                        oldindan qaysi raqam tegishi noma'lum (DIZAYN_QOIDALARI #9). */}
                    <div className="oyk-cert-teach">
                      <div className="oyk-cert-teach-li"><span className="oyk-cert-teach-em">📍</span><span>Bu joy hali egasiz. Karta olsangiz, bo'sh joylardan biri sizniki bo'ladi — qaysi raqam tegishi xariddan keyin ko'rinadi.</span></div>
                    </div>
                    {cardsPrize && (
                      <button type="button" className="oyk-sheet-ok" onClick={() => tapPrize(cardsPrize)}>
                        {cardsPrize.mine > 0 ? `🎟 Yana ol — ${cardsPrize.price} ball` : `🎟 Karta olish — ${cardsPrize.price} ball`}
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    {cardErr && <div className="oyk-cards-msg">Kartani yuklab bo'lmadi — aloqa uzildi.</div>}
                    {!cardErr && !cardData && <div className="oyk-cards-msg">Yuklanmoqda…</div>}
                    {cardData && (
                      <>
                        {/* 🎨 2026-08-14 (ega talabi: "karta juda xunik va kam malumot") — flat
                            bordered quti o'rniga Kartalarim'dagi violet-chipta uslubi qayta
                            ishlatildi (bir xil vizual til), pastida esa "bu karta nima
                            beradi/qachon o'ynaydi/keyin nima" o'rgatuvchi blok — avval umuman
                            yo'q edi. */}
                        {/* 🎴 KARTA-ATOMI (2× redizayn) — kvitansiya (oyk-cert stub+rows) o'rniga
                            hamma joydagi bir xil karta obyekti: toza rasm + oq kamar + oltin folga
                            (№{no}) + shine. To'liq kod pastdagi ledgerda. */}
                        <div className="oyk-atom is-lift oyk-atom-detail">
                          <div className="oyk-atom-img">
                            {cardData.photoUrl && !badPhoto.has(`cert${cardData.gno}`)
                              ? <img src={cardData.photoUrl} alt="" loading="lazy" onError={() => markBadPhoto(`cert${cardData.gno}`)} />
                              : <span>{cardData.prizeIcon}</span>}
                            <div className="oyk-atom-foil">№{cardData.no}</div>
                            <span className="oyk-atom-shine" />
                          </div>
                          <div className="oyk-atom-belt"><span className="oyk-atom-nm">{cardData.prizeName}</span></div>
                        </div>
                        <div className={`oyk-dstatus${cardData.result === "won" ? " is-won" : cardData.result === "lost" ? " is-lost" : ""}`}>
                          {cardData.result === "won" ? "🏆 Yutdi" : cardData.result === "lost" ? "O'ynadi" : "⏳ Mukofot kunini kutmoqda"}
                        </div>
                        {/* 🎴 «pass-orqa» ledger — kvitansiya (border-bottom chek-qatorlari) o'rniga
                            yengil hairline qatorlar. NaN qoidasi: ma'lumot bo'lmasa qator chizilmaydi. */}
                        <div className="oyk-ledger">
                          <div className="oyk-lrow"><span className="oyk-lrow-k">Sovrin</span><span className="oyk-lrow-v">{cardData.prizeName}</span></div>
                          <div className="oyk-lrow"><span className="oyk-lrow-k">Karta raqami</span><span className="oyk-lrow-v is-mono">{cardData.code}</span></div>
                          <div className="oyk-lrow">
                            <span className="oyk-lrow-k">Egasi</span>
                            {/* 👤 K4 — rasm faqat egasi rozilik bergan bo'lsa (server `ownerPhotoUrl`). */}
                            <span className="oyk-lrow-v">
                              {cardData.ownerPhotoUrl && <img src={cardData.ownerPhotoUrl} alt="" />}
                              {cardData.ownerName}{cardData.mine ? " (siz)" : ""}
                            </span>
                          </div>
                          {/* `uzDate` — `toLocaleDateString("uz-UZ")` ba'zi klientlarda «2026 M08 8» qaytaradi. */}
                          <div className="oyk-lrow"><span className="oyk-lrow-k">Olingan</span><span className="oyk-lrow-v">{uzDate(cardData.at)}</span></div>
                          {/* Sana emas — SHART (ega qarori 2026-08-19): sovrin kartalari to'lgach o'ynaydi. */}
                          <div className="oyk-lrow"><span className="oyk-lrow-k">Mukofot</span><span className="oyk-lrow-v">Kartalar to'lgach</span></div>
                        </div>
                        <div className="oyk-cert-teach is-flat">
                          <div className="oyk-cert-teach-li"><span className="oyk-cert-teach-em">🎟</span><span>Bu karta — <b>{cardData.prizeName}</b> uchun o'ynaydigan bitta joy.</span></div>
                          {/* ⚠️ Bu qator HAQIQAT bo'lgandagina chiziladi: sana yo'q bo'lsa umuman
                              yozilmaydi (bo'sh va'da bermaslik qoidasi). */}
                          {cardData.result === null && cardData.drawIso && (
                            <div className="oyk-cert-teach-li"><span className="oyk-cert-teach-em">📺</span><span>Sovrin <b>kartalari to'lgach</b>, Telegram jonli efirida o'ynaydi.</span></div>
                          )}
                          {cardData.result === null && (
                            <div className="oyk-cert-teach-li"><span className="oyk-cert-teach-em">🤝</span><span>Endigina olgan bo'lsangiz — qisqa vaqt ichida bekor qilib ballingizni qaytarib olishingiz mumkin (Kartalarim). Undan keyin karta akkauntingizga biriktiriladi — egasi o'zgartirilmaydi va qayta berilmaydi.</span></div>
                          )}
                          {cardData.result === "won" && (
                            <div className="oyk-cert-teach-li"><span className="oyk-cert-teach-em">🏆</span><span>Tabriklaymiz — bu karta g'olib chiqdi! Sovrinni olish uchun sizga bog'lanishadi.</span></div>
                          )}
                          {cardData.result === "lost" && (
                            <div className="oyk-cert-teach-li"><span className="oyk-cert-teach-em">🎟</span><span>Bu safar chiqmadi — lekin karta kolleksiyangizda saqlanib qoladi.</span></div>
                          )}
                        </div>
                        {/* 🗒 K2/K3 (2026-08-14, "karta=xotira") — faqat egasi tahrirlaydi.
                            Standart maxfiy: boshqa odam faqat `notePublic:true` bo'lsa ko'radi
                            (qaror serverda — getCardDetail, klient hech narsani yashirmaydi). */}
                        {cardData.mine ? (
                          <div className="oyk-note-edit">
                            <div className="oyk-note-edit-lbl">🗒 Sizning qaydingiz</div>
                            <textarea
                              className="oyk-note-edit-ta" value={noteText} maxLength={140} rows={2}
                              placeholder="Masalan: «BirJoydagi birinchi kartam ❤️» (ixtiyoriy)"
                              onChange={(e) => setNoteText(e.target.value)}
                            />
                            <div className="oyk-note-edit-row">
                              <button type="button" className={`oyk-note-priv${notePublic ? " is-on" : ""}`} onClick={() => { haptic(); setNotePublic((v) => !v); }}>
                                {notePublic ? "🌐 Hammaga ko'rinadi" : "🔒 Faqat siz ko'rasiz"}
                              </button>
                              <button type="button" className="oyk-note-save" disabled={noteBusy || noteText.trim() === (cardData.note ?? "") && notePublic === cardData.notePublic} onClick={() => void saveCardNote()}>
                                {noteBusy ? "…" : "Saqlash"}
                              </button>
                            </div>
                            {/* 👤 K4 — standart: faqat ism ko'rinadi. Rozilik bersangiz Telegram
                                profil-rasmingiz ham qo'shiladi (bu kartani ko'rgan har kimga). */}
                            <button type="button" className={`oyk-note-priv oyk-avatar-optin${cardData.avatarOptIn ? " is-on" : ""}`} disabled={avatarBusy} onClick={() => void toggleAvatarOptIn()}>
                              {avatarBusy ? "…" : cardData.avatarOptIn ? "👤 Rasmingiz ko'rinadi" : "👤 Rasmingizni ham ko'rsatish"}
                            </button>
                          </div>
                        ) : cardData.note && (
                          <div className="oyk-note-view">🗒 <b>{cardData.ownerName}</b>: «{cardData.note}»</div>
                        )}
                      </>
                    )}
                  </>
                )}
                <button
                  type="button"
                  className={`oyk-sheet-ok${emptySlotNo !== null && cardsPrize ? " is-ghost" : ""}`}
                  onClick={() => setSheet(null)}
                >Yopish</button>
              </>
            )}

            {/* 💬 K8 — sovg'a ostidagi ochiq komentariya (OYIN_KARTA_PLAN.md §13, ega tasdig'i
                2026-08-16: HAMMA yoza oladi). `.oyk-cards-head`/`.oyk-note-edit`/`.oyk-cards-msg`
                — yangi uslub o'ylab topilmadi, K1/K2/K3 bilan bir xil vizual til. */}
            {sheet === "comments" && (
              <>
                <div className="oyk-cards-head">
                  <div className="oyk-cards-ico">
                    {commentsPrize?.photoUrl ? <img src={commentsPrize.photoUrl} alt="" /> : <span>{commentsPrize?.icon ?? "💬"}</span>}
                  </div>
                  <div className="oyk-cards-head-name">{commentsPrize?.name ?? "Fikrlar"}</div>
                </div>
                {commentsErr && <div className="oyk-cards-msg">Fikrlarni yuklab bo'lmadi — aloqa uzildi.</div>}
                {!commentsErr && !commentsData && <div className="oyk-cards-msg">Yuklanmoqda…</div>}
                {commentsData && (
                  <>
                    {commentsData.banned ? (
                      <div className="oyk-cards-msg">Bu sovrinda yozish sizga yopilgan.</div>
                    ) : (
                      <div className="oyk-note-edit">
                        <textarea
                          className="oyk-note-edit-ta" value={commentText} maxLength={140} rows={2}
                          placeholder="Shu sovrin haqida fikringiz…"
                          onChange={(e) => setCommentText(e.target.value)}
                        />
                        <div className="oyk-note-edit-row">
                          <button
                            type="button" className="oyk-comment-send"
                            disabled={commentBusy || !commentText.trim() || commentText.trim() === (commentsData.myText ?? "")}
                            onClick={() => void saveComment()}
                          >{commentBusy ? "…" : commentsData.myText ? "Yangilash" : "Yuborish"}</button>
                        </div>
                      </div>
                    )}
                    {commentsData.comments.length === 0 ? (
                      <div className="oyk-cards-msg">Hali fikr yo'q — birinchi bo'ling.</div>
                    ) : (
                      <div className="oyk-comment-list">
                        {commentsData.comments.map((c) => (
                          <div key={c.id} className="oyk-comment-row">
                            <div className="oyk-comment-top">
                              <span className="oyk-comment-name">{c.authorName}{c.mine ? " (siz)" : ""}</span>
                              {c.mine
                                ? <button type="button" className="oyk-comment-flag" onClick={() => void deleteComment(c.id)}>O'chirish</button>
                                : <button type="button" className="oyk-comment-flag" onClick={() => void reportComment(c.id)}>🚩</button>}
                            </div>
                            <div className="oyk-comment-text">{c.text}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
                <button type="button" className="oyk-sheet-ok" onClick={() => setSheet(null)}>Yopish</button>
              </>
            )}

            {/* 🔔 QO'NG'IROQ — ball qayerdan kelgani. Reyting shu yerda edi va u ball
                QOLDIG'I bo'yicha saralanardi: chipta olgan odamning o'rni tushardi, ya'ni
                to'g'ri xatti-harakat jazolanardi (ega qarori — butunlay olib tashlandi). */}
            {/* 🗑 Statik "🎮 Qanday ishlaydi?" varaq (5 qatorli ro'yxat) OLIB TASHLANDI
                2026-08-13 — kirish tugmasi endi to'g'ridan-to'g'ri story'ni ochadi
                (`setOnboard(0)`, yuqorida `.oyk-draw-btn`). Ikkinchi, quruqroq nusxa
                saqlash shart emas edi — story xuddi shu 5 qadamni chiroyliroq aytadi. */}

            {/* 🎯 "Ball yig'ish" — bosh ekrandagi "→ Ball yig'ish" tugmasidan ochiladi
                (ega talabi 2026-08-12, progressiv-oshkoralik). Bu yerdagi HAR bir blok avval
                uy tabida bevosita turgan — funksiyalari (handler/shart) BIR HARFI ham
                o'zgarmagan, faqat endi bosh ekran emas, shu varaqning ichida. */}
            {/* ⚠️ `!ended` QO'RIG'I: bosh ekrandagi CTA `!ended` bo'lganda GINA chiziladi, shuning
                uchun odatda bu varaq ochilganda mavsum allaqachon faol. Lekin `sheet` holati
                `ended` bilan BOG'LANMAGAN — nazariy jihatdan mavsum SHU varaq OCHIQ turgan
                paytda tugashi mumkin (davriy `loadHome` yangilanishi). Eski kodda HAR blok o'z
                `!ended &&` qo'rig'iga ega edi — bu yerda BITTA qo'riq bilan bir xil natija. */}
            {sheet === "earn" && !ended && (
              <>
                <div className="oyk-sheet-title">🎯 Ball yig'ish</div>

                {/* 💡 Kunlik maslahat — birinchi safar kelgan mijozga xush kelibsiz, aks holda
                    kunlik-deterministik maslahat. Avval bosh ekranda doim ko'rinardi. */}
                <div className="oyk-hint">
                  <span className="oyk-hint-ic" aria-hidden="true">{isNew ? "👋" : dailyHint.icon}</span>
                  <span className="oyk-hint-tx">{isNew ? "Xush kelibsiz! Birinchi safaringizdan darhol ball tushadi — boshlash uchun taksi chaqiring." : dailyHint.text}</span>
                </div>

                {/* Ikkita asosiy harakat. "Safar qilish" XARITAGA kirgizadi (ega talabi). */}
                <div className="oyk-acts">
                  <button type="button" className="oyk-act is-ride" onClick={() => { haptic(); if (onTaxi) onTaxi(); else showToast("Taksi chaqirish — Uy ekranidan 🚕"); }}>
                    <span className="oyk-act-ic">🚕</span>
                    <b>Safar qilish</b>
                    <small>+{state.hints.rideBall} ball</small>
                  </button>
                  <button type="button" className="oyk-act is-invite" onClick={() => void inviteFriend()}>
                    <span className="oyk-act-ic">👥</span>
                    <b>Do'st chaqirish</b>
                    <small>+{state.hints.referFirstRideBall} ball</small>
                  </button>
                </div>

                {/* 🎯 Bugungi vazifalar — YAGONA ro'yxat. Avval 4 xil vidjet edi (kunlik-halqa +
                    topshiriq + hikoya + uy-ekran) — hammasi bir-biriga o'xshab ketardi, lekin har
                    biri alohida karta bo'lib varaqni cho'zardi. Endi bitta izchil ro'yxat + umumiy
                    progress. Manbalar va handlerlar BIR HARFI ham o'zgarmadi — faqat bir joyga
                    yig'ildi. `tap` bo'lgan qatorgina bosiladi; bajarilgan qatorlar tasdiq ko'rsatadi.
                    ⚠️ Hikoya = PROMO (server o'zi tekshira olmaydi): `done` yo'q, bosish hikoya
                    bo'limiga olib boradi (`goToStory`) — shuning uchun progress hisobiga
                    kirmaydi (`counts:false`), aks holda "N/M" hech qachon to'lmasdi. */}
                {(() => {
                  type EarnTask = { key: string; label: string; sub?: string; em?: string; done: boolean; gain: number; tap: (() => void) | null; counts: boolean };
                  const tasks: EarnTask[] = [
                    { key: "login", label: "Ilovaga kirish", done: state.today.login, gain: state.hints.loginBall, tap: null, counts: true },
                    { key: "ride", label: "1 safar qilish", done: state.today.rides > 0, gain: state.hints.rideBall, tap: onTaxi ? () => { haptic(); onTaxi(); } : null, counts: true },
                    { key: "share", label: "Do'stga ulashish", done: state.today.shared, gain: state.hints.shareBall, tap: state.today.shared ? null : () => void doShareBonus(), counts: true },
                  ];
                  if (state.quest && state.quest.ball > 0) {
                    tasks.push({ key: "quest", label: state.quest.title, sub: state.quest.done ? undefined : state.quest.hint, em: state.quest.icon, done: state.quest.done, gain: state.quest.ball, tap: null, counts: true });
                  }
                  if (state.story.ballEach > 0 && state.story.approved < state.story.limit) {
                    tasks.push({ key: "story", label: "Hikoya qo'ying", sub: state.story.pending ? "Yuborilgan — tekshiruvda" : "Instagram yoki Telegram", em: "📸", done: false, gain: state.story.ballEach, tap: goToStory, counts: false });
                  }
                  if ((homeAddable === true || state.homeTask.done) && state.homeTask.ball > 0) {
                    tasks.push({ key: "home", label: "Ilovani ekranga o'rnating", sub: state.homeTask.done ? undefined : "Bir bosishda — tezroq ochiladi", em: "🏠", done: state.homeTask.done, gain: state.homeTask.ball, tap: state.homeTask.done ? null : () => { haptic(); addToHomeScreen(); }, counts: true });
                  }
                  const counted = tasks.filter((t) => t.counts);
                  const doneCount = counted.filter((t) => t.done).length;
                  const pct = counted.length > 0 ? doneCount / counted.length : 0;
                  return (
                    <div className="oyk-tasks">
                      <div className="oyk-tasks-h">
                        <b>Bugungi vazifalar</b>
                        <span className="oyk-tasks-cnt">{doneCount}/{counted.length} bajarildi</span>
                      </div>
                      <div className="oyk-tasks-bar"><i style={{ transform: `scaleX(${pct})` }} /></div>
                      {tasks.map((t) => (
                        <button
                          key={t.key} type="button" disabled={t.done || !t.tap}
                          className={`oyk-task-row${t.done ? " is-done" : ""}${!t.done && t.tap ? " is-tappable" : ""}`}
                          onClick={t.tap ?? undefined}
                        >
                          <span className="oyk-task-ck" aria-hidden="true">{t.done ? "✔" : ""}</span>
                          <span className="oyk-task-lb">{t.em ? `${t.em} ` : ""}{t.label}{t.sub && <small>{t.sub}</small>}</span>
                          <span className="oyk-task-g">{t.done ? `✓ +${t.gain}` : `+${t.gain}`}</span>
                        </button>
                      ))}
                    </div>
                  );
                })()}

                {/* To'liq ro'yxat — barcha 10 ta manba, qiymat bo'yicha saralangan. Bu yerda
                    faqat "eng oson yo'llar" bor, chuqurroq qiziqqan mijoz shu yerdan o'tadi. */}
                <button type="button" className="oyk-bal-btn" onClick={() => { haptic(); setSheet("ball"); }}>
                  To'liq ro'yxatni ko'rish <span aria-hidden="true">›</span>
                </button>
                {/* 🔔 Ball tarixi — avval sarlavhadagi qo'ng'iroqcha tugmasi ochardi (olib
                    tashlandi, 2026-08-13). Funksiyasi shu yerga ko'chdi — `openBell` o'zgarishsiz. */}
                <button type="button" className="oyk-bal-btn" onClick={openBell}>
                  Ballingiz qayerdan keldi <span aria-hidden="true">›</span>
                </button>

                <button type="button" className="oyk-sheet-ok" onClick={() => { haptic(); setSheet(null); }}>Yopish</button>
              </>
            )}

            {/* 💡 "Ball qanday yig'iladi?" — jadval SHU YERGA ko'chirildi (ega qarori). */}
            {sheet === "ball" && (
              <>
                <div className="oyk-sheet-title">💡 Ball qanday yig'iladi?</div>
                <div className="oyk-ball">
              <div className="oyk-ball-list">
                {ballRows(state.hints).map((r) => (
                  <div key={r.label} className="oyk-ball-row">
                    <span className="oyk-ball-ic">{r.ic}</span>
                    <span className="oyk-ball-lb">{r.label}<small>{r.note}</small></span>
                    <span className="oyk-ball-num">+{r.ball}</span>
                  </div>
                ))}
              </div>
              {/* Yordam zanjiri ANIQ raqam bilan — bir martalik ulash-bonusi emas, DOIMIY oqim. */}
              {cheapest && state.hints.referRideBall > 0 && (
                <div className="oyk-ball-chain">
                  🤝 Do'stingiz har yurganda sizga <b>+{state.hints.referRideBall} ball</b> —{" "}
                  {Math.ceil(cheapest.price / state.hints.referRideBall)} ta do'st safari = 1 karta ({cheapest.name}).
                </div>
              )}
              {/* Doimiy qator (YAKUNIY DIZAYN §4). Ball hech qachon pulga aylanmaydi —
                  buni bir marta onboarding'da aytib qo'yish yetarli emas, doim ko'rinib tursin. */}
              {/* 🔴 O1 — TUZATILDI (2026-08-12). Avvalgi «6 oy harakatsiz» matni 2026-08-06 da
                  ham allaqachon eskirgan edi — o'sha o'zgarish sanani almashtirdi, sababni
                  emas. Haqiqat: ball 6 oylik FAOLSIZLIK bilan EMAS, MAVSUM bilan bog'liq
                  (2026-08-11 ega qarori, `computeBallMap`). Bu — RulesSheet 14-band bilan
                  BIR XIL manba, ikkalasi endi bir xil gapiradi. */}
              <div className="oyk-ball-warn">
                Ball pul emas — faqat sodiqlik kartasi olish uchun.<br />
                Ball shu mavsum ichida yashaydi: mavsum tugaganda hisob noldan boshlanadi —
                kartaga aylantirgan ballingiz esa saqlanadi.
              </div>
            </div>
                {/* Yopish tugmasi HAR varaqda. Avval faqat "Qanday ishlaydi"da bor edi —
                    qolganlarini yopish uchun tashqariga bosish yoki sudrash kerakligini
                    mijoz TAXMIN qilishi kerak edi (ko'rinadigan chiqish yo'li yo'q edi). */}
                <button type="button" className="oyk-sheet-ok" onClick={() => { haptic(); setSheet(null); }}>Yopish</button>
              </>
            )}

            {sheet === "bell" && (
              <>
                <div className="oyk-sheet-title">🔔 Ballingiz qayerdan keldi</div>
                {!bell ? (
                  <>{[0, 1, 2].map((i) => <div key={i} className="oyk-skel-block oyk-skel-bell" />)}</>
                ) : bell.rows.length === 0 ? (
                  <div className="oyk-note-violet">Hali voqea yo'q. Birinchi safaringizdan keyin shu yerda ko'rinadi 🚕</div>
                ) : (
                  <>
                    <div className="oyk-bell-list">
                      {bell.rows.map((r, i) => (
                        <div key={`${r.at}-${i}`} className="oyk-bell-row">
                          <span className="oyk-bell-ic">{actionEmoji(r.action)}</span>
                          <span className="oyk-bell-tx">
                            {/* Do'st ishtirok etgan voqealarda ISM EGA bo'ladi: "Amir safar qildi",
                                "Do'stingiz safar qildi · Amir" emas — ega shunday xohladi. */}
                            {r.helpedName
                              ? <><b>{r.helpedName}</b> {FRIEND_LABEL[r.action] ?? actionLabel(r.action)}</>
                              : actionLabel(r.action)}
                            {/* Vaqt ham ko'rsatiladi — bir kunda tushgan hamma ball "3-avgust"
                                bo'lib chiqsa, ro'yxatning ma'nosi yo'qoladi. */}
                            <small>{uzWhen(r.at)}</small>
                          </span>
                          <span className={`oyk-bell-b${r.ball < 0 ? " is-minus" : ""}`}>{r.ball > 0 ? `+${r.ball}` : r.ball}</span>
                        </div>
                      ))}
                    </div>
                    {/* Server sahifalab beradi (pageSize). Avval ro'yxat shu yerda jim tugardi va
                        eski voqeasini qidirayotgan odam "yo'qolibdi" deb o'ylardi. */}
                    {bell.total > bell.rows.length && (
                      <div className="oyk-sheet-foot">Oxirgi {bell.rows.length} ta voqea ko'rsatilgan (jami {bell.total} ta)</div>
                    )}
                  </>
                )}
                <button type="button" className="oyk-sheet-ok" onClick={() => { haptic(); setSheet(null); }}>Yopish</button>
              </>
            )}

            {/* 🏆 G'OLIBLAR TARIXI — har mijoz ko'radi. Server tozalangan ro'yxat beradi
                (telefon/memberId YO'Q). Xato ≠ bo'sh: aloqa uzilsa «g'olib yo'q» DEYILMAYDI. */}
            {sheet === "winners" && (
              <>
                <div className="oyk-sheet-title">🏆 G'oliblar tarixi</div>
                {winnersErr ? (
                  <div className="oyk-load-err">
                    <div className="oyk-load-err-tx">Ro'yxatni yuklab bo'lmadi — bu «g'olib yo'q» degani EMAS, aloqa uzildi.</div>
                    <button type="button" className="oyk-load-err-btn" onClick={openWinners}>🔄 Qayta urinish</button>
                  </div>
                ) : !winners ? (
                  <>{[0, 1, 2].map((i) => <div key={i} className="oyk-skel-block oyk-skel-bell" />)}</>
                ) : winners.length === 0 ? (
                  <div className="oyk-note-violet">Hali birorta mukofot o'ynalmagan. Birinchi mukofot kunidan keyin g'oliblar shu yerda — abadiy — saqlanadi 🏆</div>
                ) : (
                  <>
                    <div className="oyk-wlist">
                      {winners.map((w) => (
                        <div key={`${w.prizeKey}-${w.code}`} className="oyk-wrow">
                          <span className={`oyk-avatar ${avatarClass(w.poolSize + w.name.length)}`}>{w.name.trim()[0] ?? "?"}</span>
                          <span className="oyk-wrow-tx">
                            <b>{w.name}</b>
                            <small>{w.prizeName}</small>
                            <i>{uzDate(w.drawnAt)} · {w.poolSize} karta ichidan · {w.code}</i>
                          </span>
                          {w.handedAt
                            ? <span className="oyk-wrow-badge is-done">✅ Topshirilgan</span>
                            : <span className="oyk-wrow-badge">🏆 G'olib</span>}
                        </div>
                      ))}
                    </div>
                    <div className="oyk-buy-note">Har mukofot bayonnoma bilan yoziladi va bu ro'yxatdan hech qachon o'chirilmaydi — natija hamma uchun ochiq.</div>
                  </>
                )}
                <button type="button" className="oyk-sheet-ok" onClick={() => { haptic(); setSheet(null); }}>Yopish</button>
              </>
            )}

            {/* 👑 Gashtak boshqaruvi (2026-08-05, ega talabi) — faqat boshliqqa ko'rinadi
                (JSX qo'shilish joyida `isLeader` bilan qo'riqlangan). */}
            {sheet === "gashtak" && jamoa?.jamoa && (
              <>
                <div className="oyk-sheet-title">⚙️ Gashtak boshqaruvi</div>
                <button type="button" className="oyk-jamoa-btn" onClick={() => { haptic(); shareLink(jamoa.jamoa!.inviteLink, `🤝 «${jamoa.jamoa!.name}» gashtakiga qo'shiling — birga safar qilib navbat bilan ball yig'amiz!`); }}>
                  🔗 Havola ulashish
                </button>

                {/* Segmentlangan navigatsiya (2026-08-05, "qulayroq interfeys" so'ralgach) — admin
                    paneldagi OYIN_SECTIONS bilan bir xil naqsh: bitta vaqtda BITTA bo'lim ko'rinadi,
                    boshliq birinchi ochganda 5 ta bo'lim bir vaqtda cho'kib qolmaydi. */}
                <div className="oyk-gashtak-seg">
                  {([
                    ["ball", "🎯 Ball"], ["add", "🔍 Qo'shish"], ["message", "📢 Xabar"], ["settings", "⚙️ Sozlama"],
                  ] as const).map(([id, label]) => (
                    <button key={id} type="button" className={`oyk-gashtak-seg-btn${gashtakSheetTab === id ? " is-active" : ""}`} onClick={() => { haptic(); setGashtakSheetTab(id); }}>{label}</button>
                  ))}
                </div>

                {/* 🎯 "Kimga ball yig'amiz" (2026-08-05, ega talabi): boshliq ONGLI belgilaydi,
                    HAMMA a'zoga ko'rinadigan e'lon bo'lib chiqadi (asosiy banner). Avtomatik
                    navbat DEFAULT bo'lib qolaveradi — bu shunchaki e'lon qilish imkoni. */}
                {gashtakSheetTab === "ball" && (
                  <div className="oyk-gashtak-block">
                    <div className="oyk-gashtak-label">🎯 Kimga ball yig'amiz</div>
                    {/* ⚠️ 2026-08-14 (ega audit topgan bo'shliq): tuzilma (chip-tanlov) yaxshi
                        edi, lekin "bosilsa nima bo'ladi" hech qayerda aytilmagan edi. */}
                    <div className="oyk-cert-teach">
                      <div className="oyk-cert-teach-li"><span className="oyk-cert-teach-em">ℹ️</span><span>Kimni tanlasangiz, <b>shu paytdan e'tiboran</b> gashtakning har safari o'sha a'zoga ball olib keladi. Oldingi navbatchining to'plagan balli o'zida qoladi — yo'qolmaydi.</span></div>
                    </div>
                    <div className="oyk-chip-row">
                      {jamoa.jamoa.members.map((m) => (
                        <button key={m.memberId} type="button" className={`oyk-chip${gashtakTurnTarget === m.memberId ? " is-active" : ""}`} onClick={() => { haptic(); setGashtakTurnTarget(m.memberId); }}>
                          {m.isTest && "🧪 "}{m.name}{m.isTest && " (sinov)"}{m.isNavbatchi && " · navbatda"}
                        </button>
                      ))}
                    </div>
                    <input className="oyk-jamoa-inp" value={gashtakTurnNote} onChange={(e) => setGashtakTurnNote(e.target.value)} placeholder="Nima uchun (ixtiyoriy) — masalan «karta uchun»" maxLength={120} />
                    <button type="button" className="oyk-jamoa-btn" disabled={jamoaBusy || gashtakTurnTarget == null} onClick={() => { void doGashtakSetTurn(); }}>E'lon qilish</button>
                    {jamoa.jamoa.turnNote && (
                      <div className="oyk-note-violet">Joriy e'lon: {jamoa.jamoa.turnNote}</div>
                    )}
                  </div>
                )}

                {gashtakSheetTab === "add" && (
                  <div className="oyk-gashtak-block">
                    <div className="oyk-gashtak-label">🔍 Telefon bilan qo'shish</div>
                    <div className="oyk-jamoa-acts">
                      <input className="oyk-jamoa-inp" value={gashtakSearchPhone} onChange={(e) => setGashtakSearchPhone(e.target.value)} placeholder="+998 90 123 45 67" inputMode="tel" maxLength={20} />
                      <button type="button" className="oyk-jamoa-btn is-ghost" disabled={jamoaBusy} onClick={() => { void doGashtakSearch(); }}>Qidirish</button>
                    </div>
                    {gashtakHits && (
                      gashtakHits.length === 0 ? (
                        <div className="oyk-note-violet">Bu raqam bilan hech kim topilmadi — ehtimol hali BirJoy'da ro'yxatdan o'tmagan. Yuqoridagi havolani yuboring.</div>
                      ) : (
                        <div className="oyk-jamoa-list">
                          {gashtakHits.map((h) => (
                            <div key={h.memberId} className="oyk-jamoa-row">
                              <span className="oyk-jamoa-who">{h.name}</span>
                              {h.alreadyInGroup ? (
                                <span className="oyk-jamoa-rides">band — boshqa gashtakda</span>
                              ) : (
                                <button type="button" className="oyk-jamoa-copy" disabled={jamoaBusy} onClick={() => { void doGashtakAdd(h.memberId); }}>Qo'shish</button>
                              )}
                            </div>
                          ))}
                        </div>
                      )
                    )}
                  </div>
                )}

                {gashtakSheetTab === "message" && (
                  <div className="oyk-gashtak-block">
                    <div className="oyk-gashtak-label">📢 Xabar yuborish</div>
                    <div className="oyk-chip-row">
                      <button type="button" className={`oyk-chip${gashtakMsgTarget === "all" ? " is-active" : ""}`} onClick={() => { haptic(); setGashtakMsgTarget("all"); }}>👥 Hammaga</button>
                      {jamoa.jamoa.members.filter((m) => !m.isLeader).map((m) => (
                        <button key={m.memberId} type="button" className={`oyk-chip${gashtakMsgTarget === m.memberId ? " is-active" : ""}`} onClick={() => { haptic(); setGashtakMsgTarget(m.memberId); }}>{m.isTest && "🧪 "}{m.name}{m.isTest && " (sinov)"}</button>
                      ))}
                    </div>
                    <textarea className="oyk-gashtak-msg" value={gashtakMsgText} onChange={(e) => setGashtakMsgText(e.target.value)} placeholder="Masalan: bu oy yana 2 marta safar qilsak yetadi 🚕" maxLength={300} rows={3} />
                    <button type="button" className="oyk-jamoa-btn" disabled={jamoaBusy || !gashtakMsgText.trim() || gashtakMsgTarget == null} onClick={() => { void doGashtakMessage(); }}>Yuborish</button>
                  </div>
                )}

                {gashtakSheetTab === "settings" && (
                  <div className="oyk-gashtak-block">
                    <div className="oyk-gashtak-label">⚙️ Sozlama</div>
                    {/* ⚠️ 2026-08-14 (ega audit topgan bo'shliq): ikkala tugma ham qaytarib
                        bo'lmaydigan amal, lekin oqibat hech qayerda yozilmagan edi. */}
                    <div className="oyk-gashtak-danger-row">
                      <button type="button" className="oyk-jamoa-copy is-ghost" disabled={jamoaBusy} onClick={() => { void doGashtakRotate(); }}>🔄 Kodni yangilash</button>
                      <div className="oyk-gashtak-danger-note">Eski kod/havola darhol ishlamay qoladi — hali qo'shilmagan do'stlaringizga yangisini yuboring.</div>
                    </div>
                    <div className="oyk-gashtak-danger-row">
                      <button type="button" className="oyk-jamoa-leave" disabled={jamoaBusy} onClick={() => { void doGashtakDisband(); }}>🗑 Gashtakni tarqatish</button>
                      <div className="oyk-gashtak-danger-note">Barcha a'zolar chiqariladi. Bu qaytarib bo'lmaydi.</div>
                    </div>
                  </div>
                )}

                <button type="button" className="oyk-sheet-ok" onClick={() => { haptic(); setSheet(null); setGashtakHits(null); setGashtakSearchPhone(""); setGashtakMsgTarget(null); setGashtakMsgText(""); setGashtakSheetTab("ball"); }}>Yopish</button>
              </>
            )}

            {/* ❓ Ma'lumot to'plami (YAKUNIY DIZAYN §1) — TAB emas, lekin doim qo'l ostida.
                Avval bularning hammasi onboarding'da bir marta chiqib abadiy yo'qolardi;
                "chipta nima?" savoli esa xarid PAYTIDA, bir hafta o'tib tug'iladi. */}
            {/* 🗑 "❓ Savol-javob" hub OLIB TASHLANDI 2026-08-13 — kirish tugmasi ("?" sarlavhada)
                bilan birga. 4 havolaning barchasi mustaqil reachable: "Qanday ishlaydi" — Dastur
                tabi, "Gashtak nima" — Jamoam tabi, "Qoidalar" — Mukofotlar tabi; "Sodiqlik
                kartasi nima"/"Mukofot kuni nima" qisqa izohlari Qoidalar hujjatida (RulesSheet)
                to'liqroq shaklda mavjud. */}

            {/* 🎟 SOVRIN TAFSILOTI (YAKUNIY DIZAYN §7): katta rasm · o'lchangan tanqislik ·
                "Sizning ballingiz" · MIQDOR (max N) · "Xariddan keyin qoladi" · katta tugma ·
                IKKI QATORLI huquqiy izoh. Alohida ekran o'rniga shu varaq — bir bosish kam,
                mazmun bir xil (ega tasdiqlagan §7 tarkibi to'liq shu yerda). */}
            {sheet === "buy" && buyPrize && (() => {
              const maxQty = Math.max(1, Math.min(prizeCap(buyPrize.limit, state.hints.maxPerPrize) - buyPrize.mine, buyPrize.remaining, Math.floor(state.ball / buyPrize.price)));
              const qty = Math.min(buyQty, maxQty);
              const total = buyPrize.price * qty;
              const sc = scarcity(buyPrize);
              return (
              <>
                {/* ⚠️ 2026-08-14 (ega talabi: "karta olasizmi kerak emas, karta kirsin o'zi") —
                    savol-sarlavha ("...olasizmi?") o'rniga karta/sovrin nomining o'zi
                    ko'rsatiladi. Varaqning o'zi ALLAQACHON bitta ekranda (ega tasdiqlagan
                    §7, yuqoridagi izoh) — bu faqat sarlavha ohangini o'zgartiradi. */}
                {/* 🎴 Sarlavha generik («Karta olish») — sovrin nomi endi atom belt'ida BIR marta
                    (review: nom sarlavha + rasm ustida ikki marta chizilardi). */}
                <div className="oyk-sheet-title">🎟 Karta olish</div>
                <div className="oyk-atom is-lift oyk-buy-atom">
                  <div className="oyk-atom-img">
                    {buyPrize.photoUrl && !badPhoto.has(buyPrize.key)
                      ? <img src={buyPrize.photoUrl} alt="" onError={() => markBadPhoto(buyPrize.key)} />
                      : <span>{buyPrize.icon}</span>}
                    <span className="oyk-atom-shine" />
                  </div>
                  <div className="oyk-atom-belt"><span className="oyk-atom-nm">{buyPrize.name}</span><span className="oyk-atom-ball">◆ {buyPrize.price} ball</span></div>
                </div>
                {/* 🎯 IJOBIY imkon-o'lchagich — «ko'proq karta = ko'proq imkoniyat» (ega qarori).
                    «3 limit» chalkash tili o'rniga o'sish ko'rsatiladi. */}
                <div className="oyk-buy-opp">
                  <div className="oyk-buy-opp-r">Kartalaring: <b>{buyPrize.mine}</b> → <b>{buyPrize.mine + qty}</b></div>
                  <small>Har karta — mukofot kunida yana bitta imkoniyat</small>
                </div>
                {sc !== "none" && (
                  <div className={`oyk-scarce is-${sc}`}>
                    {sc === "hot" ? `🔥 ${buyPrize.remaining} ta qoldi — tugayapti` : `${buyPrize.remaining} ta qoldi`}
                  </div>
                )}
                {/* MIQDOR — STEPPER (chip-qatori emas): limit 3 dan 50 ga ko'tarilgach (ega
                    qarori 2026-08-19) 50 ta chip chizib bo'lmasdi. Stepper `maxQty` bilan
                    chegaralangan — u ball/sovrin-qoldig'i/knob ning eng kichigi. */}
                {maxQty > 1 && (
                  <div className="oyk-qty">
                    <span className="oyk-qty-lb">Nechta karta?</span>
                    <div className="oyk-qty-btns">
                      <button type="button" className="oyk-qty-b" disabled={qty <= 1} onClick={() => { haptic(); setBuyQty(Math.max(1, qty - 1)); }} aria-label="Kamaytirish">−</button>
                      <span className="oyk-qty-n">{qty}</span>
                      <button type="button" className="oyk-qty-b" disabled={qty >= maxQty} onClick={() => { haptic(); setBuyQty(Math.min(maxQty, qty + 1)); }} aria-label="Ko'paytirish">+</button>
                    </div>
                  </div>
                )}
                {/* 🏆 «Hamma joy sizda» — limit emas, YUTUQ holati: shu miqdorni olsangiz
                    sovrinning barcha kartalari sizda bo'ladi va mukofot kafolatlanadi. */}
                {buyPrize.mine + qty >= buyPrize.limit && (
                  <div className="oyk-scarce is-warn">
                    🏆 Bu sovrinning BARCHA kartalari sizda bo'ladi — mukofot kafolatlangan
                  </div>
                )}
                {/* "Xariddan keyin qoladi" — xaridning ASOSIY savoli. Avval odam ballini
                    yechgandan keyingina qancha qolganini bilardi; endi bosishdan OLDIN ko'radi. */}
                <div className="oyk-buy-after">
                  <div className="oyk-buy-after-r"><span>Sizning ballingiz</span><b>{state.ball}</b></div>
                  <div className="oyk-buy-after-r"><span>{qty > 1 ? `${qty} karta narxi` : "Karta narxi"}</span><b className="is-minus">−{total}</b></div>
                  <div className="oyk-buy-after-r is-total"><span>Xariddan keyin qoladi</span><b>{Math.max(0, state.ball - total)}</b></div>
                </div>
                {/* IKKI QATORLI huquqiy izoh — ikkinchi fakt (ball pul emas) avval faqat bosh
                    tabda turardi, ya'ni pul-yechish savoli aynan xarid daqiqasida javobsiz edi. */}
                <div className="oyk-buy-note">
                  Sodiqlik kartasi — mukofot kunida ishtirok huquqi, mukofot kafolati emas.<br />
                  Ball pul emas: to'langan ball qaytarilmaydi va naqdga yechilmaydi.
                </div>
                <div className="oyk-buy-actions">
                  <button type="button" className="oyk-buy-confirm" disabled={busy} onClick={() => void confirmBuy()}>{busy ? "Olinmoqda…" : qty > 1 ? `🎟 ${qty} karta olish — ${total} ball` : `🎟 Karta olish — ${total} ball`}</button>
                  <button type="button" className="oyk-buy-cancel" disabled={busy} onClick={() => { setSheet(null); setBuyKey(null); }}>Bekor</button>
                </div>
              </>
              );
            })()}
          </div>
        </div>
      )}

      {celebrate && (
        <div className="oyk-celebrate">
          {/* 🎴 Karta-atomi (hamma joydagi AYNAN bir obyekt) + «Karta sizniki!». «Omad tilaymiz»
              (tasodif/qimor ohangi, pozitsiyaga zid) OLIB TASHLANDI — sovrin hali yutilmagan,
              faqat karta olindi. «Kartalarim» yo'li qo'shildi (ekran kartani va'da qiladi). */}
          <div className="oyk-atom is-lift oyk-cel-atom">
            <div className="oyk-atom-img">
              {celebrate.prize.photoUrl && !badPhoto.has(celebrate.prize.key)
                ? <img src={celebrate.prize.photoUrl} alt="" onError={() => markBadPhoto(celebrate.prize.key)} />
                : <span>{celebrate.prize.icon}</span>}
              <span className="oyk-atom-shine" />
            </div>
            {/* Kod — Kartalarim/karta-sahifasidagi raqamning AYNAN O'ZI (`code`, Feistel+Luhn). */}
            <div className="oyk-atom-belt"><span className="oyk-atom-nm">{celebrate.prize.name}</span><span className="oyk-cel-code">{celebrate.code}</span></div>
          </div>
          <div className="oyk-cel-title">{celebrate.count > 1 ? `×${celebrate.count} karta qo'shildi` : "Karta sizniki!"}</div>
          <div className="oyk-dstatus">⏳ Mukofot kunini kutmoqda</div>
          <div className="oyk-cel-sub">Mukofot kuni jonli efirda o'ynaydi — imkoniyating shuncha katta. To'plamingda: {state.ticketCount} karta.</div>
          <div className="oyk-cel-acts">
            <button type="button" className="oyk-cel-p" onClick={() => { setCelebrate(null); setTab("tickets"); }}>🎴 Kartalarim</button>
            <button type="button" className="oyk-cel-s" onClick={() => setCelebrate(null)}>Zo'r!</button>
          </div>
        </div>
      )}

      {/* 📖 STORY-KO'RINISHIDA O'RGATISH (2026-08-12, ega talabi — taxi bo'limidagi naqsh).
          Avvalgi 4 ta quruq slayd (`obSlides`) o'rniga: bosib turib o'qish, avtomatik o'tish,
          5 karta. Mavsum sonini `oyk_onboard_seen:<seasonId>` ga bog'lash V-NEXT — hozircha
          bir martalik (butun ilova umri bo'yicha), taxiStory bilan BIR XIL yondashuv. */}
      {onboard !== null && (
        <OyinStory
          hints={state.hints}
          cheapestName={cheapest?.name ?? null}
          cheapestPrice={cheapest?.price ?? null}
          onClose={finishOnboard}
        />
      )}

      {/* 🤝 Gashtak-tushuntirish — `obSlides`/`.oyk-onboard` bilan BIR XIL naqsh, alohida
          holat+kalit bilan (yuqoridagi `gashtakSlides` izohiga qarang). */}
      {gashtakHelp !== null && (() => {
        const slides = gashtakSlides();
        const cur = slides[gashtakHelp];
        if (!cur) return null;
        return (
        <div className="oyk-onboard">
          <div className="oyk-ob-icon">{cur.icon}</div>
          <div className="oyk-ob-step">{gashtakHelp + 1} / {slides.length} QADAM</div>
          {cur.visual === "unity" && <GashtakUnityViz />}
          {cur.visual === "join" && <GashtakJoinViz />}
          {cur.visual === "compare" && <GashtakCompareViz />}
          {cur.visual === "goal" && <GashtakGoalViz />}
          {cur.visual === "message" && <GashtakMessageViz />}
          <div className="oyk-ob-text">{cur.text}</div>
          <div className="oyk-ob-dots">
            {slides.map((sl, i) => <div key={sl.icon} className={`oyk-ob-dot${i === gashtakHelp ? " is-active" : ""}`} />)}
          </div>
          <button
            type="button" className="oyk-ob-next"
            onClick={() => (gashtakHelp >= slides.length - 1 ? finishGashtakHelp() : setGashtakHelp(gashtakHelp + 1))}
          >{gashtakHelp === slides.length - 1 ? "Tushunarli! 🤝" : "Keyingisi"}</button>
          <button type="button" className="oyk-ob-skip" onClick={finishGashtakHelp}>Yopish</button>
        </div>
        );
      })()}
    </div>
  );
}
