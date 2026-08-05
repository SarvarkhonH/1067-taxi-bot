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
import { OYIN_FINAL_LOCK_MS, oyinHintOf, type OyinActivityAction, type OyinActivityResponse, type OyinGashtakSearchHit, type OyinJamoamResponse, type OyinJamoaResult, type OyinJamoaView, type OyinMyTicketsResponse, type OyinPrizeView, type OyinSeasonClientView, type OyinStateResponse, type OyinVitrinaResponse } from "@t1067/shared";
import { api } from "./api";
import { addToHomeScreen, copyText, haptic, homeScreenStatus, inviteLandingUrl, onHomeScreenAdded, shareLink, shareStory } from "./telegram";
import "./design/feat/oyk.css"; // bu ekran ochilgandagina yuklanadi (kritik yo'lda emas)

// ⚠️ Raqamlar KNOBDAN. Avval "+30 ball" qotirilgan edi — ega knobni o'zgartirsa ilovaning
// BIRINCHI ekrani yolg'on aytardi (DIZAYN_QOIDALARI #9).
function obSlides(h: OyinStateResponse["hints"]): { icon: string; text: string }[] {
  return [
    { icon: "🚕", text: `Safar qil — har safarga +${h.rideBall} ball` },
    { icon: "🤝", text: `Do'st chaqir — u raqam ulasa +${h.referJoinBall}, birinchi safarini qilsa +${h.referFirstRideBall}` },
    { icon: "🎟", text: "Ball yig'ilgach sodiqlik kartasiga almashtirasan — karta mukofot kunida qatnashish huquqi" },
    { icon: "🎁", text: "Oy oxiri — jonli mukofot kuni. Real mukofotlar!" },
  ];
}
const OB_SEEN_KEY = "oyk_onboard_seen";
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
// ⚠️ `referCombo` = do'st ulandi + birinchi safari (masalan 40+120=160). Ekranning boshqa
// joyida do'st "+40" deb ko'rsatilardi va ikkalasi bir-biriga zid chiqardi — endi "Ball qanday
// yig'iladi" varag'ida uchala do'st-bali ham alohida yozilgan, ya'ni ziddiyat yo'q.
function fastPath(remaining: number, referCombo: number, rideBall: number): string {
  if (remaining <= 0) return "Ball yetdi — kartani oling!";
  if (referCombo <= 0 && rideBall <= 0) return `${remaining} ball qoldi`;
  const dd = referCombo > 0 ? Math.floor(remaining / referCombo) : 0;
  const left = remaining - dd * referCombo;
  const sf = rideBall > 0 ? Math.ceil(left / rideBall) : 0;
  const parts: string[] = [];
  if (dd > 0) parts.push(`${dd} do'st`);
  if (sf > 0) parts.push(`${sf} safar`);
  return parts.length ? `Eng tez yo'l: ${parts.join(" + ")}` : `${remaining} ball qoldi`;
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
    ["🚕", "O'z safaringiz", h.rideBall, "cheksiz"],
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
function buyReasonText(reason: string | undefined): string {
  switch (reason) {
    case "sold_out": return "😔 Bu mukofot uchun o'rinlar tugadi";
    case "drawn": return "🏁 Bu mukofot allaqachon egasiga topshirilgan";
    case "off": return "Dastur hali yopiq";
    case "season_off": return "📅 Dastur hozir faol emas — karta olish yopiq";
    case "final_lock": return "🔒 Karta olish yopildi — ro'yxat mukofot kuniga tayyor. Kartalaringiz «Kartalarim» bo'limida";
    case "own_limit": return "⚖️ Bu mukofotdan limitga yetdingiz — boshqasini tanlang";
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
  jamoa: "Jamoa navbati sizda edi",
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
            yig'ilgan ballga sodiqlik kartasi oladi. Mukofot kunida shu kartalar orasidan mukofot
            egalari aniqlanadi.
          </RuleSec>

          <RuleSec n={2} t="Tashkilotchi">
            Tashkilotchi: <RuleFill value={RULES_ORGANIZER} /><br />
            Mukofotlar bo'yicha barcha majburiyat tashkilotchi zimmasida.
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

          {/* 🎁 Mukofotlar — JONLI katalogdan. Qotirilgan ro'yxat yo'q: ega mukofot qo'shsa
              yoki olib tashlasa hujjat o'zi yangilanadi. Katalog bo'sh bo'lsa soxta ro'yxat
              o'ylab topilmaydi (DIZAYN_QOIDALARI #7) — rost gap aytiladi. */}
          <RuleSec n={5} t="Mukofotlar">
            {prizes.length === 0 ? (
              <>
                Mukofotlar ro'yxati hali e'lon qilinmagan. E'lon qilingach shu yerda to'liq
                ko'rinadi: har mukofotning nomi, sodiqlik kartalari soni va topshirilishi uchun
                kerak bo'lgan karta soni.
              </>
            ) : (
              <>
                Jami <b>{prizes.length} ta mukofot</b> · <b>{cards} ta sodiqlik kartasi</b>.
                <ul className="oyk-rules-ul">
                  {prizes.map((p) => (
                    <li key={p.key}>
                      <b>{p.name}</b> — {p.limit} ta sodiqlik kartasi
                      {p.minSell > 0 ? <> · topshirilishi uchun kamida {p.minSell} ta karta tarqatilishi kerak</> : null}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </RuleSec>

          <RuleSec n={6} t="Mukofot egasi qanday aniqlanadi">
            Har mukofot o'z sodiqlik kartalarining belgilangan qismi tarqatilganda EGASIGA TOPSHIRILADI —
            kerakli son har mukofot yonida (5-band) OLDINDAN ko'rsatilgan. Kerakli son
            yig'ilmasa, o'sha mukofot o'ynalmaydi va bu haqda ochiq e'lon qilinadi.<br />
            Muddat tugashiga <b>{lockH} soat</b> qolganda karta berish to'xtaydi: ro'yxat
            muzlatiladi va ommaga e'lon qilinadi.<br />
            Mukofot egasi <b>jonli efirda</b>, ishonchli guvoh ishtirokida, muzlatilgan
            ro'yxatdan tasodifiy tanlash yo'li bilan aniqlanadi. Natija va ro'yxat keyinchalik
            tekshirish uchun saqlanadi.
          </RuleSec>

          <RuleSec n={7} t="Mukofotni topshirish">
            Topshirish joyi va muddati: <RuleFill value={RULES_HANDOVER} /><br />
            Mukofot faqat egasining o'ziga topshiriladi: shaxsni tasdiqlovchi hujjat va dasturda
            ro'yxatdan o'tgan telefon raqami talab qilinadi.
          </RuleSec>

          <RuleSec n={8} t="Soliq">
            {/* ⚠️ «Yutuq solig'i» — Soliq kodeksidagi RASMIY atama. Uni butunlay olib tashlash
                huquqiy hujjatni noaniq qilardi, shuning uchun mahsulot tili birinchi, rasmiy
                atama qavsda: hujjat ham to'g'ri, ekran ham lug'atga mos. */}
            Mukofot solig'i (qonunda «yutuq solig'i», 12%) 500 000 so'mgacha bo'lgan mukofotlarda tashkilotchi zimmasida.
            Undan qimmatroq mukofotlarda soliq mukofot egasi bilan birgalikda rasmiylashtiriladi.
          </RuleSec>

          <RuleSec n={9} t="Kim qatnasha olmaydi">
            Tashkilotchi, uning xodimlari va ularning oila a'zolari mukofot kunida qatnasha
            olmaydi.<br />
            Bir odam bir nechta hisob ochsa, soxta ma'lumot yoki qalbaki taklif ishlatsa — uning
            bali va kartalari bekor qilinadi.
          </RuleSec>

          <RuleSec n={10} t="Savol va shikoyat">
            Murojaat uchun: <RuleFill value={RULES_CONTACT} /><br />
            Har bir murojaat ko'rib chiqiladi va javob beriladi.
          </RuleSec>

          <RuleSec n={11} t="Muhim chegaralar">
            <ul className="oyk-rules-ul">
              <li>Sodiqlik kartasi pulga sotilmaydi, boshqa odamga berilmaydi va naqd pulga almashtirilmaydi.</li>
              <li>Ball ham sotilmaydi, boshqa hisobga o'tkazilmaydi va pulga almashtirilmaydi.</li>
              <li>Kartaga sarflangan ball qaytarilmaydi.</li>
              {/* 🟡 S8-5 (nazoratchi 2026-08-04): avvalgi matn ("muddat tugaguncha sarflanmasa
                   kuyadi") KOD BILAN ZID edi — ball davr bilan bog'liq emas. Amaldagi ikki
                   qoida esa mijozga HECH QAYERDA aytilmagan edi: bu ochiq aytilishi SHART,
                   chunki ikkalasi ham ballni kamaytiradi. */}
              <li>Ball muddatga bog'liq emas — u sarflanmaguncha hisobingizda turadi.</li>
              <li><b>6 oy davomida hech qanday harakat bo'lmasa</b> (safar, kirish, karta) ball nolga
                tushadi. Bitta harakat hisobni yana faollashtiradi.</li>
              <li>Ball tarixi <b>24 oy</b> saqlanadi; undan eskisi hisobdan chiqadi. Sodiqlik
                kartalari esa o'chmaydi — ular ro'yxatda abadiy qoladi.</li>
              <li>Bir odam bitta mukofot uchun ko'pi bilan {maxPerPrize} ta karta ola oladi.</li>
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
type SheetKind = "buy" | "info" | "how" | "ball" | "bell" | "rules" | "gashtak" | null;
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
  const [bellSeen, setBellSeen] = useState<string>(() => { try { return localStorage.getItem("oyk_bell_seen") ?? ""; } catch { return ""; } });
  // Qizil nuqta — oxirgi ko'rilgandan keyin necha voqea qo'shilgani. Ro'yxat ochilmagan
  // bo'lsa (bell === null) nuqta ko'rsatilmaydi: soxta "yangi bor" signali bermaymiz.
  // ⚠️ Avval `bell` FAQAT varaq ochilganda yuklanardi, ya'ni qizil son HECH QACHON
  // ochilmasdan ko'rinmasdi — "yangi xabar bor" signali ishlamasdi. Endi ro'yxat
  // ochilishda yuklanadi (pastdagi `useEffect`), son esa darhol ko'rinadi.
  const bellNew = bell ? bell.rows.filter((r) => r.at > bellSeen).length : 0;
  const [tickets, setTickets] = useState<OyinMyTicketsResponse | null>(null);
  const [tab, setTab] = useState<OyinTab>(() => {
    try {
      const t = localStorage.getItem(START_TAB_KEY);
      if (t) localStorage.removeItem(START_TAB_KEY);
      return t === "vitrina" ? "vitrina" : "home";
    } catch { return "home"; }
  });
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [buyKey, setBuyKey] = useState<string | null>(null);
  const [buyQty, setBuyQty] = useState(1); // 🎟 miqdor (max 3) — YAKUNIY DIZAYN §7 tafsilot ekrani
  const [busy, setBusy] = useState(false); // faqat CHIPTA XARIDI
  // Poster/hikoya alohida flag: avval bitta `busy` uchala operatsiyani band qilardi —
  // sekin tarmoqda chipta olayotgan mijoz Jamoam tabida "⏳ Tayyorlanmoqda…" ni ko'rardi.
  const [posterBusy, setPosterBusy] = useState(false);
  // `ticketNo` — GLOBAL raqam (`gno`). Avval bu yerga sovrin-ichi tartib raqami tushardi va
  // bayramda "№0002", Chiptalarim'da esa "№ 729476" chiqardi — bitta chipta, ikki xil raqam.
  const [celebrate, setCelebrate] = useState<{ prize: OyinPrizeView; ticketNo: number; count: number } | null>(null);
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
  const cancelTicket = useCallback(async (gno: number) => {
    if (!window.confirm("Bu karta bekor qilinsin — ball hisobingizga qaytadi. Davom etasizmi?")) return;
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
        r.reason === "will_draw" ? "Bu sovrin allaqachon tirajga tayyor — bekor qilib bo'lmaydi"
          : r.reason === "final_lock" ? "Davr yakuniga yaqin — bekor qilish yopiq"
          : r.reason === "season_off" ? "Dastur hozir faol emas"
          : "Bekor qilib bo'lmadi",
        3400,
      );
    } catch {
      showToast("Bekor qilib bo'lmadi — internetni tekshiring");
    }
  }, [showToast, loadTickets, loadHome]);

  // 🤝 Gap-jamoa (gashtak). Alohida yuklanadi — do'st-ro'yxati bilan bog'liq emas va biri
  // yiqilsa ikkinchisi ko'rinishda qolsin.
  // 💡 Kunlik maslahat — a'zo va kun bo'yicha deterministik, so'rov ham saqlash ham KERAK EMAS.
  const dailyHint = oyinHintOf(new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10));

  const [jamoa, setJamoa] = useState<OyinJamoaView | null>(null);
  // 🤝 Gashtak taklif-havolasi (`?go=oyin&gsk=<code>`, 2026-08-05): odam hali guruhda bo'lmasa
  // qo'shilish maydoni OLDINDAN TO'LDIRILADI. Faqat BIRINCHI yuklashda — keyin foydalanuvchi
  // o'zi tahrirlashi mumkin bo'lishi kerak (har `jamoa` yangilanishida qayta yozib qo'ymaymiz).
  const [jamoaInput, setJamoaInput] = useState(() => joinCode ?? "");
  const [jamoaBusy, setJamoaBusy] = useState(false);
  const loadJamoa = useCallback(() => { api.oyinJamoa().then(setJamoa).catch(() => undefined); }, []);
  useEffect(() => { loadJamoa(); }, [loadJamoa]);
  const jamoaReasonText = useCallback((reason: OyinJamoaResult["reason"], cooldownDaysLeft?: number): string => {
    // Har sabab O'Z matni bilan — "xatolik" degan umumiy so'z hech narsa aytmaydi (T4 saboqi).
    switch (reason) {
      case "already_in": return "Siz allaqachon jamoadasiz";
      case "not_found": return "Bunday kodli jamoa topilmadi";
      case "full": return `Jamoa to'lgan (${jamoa?.maxSize ?? 10} kishi)`;
      case "bad_name": return "Nom kamida 2 harf bo'lsin";
      case "not_in": return "Siz jamoada emassiz";
      case "off": return "Dastur hali yopiq";
      case "disbanded": return "Bu guruh tarqatilgan — havola endi ishlamaydi";
      case "leader_only": return "Faqat guruh boshlig'i qila oladi";
      case "self_target": return "O'zingizni chiqara olmaysiz — «Guruhni tarqatish» dan foydalaning";
      case "already_in_group": return "Bu odam allaqachon boshqa guruhda";
      case "not_group_member": return "Bu odam guruhda emas";
      case "cooldown": return `Yana ${cooldownDaysLeft ?? "bir necha"} kundan keyin qo'shilishingiz mumkin`;
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
        loadHome(true); // jamoa balli darhol balansda ko'rinsin
        showToast(action === "leave" ? "Jamoadan chiqdingiz" : action === "create" ? "🤝 Jamoa tuzildi — kodni do'stlaringizga yuboring" : "🤝 Jamoaga qo'shildingiz");
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
    if (!window.confirm("Bu a'zoni guruhdan chiqarasizmi?")) return;
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
    if (!window.confirm("Guruh butunlay tarqatiladi — hamma chiqariladi. Davom etasizmi?")) return;
    haptic();
    setJamoaBusy(true);
    try {
      const r = await api.oyinGashtakDisband();
      setJamoa(r.view);
      showToast(r.ok ? "Guruh tarqatildi" : jamoaReasonText(r.reason));
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

  // Chipta endi O'Z TABIGA ega (YAKUNIY DIZAYN §1) — varaq ochilmaydi, tabga o'tiladi.
  // Bitta narsa ikki joyda ochilsa (varaq + tab) qaysi biri "haqiqiy" ekani noaniq bo'ladi.
  const openTickets = useCallback(() => {
    haptic();
    setTab("tickets");
  }, []);

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
      const topPrize = [...(vitrina?.prizes ?? [])].sort((a, b) => b.price - a.price)[0];
      const text = nudge ?? (topPrize
        ? `🎁 BirJoy sodiqlik dasturi — bosh mukofot: ${topPrize.name}!\n\nHech narsa to'lamaysan: shunchaki taksida yur, ball yig', sodiqlik kartasini ol. Davr oxirida jonli efirda mukofot egalari aniqlanadi.\n\nMening havolam bilan kirsang — ikkalamizga ham ball tushadi 🤝`
        : "🎁 BirJoy sodiqlik dasturi — taksida yur, ball yig', jonli efirda mukofot egasi bo'l. Mening havolam bilan kirsang, ikkalamizga ham ball tushadi 🤝");
      // `inviteLandingUrl` — landing sahifa OG-kartasi bilan (rasm + sarlavha). Xom bot
      // havolasi ulashilsa Telegram quruq, rasmsiz preview chizadi.
      shareLink(inviteLandingUrl(r.link), text);
    } catch {
      showToast("Havolani ochib bo'lmadi — birozdan keyin urinib ko'ring");
    }
  }, [showToast, vitrina]);

  const tapPrize = useCallback((p: OyinPrizeView) => {
    haptic();
    if (p.soldOut) { showToast("😔 Bu mukofot uchun o'rinlar tugadi — boshqasini tanlang"); return; }
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
    const maxP = state?.hints.maxPerPrize ?? 3;
    if (p.mine >= maxP) { showToast(`⚖️ Bu mukofotdan limitga yetdingiz (${maxP} ta) — boshqasini tanlang`); return; }
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
    let stopReason: string | undefined;
    // ⚠️ Miqdor SHU YERDA ham qisqartiriladi. Varaq `qty` ni (limit/qoldiq/ball bo'yicha
    // qisqartirilgan) ko'rsatadi, lekin xom `buyQty` bilan tsikl qilinsa ular ayri ketadi:
    // mijoz "2" ni ko'rib, tizim 3 marta urinadi va oxirgisi xato bilan qaytadi.
    const want = prize && state
      ? Math.max(1, Math.min(buyQty, state.hints.maxPerPrize - prize.mine, prize.remaining, Math.floor(state.ball / prize.price)))
      : 1;
    try {
      for (let i = 0; i < want; i++) {
        const r = await api.oyinBuyTicket(buyKey);
        if (r.ok && r.gno != null) { got++; lastGno = r.gno; continue; }
        stopReason = r.reason;
        break;
      }
      setSheet(null);
      if (got > 0 && lastGno != null && prize) {
        haptic();
        setCelebrate({ prize, ticketNo: lastGno, count: got });
        // ⚠️ Chiptalar keshini BEKOR qilamiz — aks holda mijoz Chiptalarim tabiga o'tib
        // "Hali chiptangiz yo'q" ni o'qiydi (kesh bir marta yuklanib qotib qolardi).
        setTickets(null);
        // ⚠️ `loadHome(true)` — SOFT. Avval bu yerda `loadHome()` (soft EMAS) turardi va
        // xariddan keyingi qayta-yuklash tarmoq blipida yiqilsa `loadState="error"` bo'lib
        // butun ekran "yuklab bo'lmadi" ga almashardi: ball TO'LANGAN, chipta OLINGAN, lekin
        // bayram oynasi ham, chipta raqami ham mijozga ko'rinmasdi. Yuqoridagi izoh aynan shu
        // bugni "tuzatilgan" deb yozardi — izoh haqiqat emas edi, endi kod izohga mos.
        loadHome(true);
        if (stopReason) showToast(`${got} ta olindi. Qolganini olib bo'lmadi: ${buyReasonText(stopReason)}`, 3600);
      } else {
        showToast(buyReasonText(stopReason));
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
      const topPrize = [...(vitrina?.prizes ?? [])].sort((a, b) => b.price - a.price)[0];
      const link = inviteLandingUrl(r.link);
      const text = topPrize
        ? `🎁 BirJoy sodiqlik dasturi — bosh mukofot: ${topPrize.name}!

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
          <div className="oyk-skel-block oyk-skel-hero" />
          <div className="oyk-skel-block oyk-skel-daily" />
          <div className="oyk-skel-rail-row">
            {[0, 1, 2].map((i) => <div key={i} className="oyk-skel-block oyk-skel-rail-card" />)}
          </div>
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
    [...vitrina.prizes].filter((p) => !p.soldOut).sort((a, b) => a.price - b.price)[0] ??
    null;
  const nearMiss = cheapest ? state.ball >= cheapest.price : false;

  // 🚦 O'lchangan tanqislik (YAKUNIY DIZAYN §6): tanqislik HAQIQAT bo'lgandagina ko'rsatiladi.
  // ≥50% — rangsiz · 20–50% — kahrabo · <20% — qizil. Sabab: lotereya + qizil bosim mahalliy
  // bozorda "aldov ilova" tuyg'usini beradi; kam ishlatilgan qizilga esa ishonishadi.
  const leftRatio = (p: OyinPrizeView) => (p.soldOut || p.limit <= 0 ? 1 : p.remaining / p.limit);
  // ⚠️ Bir ekranda ENG KO'PI BITTA qizil — eng tanqisi qizil, qolganlari kahraboga tushadi.
  // Aks holda uchala kartada ham qizil chiqib, hech biri o'qilmay qoladi (maket v2 xatosi).
  const hotKey = [...vitrina.prizes]
    .filter((p) => !p.soldOut && p.limit > 0 && leftRatio(p) < 0.2)
    .sort((a, b) => leftRatio(a) - leftRatio(b))[0]?.key ?? null;
  const scarcity = (p: OyinPrizeView): "none" | "warn" | "hot" => {
    if (p.soldOut || p.limit <= 0) return "none";
    const left = leftRatio(p);
    if (left < 0.2) return p.key === hotKey ? "hot" : "warn";
    return left < 0.5 ? "warn" : "none";
  };

  // 📅 Ega maketidagi "31-AVGUST, 20:00" — mavsum tugash sanasi (sovg'alar shu kuni
  // topshiriladi). Boshlanmagan mavsumda esa BOSHLANISH sanasi ko'rsatiladi.
  // (`upcoming`/`unset` bu yergacha yetmaydi — ular yuqorida erta return bilan ushlangan.)
  const drawDateText = (() => {
    const iso = state.season.endIso;
    if (!iso) return "";
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return "";
    return `${uzDate(iso).toUpperCase()}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  })();

  // Tiraj VAQTI — mavsum tugash sanasining soati (chiptada "31-avgust, 20:00" bo'lib chiqadi).
  const drawTime = (() => {
    const iso = state.season.endIso;
    if (!iso) return "";
    const d = new Date(iso);
    return Number.isFinite(d.getTime()) ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : "";
  })();

  const setGoal = async (p: OyinPrizeView) => {
    haptic();
    try {
      await api.oyinGoal(p.key);
      showToast(`🎯 Maqsad: ${p.name}`);
      loadHome();
    } catch { showToast("Maqsadni saqlab bo'lmadi"); }
  };
  const cd = countdownTo(state.season.endIso);
  const buyPrize = vitrina.prizes.find((p) => p.key === buyKey) ?? null;
  const activeFriend = jamoam?.friends.find((f) => f.status === "active_today" && f.gainToday > 0) ?? null;

  return (
    <div className="oyk">
      <div className="oyk-scroll">
        {/* Sarlavha — ega maketi 2026-08-03: avatar + brend + qo'ng'iroq.
            ⚠️ REYTING BUTUNLAY OLIB TASHLANDI (ega qarori): u ball QOLDIG'I bo'yicha
            saralanardi, ya'ni chipta olgan odamning o'rni TUSHARDI — to'g'ri xatti-harakat
            jazolanardi. Hech bir ekranda o'rin haqida gap qolmadi. */}
        <div className="oyk-top">
          <div className="oyk-top-me">
            <div className="oyk-top-av">
              <span>{(state.sponsor.name[0] ?? "B").toUpperCase()}</span>
              {state.ticketCount > 0 && <i className="oyk-top-av-b">{state.ticketCount}</i>}
            </div>
            <div className="oyk-top-nm">
              <b>BirJoy</b>
              <small>{state.season.label ? `${state.season.label} dasturi` : "Sodiqlik dasturi"}</small>
            </div>
          </div>
          {/* ❓ Savol-javob varag'i TO'LIQ yozilgan edi, lekin unga KIRISH YO'LI yo'q edi:
              sarlavha qayta chizilganda "?" tugmasi (.oyk-chip-help) tushib qolgan va
              `setSheet("info")` hech qayerdan chaqirilmasdi — ya'ni "Chipta nima?",
              "Jonli tiraj nima?", "Qoidalar" javoblari mijozga UMUMAN ko'rinmasdi
              (YAKUNIY DIZAYN §1 shu to'plamni talab qiladi). */}
          <div className="oyk-top-acts">
            <button type="button" className="oyk-icbtn" onClick={() => { haptic(); setSheet("info"); }} aria-label="Savol-javob">?</button>
            <button type="button" className="oyk-icbtn is-bell" onClick={openBell} aria-label="Xabarlar">
              🔔
              {bellNew > 0 && <i className="oyk-bell-dot">{bellNew > 9 ? "9+" : bellNew}</i>}
            </button>
          </div>
        </div>

        {/* ⚠️ Matn "yopildi" degan QAT'IY da'vodan ogohlantirishga o'tkazildi. Sabab: bu faza
            qurilma soatidan hisoblanadi va soati oldinda ketgan telefonda noto'g'ri chiqadi —
            "yopildi" deb yozib, tugmani ochiq qoldirish esa ochiq ziddiyat bo'lardi. Haqiqiy
            qulfni server qo'yadi va o'z matnini qaytaradi (`final_lock`). */}
        {phase === "final48" && (
          <div className="oyk-final-banner">⏳ <b>Dastur davri tugashiga 48 soatdan kam qoldi.</b> Karta olish shu oraliqda yopiladi — kechiktirmang. Kartalaringiz "Kartalarim" bo'limida turibdi.</div>
        )}

        {tab === "home" && (
          <>
            {ended ? (
              /* 🏁 MAVSUM YAKUNI — endi ERTA RETURN emas, O'yin tabining kontenti.
                 Tab-qatori, Chiptalarim va "?" tirik qoladi (tiraj kuni chipta kerak bo'ladi). */
              /* Ega qarori 2026-08-03: mavsum oxirida ball TANGAGA AYLANMAYDI, kuyadi.
                 Ekran shuni ochiq aytadi — mavsum davomida ham aytilgan (ball jadvali ostida),
                 shuning uchun bu yerda "to'satdan" bo'lmaydi.
                 ⚠️ Avval bu blok `.oyk-hero` (sarg'ish) sinflarini ishlatardi — ular MEHMON-teaser
                 ekraniga ham tegishli. Natijada ikkita ekran bir-birini qulflab turardi va yakun
                 kartasi uy tabining yangi TO'Q uslubidan yiroqda, eski sarg'ish bo'lib qolgandi.
                 Endi yakunning O'Z sinflari bor (.oyk-fin*) — teaser tegilmagan. */
              <div className="oyk-fin">
                <span className="oyk-fin-glow" aria-hidden="true" />
                <div className="oyk-fin-label">🏁 DASTUR DAVRI YAKUNLANDI</div>
                <div className="oyk-fin-title">
                  {state.ticketCount > 0 ? "Kartalaringiz mukofot kunida" : "Bu davr tugadi"}
                </div>
                <div className="oyk-fin-card">
                  <div className="oyk-fin-row"><span>Kartalaringiz</span><b>{state.ticketCount} ta</b></div>
                  <div className="oyk-fin-row"><span>Sarflanmagan ball</span><b>{state.ball}</b></div>
                </div>
                <div className="oyk-fin-sub">
                  {state.ticketCount > 0
                    ? <>Sarflanmagan ball davr bilan birga yonadi. Kartalaringiz esa mukofot kunida — omad!</>
                    : <>Sarflanmagan ball davr bilan birga yonadi. Keyingi davrda ballni kartaga aylantirishni unutmang.</>}
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
                  <span className="oyk-draw-glow" aria-hidden="true" />
                  <div className="oyk-draw-h">OY OXIRIDA MUKOFOT KUNI!</div>
                  <div className="oyk-draw-k">Sovg'alar topshiriladi</div>
                  <div className="oyk-draw-d">{drawDateText}</div>
                  <button type="button" className="oyk-draw-btn" onClick={() => { haptic(); setSheet("how"); }}>
                    Qanday ishlaydi? <span aria-hidden="true">›</span>
                  </button>
                  <span className="oyk-draw-spark" aria-hidden="true" />
                  <span className="oyk-draw-gift" aria-hidden="true">🎁</span>
                </div>

                {/* 🪙 BALANS — ega maketi 2026-08-03 (2-rasm): to'q rangli karta, sovrin
                    FOTOSI o'ngda, katta "N ball qoldi", gradient progress va foiz.
                    Avval sarg'ish fon + 🪙 emoji edi — ega: "rang emas, mana bunaqa
                    chiroyli bo'lishi kerak edi". */}
                <div className="oyk-goalc">
                  {cheapest ? (
                    <>
                      <div className="oyk-goalc-top">
                        <div className="oyk-goalc-side">
                          <div className="oyk-goalc-tag"><span aria-hidden="true">🎟</span>{cheapest.name}</div>
                          <div className="oyk-goalc-num">
                            <b>{Math.max(0, cheapest.price - state.ball)}</b> <span>ball qoldi</span>
                          </div>
                        </div>
                        <div className="oyk-goalc-img">
                          {cheapest.photoUrl && !badPhoto.has(cheapest.key)
                            ? <img src={cheapest.photoUrl} alt="" loading="lazy" onError={() => markBadPhoto(cheapest.key)} />
                            : <span>{cheapest.icon}</span>}
                        </div>
                      </div>
                      <div className="oyk-goalc-bar">
                        <span style={{ width: `${Math.min(100, (state.ball / cheapest.price) * 100).toFixed(1)}%` }} />
                      </div>
                      <div className="oyk-goalc-meta">
                        <span><b>{state.ball}</b> / {cheapest.price} = 1 ta karta</span>
                        <span>{Math.min(100, Math.round((state.ball / cheapest.price) * 100))}%</span>
                      </div>
                      <div className="oyk-goalc-foot">{cheapest.price} ball = 1 ta sodiqlik kartasi</div>
                    </>
                  ) : (
                    <div className="oyk-goalc-num"><b>{state.ball}</b> <span>ball</span></div>
                  )}
                  <button type="button" className="oyk-bal-btn" onClick={() => { haptic(); setSheet("ball"); }}>
                    Ball qanday yig'iladi? <span aria-hidden="true">›</span>
                  </button>
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
              </>
            )}

            {/* Mavsum tugagach kunlik vazifalar ham, "ball yig'" chaqiriqlari ham MA'NOSIZ —
                ular ball va'da qiladi, ball esa endi hech narsaga aylanmaydi. */}
            {!ended && (() => {
              // 🎯 Bugungi maqsad — prototipdagi halqa, endi REAL ma'lumot bilan (state.today).
              // ⚠️ Uchinchi qator avval "Do'st chaqirish +40" derdi va bosilganda `inviteFriend()`
              // ni chaqirardi — u esa faqat Telegram ulashish oynasini ochadi va HECH QANDAY ball
              // bermaydi (+40 do'st RAQAM ULAGANDA, ya'ni ertaga yoki hech qachon keladi).
              // Ustiga `done` sharti `shared || referJoined` edi: +10 ulashish balini olgan odamga
              // ekran "✓ +40" deb ko'rsatardi. Endi qator o'zi beradigan narsani aytadi:
              // ulashish = +10, bosilganda `doShareBonus` HAQIQATAN yozadi va galochka qo'yiladi.
              const tasks = [
                { done: state.today.login, label: "Ilovaga kirish", gain: state.hints.loginBall, tap: null },
                { done: state.today.rides > 0, label: "1 safar qilish", gain: state.hints.rideBall, tap: null },
                { done: state.today.shared, label: "Ulashish", gain: state.hints.shareBall, tap: () => void doShareBonus() },
              ] as const;
              const doneCount = tasks.filter((t) => t.done).length;
              const R = 26;
              const C = 2 * Math.PI * R;
              return (
                <div className="oyk-daily">
                  <div className="oyk-daily-ring">
                    <svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true">
                      {/* Iz rangi TOKENDAN. Avval `rgba(255,255,255,.09)` — qorong'i qurilishdan
                          qolgan oq iz, oq karta ustida umuman ko'rinmasdi (halqa "osilib" turardi). */}
                      <circle cx="32" cy="32" r={R} fill="none" stroke="var(--oyk-fill)" strokeWidth="6" />
                      <circle
                        cx="32" cy="32" r={R} fill="none" stroke="var(--oyk-violet)" strokeWidth="6" strokeLinecap="round"
                        strokeDasharray={C} strokeDashoffset={C * (1 - doneCount / tasks.length)}
                        transform="rotate(-90 32 32)" style={{ transition: "stroke-dashoffset .6s ease" }}
                      />
                    </svg>
                    <div className="oyk-daily-ring-num">{doneCount}/{tasks.length}</div>
                  </div>
                  <div className="oyk-daily-body">
                    {/* Ega talabi: sarlavha "vazifa" emas, YORDAM tilida. */}
                    <div className="oyk-daily-title">Tezroq ball olish uchun <small>{doneCount}/{tasks.length} bajarildi</small></div>
                    {tasks.map((t) => (
                      <button
                        key={t.label} type="button" disabled={t.done || !t.tap}
                        className={`oyk-daily-row${t.done ? " is-done" : ""}${!t.done && t.tap ? " is-tappable" : ""}`}
                        onClick={t.tap ?? undefined}
                      >
                        <span className="oyk-daily-check">{t.done ? "✔" : ""}</span>
                        <span className="oyk-daily-label">{t.label}</span>
                        <span className="oyk-daily-gain">{t.done ? `✓ +${t.gain}` : `+${t.gain}`}</span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* 🎯 BUGUNGI TOPSHIRIQ — har kuni RANDOM (ega talabi 2026-08-03). Tanlov
                deterministik (a'zo + kun), sahifa yangilanganda o'zgarmaydi. To'plamda faqat
                SERVER TEKSHIRA OLADIGAN topshiriqlar bor. */}
            {!ended && state.quest && state.quest.ball > 0 && (
              <div className={`oyk-quest${state.quest.done ? " is-done" : ""}`}>
                <span className="oyk-quest-em">{state.quest.icon}</span>
                <span className="oyk-quest-tx">
                  <b>{state.quest.title}</b>
                  <small>{state.quest.done ? "Bajarildi — ball tushdi ✓" : state.quest.hint}</small>
                </span>
                <span className="oyk-quest-b">{state.quest.done ? `✓ +${state.quest.ball}` : `+${state.quest.ball}`}</span>
              </div>
            )}

            {/* 📸 Hikoya-qo'yish — PROMO kartochka, HAQIQIY "topshiriq" EMAS (2026-08-05, ega
                talabi + xavfsizlik cheklovi). Ball haqiqiy va ko'rinadigan (`state.story.ballEach`)
                — bu odamni harakatga undaydi — lekin bosish HECH QACHON `done`/ball bermaydi,
                faqat hikoya bo'limiga OLIB BORADI. Sabab: server hikoyani serverga TEKSHIRA
                OLMAYDI (faqat admin ko'radi) — 2026-08-03'da "story" aynan shu sabab bilan
                `OYIN_QUEST_POOL`dan OLIB TASHLANGAN (izohga qarang) — mavsumda BIR MARTA
                tasdiqlangan odam shundan keyin HAR KUNI bepul "bajarildi" olardi. Bu kartochka
                o'sha xatoni QAYTARMAYDI: haqiqiy ball hamon FAQAT admin tasdig'idan keyin,
                `computeBallMap` orqali, mavjud yo'l bilan tushadi. */}
            {!ended && state.story.ballEach > 0 && state.story.approved < state.story.limit && (
              <button type="button" className="oyk-quest is-story" onClick={goToStory}>
                <span className="oyk-quest-em">📸</span>
                <span className="oyk-quest-tx">
                  <b>Hikoya qo'ying — ball oling</b>
                  <small>{state.story.pending ? "Yuborilgan — 24 soat ichida tekshiramiz" : "Instagram yoki Telegram'ga qo'ying"}</small>
                </span>
                <span className="oyk-quest-b">+{state.story.ballEach}</span>
              </button>
            )}

            {/* 🏠 DOIMIY topshiriq — ilovani telefon ekraniga o'rnatish.
                Ko'rsatish sharti (2026-08-03): `homeAddable` (avval `homeSupported`) "qo'shish MUMKIN" degani
                (`homeScreenStatus() === "missed"`), "klient qo'llab-quvvatlaydi" emas. Sabab:
                ikonka ALLAQACHON ekranda bo'lsa Telegram oqimi qayta ochilmaydi va hodisa
                otilmaydi — ya'ni topshiriq BAJARIB BO'LMAYDIGAN bo'lib ekranda osilib qolardi.
                `state.homeTask.done` bo'lsa esa baribir ko'rsatiladi: mijoz o'zi bajargan ishning
                tasdig'ini ko'rishi kerak (aks holda ball tushadi-yu, sababi ekrandan yo'qoladi). */}
            {!ended && (homeAddable === true || state.homeTask.done) && state.homeTask.ball > 0 && (
              <button
                type="button"
                className={`oyk-quest is-home${state.homeTask.done ? " is-done" : ""}`}
                disabled={state.homeTask.done}
                onClick={() => { haptic(); addToHomeScreen(); }}
              >
                <span className="oyk-quest-em">🏠</span>
                <span className="oyk-quest-tx">
                  <b>Ilovani telefon ekraniga o'rnating</b>
                  <small>{state.homeTask.done ? "O'rnatilgan — ball tushdi ✓" : "Bir bosishda — keyin ilova tezroq ochiladi"}</small>
                </span>
                <span className="oyk-quest-b">{state.homeTask.done ? `✓ +${state.homeTask.ball}` : `+${state.homeTask.ball}`}</span>
              </button>
            )}

            {/* 💡 KUNLIK MASLAHAT — har kuni boshqa, a'zo bo'yicha deterministik.
                ⛔ Qizil emas, miltillamaydi: maslahat SHOSHILINCH EMAS. Har kuni yonib tursa
                odam ko'rmay qo'yadi va haqiqatan muhim narsa uchun urg'u qolmaydi. */}
            {!ended && (
              <div className="oyk-hint">
                <span className="oyk-hint-ic" aria-hidden="true">{dailyHint.icon}</span>
                <span className="oyk-hint-tx">{dailyHint.text}</span>
              </div>
            )}

            {/* 💡 Eng tez yo'l — ega talabi 2026-08-03: "do'stinga ayt, SEN ORQALI taksi
                chaqirsin". Avval quruq "N do'st + M safar" hisobi turardi; endi aniq harakat. */}
            {!ended && cheapest && !nearMiss && (
              <button type="button" className="oyk-fast" onClick={() => void inviteFriend()}>
                <span className="oyk-fast-ic">💡</span>
                <span>Eng tez yo'l: <b>do'stingga ayt — sening havolang orqali taksi chaqirsin</b></span>
              </button>
            )}


            {/* 🎟 Chipta raqami avval bayram-oynasida BIR MARTA ko'rinib abadiy yo'qolardi —
                odam 600 ball to'lab qo'lida hech narsa qolmasdi. Endi doimiy ro'yxat bor. */}
            {state.ticketCount > 0 && (
              <button type="button" className="oyk-howto" onClick={openTickets}>
                <span>🎟 Mening kartalarim <b>({state.ticketCount})</b></span>
                <span className="oyk-howto-go">→</span>
              </button>
            )}

            {/* ⛔ Haftalik zanjir bloki va JONLI lenta OLIB TASHLANDI (ega qarori 2026-08-03):
                "havtalik vazifa ham [kerak emas]", "Jonli ham kerak emas". Zanjir mexanikasi
                serverda ishlayveradi va ball jadvalida ko'rinadi — faqat bu blok yo'q. */}

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

            {/* ⛔ Sovrin raili uy tabidan OLIB TASHLANDI (ega qarori 2026-08-03:
                "uy sahifasida sovrinlar kerak emas"). Sovrinlar o'z tabida —
                bitta narsa ikki joyda turmasin. */}
            {/* ⭐ Eng muhim savol — "nima qilsam ball ko'payadi?". Avval javob varaq ortida edi va
                deyarli hech kim ochmasdi: eng katta mukofot (hikoya, do'st birinchi safari) ekranda
                umuman ko'rinmasdi. YAKUNIY DIZAYN §4 — jadval EKRANDA, ostida doimiy ogohlantirish. */}
            {/* Tugagan mavsumda ball jadvali va "do'st chaqiring" chaqirig'i ball va'da
                qiladi, ball esa endi hech narsaga aylanmaydi — ikkalasi ham yashiriladi. */}
            {/* ⛔ Ball jadvali va pastdagi CTA uy tabidan OLINDI (ega qarori 2026-08-03):
                jadval endi "Ball qanday yig'iladi? ›" tugmasi ortida. Uy tabi qisqa va
                aniq bo'lib qoldi: tiraj sanasi → balans → ikkita harakat → bugungi vazifalar. */}
          </>
        )}

        {tab === "vitrina" && (
          <>
            <div className="oyk-v-head">
              <div className="oyk-v-title">🎁 Mukofotlar</div>
              <div className="oyk-rail-sub">{vitrina.prizes.reduce((s, p) => s + p.limit, 0)} ta karta</div>
            </div>
            {/* 📅 Tiraj banneri — sana VA vaqt (YAKUNIY DIZAYN §7, tab 2 birinchi elementi).
                Avval mijoz "qachon o'ynaladi?" degan savolga javobsiz chipta olardi.
                🪙 Balans ham shu yerda: avval "qancha ballim bor?" uchun boshqa tabga qaytish kerak edi.
                ⚠️ Avval bu karta OQ edi, uy tabidagi tiraj kartasi esa TO'Q BINAFSHA — bitta o'yin
                ichida ikkita ekran ikki xil ilovadek ko'rinardi. Endi tiraj sanasi qayerda
                ko'rinsa ham AYNAN bir xil chiziladi (bitta narsa — bitta ko'rinish). */}
            <div className="oyk-vtop">
              <span className="oyk-draw-glow" aria-hidden="true" />
              <div className="oyk-vtop-h">📅 MUKOFOT KUNI</div>
              {state.season.endIso
                ? <div className="oyk-vtop-d">{drawDateText}</div>
                : <div className="oyk-vtop-soon">Sana tez orada e'lon qilinadi</div>}
              <div className="oyk-vtop-ball"><span>Sizning ballingiz</span><b>{state.ball}</b></div>
            </div>
            <div className="oyk-sponsor-strip">
              <div className="oyk-sponsor-logo">{vitrina.sponsor.name[0] ?? "B"}</div>
              <div className="oyk-sponsor-strip-text">Mukofotlar homiysi — <b>{vitrina.sponsor.name}</b></div>
            </div>
            {vitrina.prizes.length === 0 && (
              <div className="oyk-j-report">Mukofotlar hozircha qo'yilmagan — tez orada paydo bo'ladi. Ball yig'ib turing, u yo'qolmaydi 🎁</div>
            )}
            {vitrina.prizes.map((p) => {
              const affordable = !locked && state.ball >= p.price;
              const showPhoto = !!p.photoUrl && !badPhoto.has(p.key);
              return (
                <div key={p.key} className={`oyk-vcard${p.soldOut ? " is-soldout" : ""}`}>
                  {/* ⚠️ Avval `onError` da `parentElement.remove()` turardi — u nafaqat rasmni,
                      balki uning ICHIDAGI sovrin NOMI va NARXINI ham o'chirardi (karta nomsiz
                      to'rtburchakka aylanardi) va React boshqaradigan tugunni tashqaridan
                      olib tashlardi. Endi holat React'da: rasm o'rniga rangli emoji-afisha. */}
                  {showPhoto ? (
                    <div className="oyk-vcard-photo">
                      <img src={p.photoUrl ?? ""} alt="" loading="lazy" onError={() => markBadPhoto(p.key)} />
                      <div className="oyk-vcard-photo-fade" />
                      <div className="oyk-vcard-photo-name">{p.name}</div>
                      <div className="oyk-vcard-photo-price">{p.price} <small>ball</small></div>
                    </div>
                  ) : (
                    <div className="oyk-vcard-photo is-emoji">
                      <span className="oyk-vcard-photo-emoji">{p.icon}</span>
                      <div className="oyk-vcard-photo-fade" />
                      <div className="oyk-vcard-photo-name">{p.name}</div>
                      <div className="oyk-vcard-photo-price">{p.price} <small>ball</small></div>
                    </div>
                  )}
                  {/* ⚠️ Avval bu qator `{p.valueLabel} · {p.limit} dona` edi: qiymat bo'sh
                      bo'lganda ekranda osilgan " · 15 dona" chiqardi (nuqta nimanidir ajratishi
                      kerak, ajratadigan narsa yo'q edi). Endi ikkala bo'lak ham shartli. */}
                  <div className="oyk-vcard-sub">
                    {[p.valueLabel, `${p.limit} dona`].filter(Boolean).join(" · ")}
                  </div>
                  <div className="oyk-vbar">
                    <div className="oyk-vbar-fill" style={{ width: `${Math.min(100, Math.round((state.ball / p.price) * 100))}%` }} />
                  </div>
                  {/* Olingan/qolgan JUFTLIGI (YAKUNIY DIZAYN §7): faqat "qolgan" ijtimoiy isbot
                      bermaydi — "olingan" boshqalar ham olayotganini ko'rsatadi. */}
                  <div className="oyk-vcard-stats">
                    <span>Olingan: <b>{p.sold}</b> · Qolgan: <b>{p.remaining}</b></span>
                    <span>Sizda: <b>{p.mine} ta</b></span>
                  </div>
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
                      eshitadi. Shuning uchun kartada, xarid varag'ida va chiptada turadi. */}
                  {p.minSell > 0 && (
                    <div className={`oyk-vcard-path${p.willDraw ? " is-ok" : ""}`}>
                      {p.willDraw
                        ? `🛡 Mukofot kunida topshiriladi — kerakli ${p.minSell} ta karta yig'ildi`
                        : `🛡 Topshirilishi uchun ${p.minSell} ta karta kerak — hozir ${p.sold} ta`}
                    </div>
                  )}
                  {/* ⚠️ Tugagan sovringa "eng tez yo'l" ko'rsatish — bo'sh va'da: yo'l bor,
                      lekin oxirida olib bo'lmaydi. Tugaganda faqat qatnashgan bo'lsa gap qoladi. */}
                  {(!p.soldOut || p.mine > 0) && (
                    <div className="oyk-vcard-path">
                      💡 {p.mine > 0
                        ? (p.chancePct != null && p.chancePct >= 100
                          // limit=1 bo'lgan sovrinda "≈100% — yana olsang oshadi" bema'ni edi:
                          // oshadigan joyi yo'q va bu tiraj emas, sotib olish bo'lib qoladi.
                          ? "Bu mukofotning yagona kartasi sizda"
                          : `Sizda ${p.mine} ta karta bor — imkoniyat ${p.chancePct ?? 0}%`)
                        : fastPath(p.price - state.ball, state.hints.referComboBall, state.hints.rideBall)}
                    </div>
                  )}
                  {/* Limit xariddan OLDIN aytiladi — avval mijoz unga faqat tugmani bosgandan
                      keyin duch kelardi ("limitga yetdingiz", raqamsiz). */}
                  {p.mine > 0 && p.mine >= state.hints.maxPerPrize && (
                    <div className="oyk-vcard-path">⚖️ Bu mukofotdan limitga yetdingiz ({state.hints.maxPerPrize} ta)</div>
                  )}
                  {/* 🎯 Maqsad qilish + chipta olish BITTA qatorda. Avval ikkalasi ham butun
                      enlik blok edi: har kartada ikkita bir xil vaznli tugma turib, qaysi biri
                      ASOSIY harakat ekani ko'rinmasdi (5 sovrin = 10 ta baland tugma devori).
                      Endi ierarxiya ko'z bilan o'qiladi: maqsad — kichik chip, chipta — asosiy. */}
                  <div className="oyk-vcard-acts">
                    {!p.soldOut && (
                      state.goalPrizeKey === p.key
                        ? <div className="oyk-goal-on">🎯 Maqsad</div>
                        : <button type="button" className="oyk-goal-btn" onClick={() => void setGoal(p)}>🎯 Maqsad</button>
                    )}
                    {/* 🚕 `needsRide` tugmaning O'ZIDA aytiladi — server bu holatda `no_ride`
                        qaytaradi, ekran esa avval bu haqda hech narsa demasdi va mijoz uni
                        faqat "Tasdiqlash" dan KEYIN bilib olardi (G3). */}
                    <button
                      type="button"
                      className={`oyk-vbtn${affordable && !p.soldOut && !needsRide ? " is-on" : ""}${p.soldOut ? " is-soldout" : locked ? " is-frozen" : ""}`}
                      onClick={() => tapPrize(p)}
                    >
                      {p.soldOut ? "❌ O'rinlar tugadi"
                        : locked ? "🔒 Yopildi"
                        : needsRide ? "🚕 Avval bitta safar qiling"
                        : p.mine > 0 ? `🎟 Yana ol — ${p.price} ball`
                        : affordable ? `🎟 Karta ol — ${p.price} ball`
                        : `${p.price - state.ball} ball qoldi`}
                    </button>
                  </div>
                </div>
              );
            })}
            {/* ⚠️ Bu qator endi HAQIQAT: final-48 serverda ham qulflangan (OYIN_FINAL_LOCK_MS).
                Avval faqat mijoz tomonidagi bo'yoq edi — tugma "muzlagan" derdi, xarid o'tardi. */}
            <div className="oyk-sched">
              <span className="oyk-sched-emoji">📅</span>
              <div className="oyk-sched-text">
                <b>Oxirgi 48 soat:</b> karta olish yopiladi — ro'yxat mukofot kuniga qotadi<br />
                <b>Davr oxirida:</b> MUKOFOT KUNI — Telegram jonli efirida 🔴
              </div>
            </div>
            {/* 📋 Qoidalarga IKKINCHI yo'l (DIZAYN_QOIDALARI #4: har bo'limga kamida ikki
                kirish). Mijoz ballini AYNAN shu tabda sarflaydi — rasmiy shartlar shu qaror
                oldida qo'l ostida turishi kerak, "?" tugmasining ichida yashiringan emas. */}
            <button type="button" className="oyk-info-link" onClick={() => { haptic(); setSheet("rules"); }}>
              <span>📋 Dastur qoidalari</span>
              <span aria-hidden="true">›</span>
            </button>
          </>
        )}

        {/* 🤝 GAP-JAMOA — gashtak modeli. Jamoa tabining TEPASIDA: bu do'st-ro'yxatidan
            kuchliroq mexanika (jamoa umumiy ishlaydi, navbatchi oladi) va u birinchi
            ko'rinishi kerak. Ball KO'CHIRILMAYDI — bonusni tizim yaratadi. */}
        {tab === "jamoam" && !ended && (
          <div className="oyk-jamoa">
            {jamoa === null ? (
              <div className="oyk-jamoa-empty">Yuklanmoqda…</div>
            ) : jamoa.jamoa ? (
              <>
                <div className="oyk-jamoa-head">
                  <div>
                    <div className="oyk-jamoa-name">🤝 {jamoa.jamoa.name}{jamoa.jamoa.isLeader && <span className="oyk-jamoa-crown" title="Siz boshliqsiz">👑</span>}</div>
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
                    <>🎯 <b>Bu oy NAVBAT SIZDA</b> — jamoa {jamoa.jamoa.ridesThisMonth} safar qildi, sizga <b>{jamoa.jamoa.navbatchiBall} ball</b></>
                  ) : (
                    <>Bu oy navbat: <b>{jamoa.jamoa.members.find((m) => m.isNavbatchi)?.name ?? "—"}</b> · jamoa {jamoa.jamoa.ridesThisMonth} safar qildi</>
                  )}
                </div>
                <div className="oyk-jamoa-list">
                  {jamoa.jamoa.members.map((m) => (
                    <div key={m.memberId} className={`oyk-jamoa-row${m.isNavbatchi ? " is-turn" : ""}`}>
                      <span className="oyk-jamoa-who">{m.isNavbatchi ? "🎯" : m.hadTurn ? "✓" : "•"} {m.isTest && "🧪 "}{m.name}{m.isLeader && <span className="oyk-jamoa-crown" title="Boshliq">👑</span>}</span>
                      <span className="oyk-jamoa-rides">{m.ridesThisMonth} safar · {m.ballEarnedTotal} ball</span>
                      {jamoa.jamoa!.isLeader && !m.isLeader && (
                        <button type="button" className="oyk-jamoa-kick" disabled={jamoaBusy} title="Chiqarish" onClick={() => { void doGashtakKick(m.memberId); }}>✕</button>
                      )}
                    </div>
                  ))}
                </div>
                <div className="oyk-jamoa-note">
                  Har oy navbat keyingi odamga o'tadi. Jamoaning umumiy safarlari navbatchiga ball olib keladi —
                  har safar <b>{jamoa.jamoa.ballPerRide} ball</b>, oyiga eng ko'pi {jamoa.jamoa.maxBall}.
                  {jamoa.jamoa.members.length < jamoa.minSize && <> Jamoa {jamoa.minSize} kishidan boshlanadi — yana {jamoa.minSize - jamoa.jamoa.members.length} kishi qo'shilsin.</>}
                </div>
                <div className="oyk-jamoa-foot">
                  {jamoa.jamoa.isLeader && (
                    <button type="button" className="oyk-jamoa-manage" disabled={jamoaBusy} onClick={() => { haptic(); setSheet("gashtak"); }}>⚙️ Boshqarish</button>
                  )}
                  <button type="button" className="oyk-jamoa-leave" disabled={jamoaBusy} onClick={() => { void doJamoa("leave"); }}>Jamoadan chiqish</button>
                </div>
              </>
            ) : (
              <>
                <div className="oyk-jamoa-name">🤝 Gashtak</div>
                <div className="oyk-jamoa-note">
                  {jamoa.minSize}–{jamoa.maxSize} kishilik jamoa tuzing. Har oy navbat bitta a'zoga o'tadi va
                  jamoaning umumiy safarlari <b>o'sha navbatchiga</b> ball olib keladi. Keyingi oy — boshqasiga.
                </div>
                <div className="oyk-jamoa-acts">
                  <input className="oyk-jamoa-inp" value={jamoaInput} onChange={(e) => setJamoaInput(e.target.value)} placeholder="Jamoa nomi yoki kod" maxLength={40} />
                  <button type="button" className="oyk-jamoa-btn" disabled={jamoaBusy || jamoaInput.trim().length < 2} onClick={() => { void doJamoa("create", jamoaInput.trim()); }}>Tuzish</button>
                  <button type="button" className="oyk-jamoa-btn is-ghost" disabled={jamoaBusy || jamoaInput.trim().length < 4} onClick={() => { void doJamoa("join", jamoaInput.trim()); }}>Qo'shilish</button>
                </div>
              </>
            )}
          </div>
        )}

        {/* 🎟 CHIPTALARIM — endi tab. Chipta "ko'rinadigan buyum" (YAKUNIY DIZAYN §2):
            global noyob raqam, sovrin, tiraj sanasi va holati. */}
        {tab === "tickets" && (
          <>
            <div className="oyk-v-head">
              <div className="oyk-v-title">🎟 Kartalarim</div>
              {tickets && <div className="oyk-rail-sub">{tickets.tickets.length} ta</div>}
            </div>
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
                  <div key={`${t.prizeKey}-${t.gno}`} className={`oyk-tkt${t.test ? " is-test" : ""}`}>
                    <div className="oyk-tkt-stub">
                      {/* 🧪 TEST chipta OCHIQ belgilanadi. Yashirilsa ega o'z sinov chiptasini
                          haqiqiy deb o'ylab tirajni kutardi va "nega yutmadim" savoli javobsiz
                          qolardi (DIZAYN_QOIDALARI: ekran yolg'on va'da bermaydi). */}
                      <div className="oyk-tkt-brand">{t.test ? "🧪 TEST KARTA — QATNASHMAYDI" : "BIRJOY SODIQLIK KARTASI"}</div>
                      <div className="oyk-tkt-no">№ {t.gno}</div>
                      <div className="oyk-tkt-side">{t.gno}</div>
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
                        {/* ⚠️ Yorliq ATAYLAB qisqa («Mukofot kuni:» EMAS). 320px ekranda o'lchandi:
                            «Mukofot kuni: 14-sentabr, 20:00» ikki qatorga tushib kartani
                            140.5px dan 155.5px ga cho'zardi va skeleton bilan mos kelmasdi
                            (DIZAYN_QOIDALARI #11). «Mukofot:» bilan balandlik eski holicha. */}
                        <div className="oyk-tkt-when">Mukofot: {uzDate(tickets.drawIso)}{drawTime ? `, ${drawTime}` : ""}</div>
                      </div>
                      {/* Holat QOTIRILGAN "AKTIV" emas — mukofot kunidan keyin karta aktiv EMAS.
                          «QATNASHDI» ham o'lchandi — u kengroq bo'lib sana qatorini ikkiga bo'lardi. */}
                      <span className={`oyk-tkt-badge${ended ? " is-done" : ""}`}>{ended ? "TUGADI" : "KUCHDA"}</span>
                    </div>
                    {/* 🎟 2026-08-06 (ega qarori): FAQAT hozircha chegaraga yetmagan (tirajga
                        tayyor EMAS) sovrindan bekor qilish mumkin — ball "abadiy band" bo'lib
                        qolmasin. G'olib bo'lishi mumkin kartani bekor qilish TAQIQ. */}
                    {!t.willDraw && !t.test && !ended && (
                      <button type="button" className="oyk-tkt-cancel" onClick={() => void cancelTicket(t.gno)}>
                        🛡 Bu sovrin hozircha chegaraga yetmagan — bekor qilish (ball qaytadi)
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

        {tab === "jamoam" && (
          <>
            <div className="oyk-j-title">👥 Jamoam <span className="oyk-j-count">({jamoam?.friends.length ?? "…"})</span></div>
            {jamoamErr ? (
              /* Tarmoq xatosi ≠ "do'stingiz yo'q" (G8) */
              <div className="oyk-load-err">
                <div className="oyk-load-err-tx">Jamoangizni yuklab bo'lmadi — bu do'stlaringiz yo'q degani EMAS, shunchaki aloqa uzildi.</div>
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
                {jamoam.friends.map((f) => (
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
                        onClick={() => void inviteFriend(`${f.name}, birinchi safaringni qil — men senga BirJoy'ni shuning uchun tashlagandim 🚕🎁`)}
                      >🚕 Turtki</button>
                    ) : (
                      <button
                        type="button" className="oyk-wake"
                        onClick={() => void inviteFriend(`${f.name}, yur birga — menga ball, senga sovg'a 🎁`)}
                      >⏰ Uyg'ot</button>
                    )}
                  </div>
                ))}
              </div>
            )}
            {/* IKKITA SUMMA ALOHIDA (YAKUNIY DIZAYN §7). Bitta yig'indi o'yinning asosiy
                g'oyasini yashiradi: bir martalik bonus TUGAYDI, do'st safaridan keladigan oqim
                esa TUGAMAYDI. Mijoz shu farqni raqamda ko'rmasa "do'st chaqirish" bir martalik
                ish bo'lib tuyuladi — aslida butun iqtisod ikkinchi ustunga tayanadi. */}
            {jamoam && jamoam.friends.length > 0 && (
              <div className="oyk-jsum">
                <div className="oyk-jsum-row">
                  <span className="oyk-jsum-lb">🎁 Bir martalik mukofot<small>ulanish + birinchi safar</small></span>
                  <b>+{jamoam.oneTimeBall}</b>
                </div>
                <div className="oyk-jsum-row is-flow">
                  <span className="oyk-jsum-lb">🔁 Do'stlar safaridan<small>cheksiz — ular yurgani sari o'sadi</small></span>
                  <b>+{jamoam.rideBall}</b>
                </div>
                <div className="oyk-jsum-row is-total">
                  <span className="oyk-jsum-lb">{jamoam.friends.length} do'stdan jami</span>
                  <b>+{jamoam.totalBall} ball</b>
                </div>
              </div>
            )}
            <div className="oyk-j-hint">💡 Taksi <b>KO'P chaqiradigan</b> tanishingizni chaqiring — u sizga eng ko'p ball olib keladi</div>
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
            {!ended && state.story.ballEach > 0 && (
              <div className="oyk-poster" ref={storyAnchorRef}>
                <div className="oyk-poster-head">
                  <span className="oyk-poster-title">📸 Hikoya qo'y — <b>+{state.story.ballEach} ball</b></span>
                  <span className="oyk-poster-count">{state.story.approved}/{state.story.limit}</span>
                </div>
                {state.story.approved >= state.story.limit ? (
                  <div className="oyk-poster-note">✅ Bu davrda limitga yetdingiz — rahmat!</div>
                ) : state.story.pending ? (
                  <div className="oyk-poster-note">⏳ Tekshiruvda — 24 soat ichida javob beramiz</div>
                ) : (
                  <>
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
                  </>
                )}
              </div>
            )}
          </>
        )}

        <div className="oyk-sponsor">
          <div className="oyk-sponsor-logo">{vitrina.sponsor.name[0] ?? "B"}</div>
          <div className="oyk-sponsor-text">Dastur homiysi — <b>{vitrina.sponsor.name}</b></div>
        </div>
        <div className="oyk-legal">Sodiqlik kartasi — ishtirok huquqi, mukofot kafolati emas. Mukofot kuni davr oxirida jonli efirda.</div>
      </div>

      <div className="oyk-tabs">
        {/* 🎟 "Chiptalarim" varaqdan TABGA chiqdi — chipta endi o'yinning asosiy obyekti
            (YAKUNIY DIZAYN §2), varaqda yashirib bo'lmaydi. */}
        {([["home", "🎮", "Dastur"], ["vitrina", "🎁", "Mukofotlar"], ["tickets", "🎟", "Kartalarim"], ["jamoam", "👥", "Jamoam"]] as const).map(([key, icon, label]) => (
          <button key={key} type="button" className={`oyk-tab${tab === key ? " is-active" : ""}`} onClick={() => { haptic(); setTab(key); }}>
            <span className="oyk-tab-icon">{icon}</span>
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

            {/* 🔔 QO'NG'IROQ — ball qayerdan kelgani. Reyting shu yerda edi va u ball
                QOLDIG'I bo'yicha saralanardi: chipta olgan odamning o'rni tushardi, ya'ni
                to'g'ri xatti-harakat jazolanardi (ega qarori — butunlay olib tashlandi). */}
            {/* 🎮 "Qanday ishlaydi?" — ega maketi 3-rasm: 5 qadam. Raqamlar KNOBDAN va
                katalogdan keladi, qotirilmagan (ega narxni o'zgartirsa matn ham o'zgaradi). */}
            {sheet === "how" && (
              <>
                {/* Sarlavhalar bir oilaga keltirildi: har varaq "emoji + savol" shaklida
                    (avval biri "Qanday ishlaydi?", biri "💡 Ball qanday yig'iladi" — emojili
                    va emojisiz aralash edi, ochilgan varaq boshqa ilovadek tuyulardi). */}
                <div className="oyk-sheet-title">🎮 Qanday ishlaydi?</div>
                <div className="oyk-how-lead">Juda oson! 5 qadamda sovg'a olasiz 🎁</div>
                <div className="oyk-how">
                  {([
                    ["🚕", "Safar qiling", `Taksi chaqiring va safar qiling. Har safardan +${state.hints.rideBall} ball olasiz.`],
                    ["🪙", "Ball yig'ing", `Vazifalarni bajaring, do'stlaringizni taklif qiling. Do'stingiz birinchi safarini qilsa +${state.hints.referFirstRideBall} ball.`],
                    ["🎟", "Ballni kartaga almashtiring", cheapest ? `${cheapest.price} ball = 1 ta sodiqlik kartasi. Nechta karta ko'p bo'lsa, imkoniyat shuncha yuqori.` : "Ballni sodiqlik kartasiga almashtirasiz. Nechta karta ko'p bo'lsa, imkoniyat shuncha yuqori."],
                    ["📺", "Mukofot kunida qatnashing", `${drawDateText ? `${drawDateText} — ` : "Davr oxirida "}Telegramda jonli efirda barcha kartalar orasidan mukofot egalari aniqlanadi.`],
                    ["🎁", "Mukofotni qo'lga kiriting", "Mukofot egasi bo'lsangiz, sovg'angizni bepul olib ketasiz!"],
                  ] as const).map(([em, title, body], i) => (
                    <div key={title} className="oyk-how-step">
                      <span className="oyk-how-em">{em}</span>
                      <span className="oyk-how-body">
                        <b><i>{i + 1}</i> {title}</b>
                        <small>{body}</small>
                      </span>
                    </div>
                  ))}
                </div>
                <button type="button" className="oyk-sheet-ok" onClick={() => { haptic(); setSheet(null); }}>
                  Tushunarli, boshlaymiz! 🚀
                </button>
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
              {/* Yordam zanjiri ANIQ raqam bilan. `fastPath` bir martalik yo'lni aytadi
                  (do'st ulash bonusi), bu qator esa DOIMIY oqimni — ikkisi zid emas. */}
              {cheapest && state.hints.referRideBall > 0 && (
                <div className="oyk-ball-chain">
                  🤝 Do'stingiz har yurganda sizga <b>+{state.hints.referRideBall} ball</b> —{" "}
                  {Math.ceil(cheapest.price / state.hints.referRideBall)} ta do'st safari = 1 karta ({cheapest.name}).
                </div>
              )}
              {/* Doimiy qator (YAKUNIY DIZAYN §4). Ball hech qachon pulga aylanmaydi —
                  buni bir marta onboarding'da aytib qo'yish yetarli emas, doim ko'rinib tursin. */}
              {/* Endi bu qator TO'LIQ haqiqat: mavsum oxirida konvertatsiya YO'Q (ega qarori
                  2026-08-03) — ball hech qanday shaklda pulga aylanmaydi. Va kuyishi mavsum
                  DAVOMIDA aytiladi, oxirida to'satdan emas. */}
              <div className="oyk-ball-warn">
                Ball pul emas — faqat sodiqlik kartasi olish uchun.<br />
                Davr oxirigacha sarflanmagan ball yonadi.
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
                    <div className="oyk-chip-row">
                      {jamoa.jamoa.members.map((m) => (
                        <button key={m.memberId} type="button" className={`oyk-chip${gashtakTurnTarget === m.memberId ? " is-active" : ""}`} onClick={() => { haptic(); setGashtakTurnTarget(m.memberId); }}>
                          {m.isTest && "🧪 "}{m.name}{m.isNavbatchi && " · navbatda"}
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
                        <div className="oyk-note-violet">Bu raqam bilan hech kim topilmadi.</div>
                      ) : (
                        <div className="oyk-jamoa-list">
                          {gashtakHits.map((h) => (
                            <div key={h.memberId} className="oyk-jamoa-row">
                              <span className="oyk-jamoa-who">{h.name}</span>
                              {h.alreadyInGroup ? (
                                <span className="oyk-jamoa-rides">band</span>
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
                        <button key={m.memberId} type="button" className={`oyk-chip${gashtakMsgTarget === m.memberId ? " is-active" : ""}`} onClick={() => { haptic(); setGashtakMsgTarget(m.memberId); }}>{m.isTest && "🧪 "}{m.name}</button>
                      ))}
                    </div>
                    <textarea className="oyk-gashtak-msg" value={gashtakMsgText} onChange={(e) => setGashtakMsgText(e.target.value)} placeholder="Masalan: bu oy yana 2 marta safar qilsak yetadi 🚕" maxLength={300} rows={3} />
                    <button type="button" className="oyk-jamoa-btn" disabled={jamoaBusy || !gashtakMsgText.trim() || gashtakMsgTarget == null} onClick={() => { void doGashtakMessage(); }}>Yuborish</button>
                  </div>
                )}

                {gashtakSheetTab === "settings" && (
                  <div className="oyk-gashtak-block">
                    <div className="oyk-gashtak-label">⚙️ Sozlama</div>
                    <div className="oyk-gashtak-danger">
                      <button type="button" className="oyk-jamoa-copy is-ghost" disabled={jamoaBusy} onClick={() => { void doGashtakRotate(); }}>🔄 Kodni yangilash</button>
                      <button type="button" className="oyk-jamoa-leave" disabled={jamoaBusy} onClick={() => { void doGashtakDisband(); }}>🗑 Guruhni tarqatish</button>
                    </div>
                  </div>
                )}

                <button type="button" className="oyk-sheet-ok" onClick={() => { haptic(); setSheet(null); setGashtakHits(null); setGashtakSearchPhone(""); setGashtakMsgTarget(null); setGashtakMsgText(""); setGashtakSheetTab("ball"); }}>Yopish</button>
              </>
            )}

            {/* ❓ Ma'lumot to'plami (YAKUNIY DIZAYN §1) — TAB emas, lekin doim qo'l ostida.
                Avval bularning hammasi onboarding'da bir marta chiqib abadiy yo'qolardi;
                "chipta nima?" savoli esa xarid PAYTIDA, bir hafta o'tib tug'iladi. */}
            {sheet === "info" && (
              <>
                <div className="oyk-sheet-title">❓ Savol-javob</div>
                <div className="oyk-info">
                  {/* ⚠️ Bu yerda "🎮 Qanday ishlaydi" bloki turardi — ayni sarlavha ALOHIDA
                      varaqda ham bor (5 qadamli "Qanday ishlaydi?"). Bitta savolga ikki joyda
                      ikki xil javob = qaysi biri to'liq ekani noaniq. Endi javob bitta joyda,
                      bu yerda esa unga OLIB BORADIGAN qator turadi. */}
                  <button type="button" className="oyk-info-link" onClick={() => { haptic(); setSheet("how"); }}>
                    <span>🎮 Qanday ishlaydi — 5 qadam</span>
                    <span aria-hidden="true">›</span>
                  </button>
                  <div className="oyk-info-b">
                    <div className="oyk-info-t">🎟 Sodiqlik kartasi nima</div>
                    <div className="oyk-info-x">
                      Sodiqlik kartasi — <b>mukofot kunida qatnashish huquqi</b>, mukofot kafolati emas.
                      Har kartaning o'z raqami bor va u <b>Kartalarim</b> tabida doim turadi.
                      Bir mukofotga nechta kartangiz bo'lsa, imkoningiz shuncha yuqori.
                    </div>
                  </div>
                  <div className="oyk-info-b">
                    <div className="oyk-info-t">📺 Mukofot kuni nima</div>
                    <div className="oyk-info-x">
                      {tickets?.drawIso || state.season.endIso
                        ? <>Davr tugagach — <b>{uzDate(tickets?.drawIso ?? state.season.endIso)}{drawTime ? `, ${drawTime}` : ""}</b> — </>
                        : <>Davr tugagach </>}
                      Telegram kanalimizda jonli efir bo'ladi. Mukofot egalari kartalar orasidan
                      tasodifiy aniqlanadi, hamma ko'rib turadi. Mukofotga ega bo'lsangiz — botdan
                      darhol xabar keladi.
                    </div>
                  </div>
                  {/* 📋 Bu yerda 5 qatorlik "Qoidalar" bloki turardi (S4'da ALMASHTIRILDI).
                      U sovg'ali aksiya uchun MAJBURIY bandlarning birortasini ham qamramasdi:
                      tashkilotchi kim, muddat qachon, mukofotlar nechta, mukofot qayerda va
                      qachon topshiriladi, kim qatnasha olmaydi. Qisqacha nusxa SAQLANMADI —
                      bitta savolga ikki joyda ikki xil javob turishi qaysi biri rasmiy ekanini
                      noaniq qiladi (yuqoridagi "Qanday ishlaydi" saboqi bilan bir xil qoida). */}
                  <button type="button" className="oyk-info-link" onClick={() => { haptic(); setSheet("rules"); }}>
                    <span>📋 Dastur qoidalari — rasmiy hujjat</span>
                    <span aria-hidden="true">›</span>
                  </button>
                </div>
                <button type="button" className="oyk-sheet-ok" onClick={() => { haptic(); setSheet(null); }}>Yopish</button>
              </>
            )}

            {/* 🎟 SOVRIN TAFSILOTI (YAKUNIY DIZAYN §7): katta rasm · o'lchangan tanqislik ·
                "Sizning ballingiz" · MIQDOR (max N) · "Xariddan keyin qoladi" · katta tugma ·
                IKKI QATORLI huquqiy izoh. Alohida ekran o'rniga shu varaq — bir bosish kam,
                mazmun bir xil (ega tasdiqlagan §7 tarkibi to'liq shu yerda). */}
            {sheet === "buy" && buyPrize && (() => {
              const maxQty = Math.max(1, Math.min(state.hints.maxPerPrize - buyPrize.mine, buyPrize.remaining, Math.floor(state.ball / buyPrize.price)));
              const qty = Math.min(buyQty, maxQty);
              const total = buyPrize.price * qty;
              const sc = scarcity(buyPrize);
              return (
              <>
                <div className="oyk-sheet-title">🎟 Kartani olasizmi?</div>
                {/* KATTA rasm — avval 52px miniatyura edi; sovrin xarid daqiqasida ko'rinsin. */}
                <div className="oyk-buy-hero">
                  {buyPrize.photoUrl && !badPhoto.has(buyPrize.key)
                    ? <img src={buyPrize.photoUrl} alt="" onError={() => markBadPhoto(buyPrize.key)} />
                    : <span className="oyk-buy-hero-emoji">{buyPrize.icon}</span>}
                  <div className="oyk-buy-hero-fade" />
                  <div className="oyk-buy-hero-name">{buyPrize.name}</div>
                  {buyPrize.valueLabel && <div className="oyk-buy-hero-val">{buyPrize.valueLabel}</div>}
                </div>
                {sc !== "none" && (
                  <div className={`oyk-scarce is-${sc}`}>
                    {sc === "hot" ? `🔥 ${buyPrize.remaining} ta qoldi — tugayapti` : `${buyPrize.remaining} ta qoldi`}
                  </div>
                )}
                {/* MIQDOR — avval 3 ta chipta uchun butun oqim (karta→varaq→tasdiq→bayram) uch
                    marta takrorlanardi. Limit ham shu yerda RAQAM bilan aytiladi. */}
                {maxQty > 1 && (
                  <div className="oyk-qty">
                    <span className="oyk-qty-lb">Nechta?</span>
                    <div className="oyk-qty-btns">
                      {Array.from({ length: Math.min(maxQty, state.hints.maxPerPrize) }, (_, i) => i + 1).map((n) => (
                        <button key={n} type="button" className={`oyk-qty-b${qty === n ? " is-on" : ""}`} onClick={() => { haptic(); setBuyQty(n); }}>{n}</button>
                      ))}
                    </div>
                    <span className="oyk-qty-max">max {state.hints.maxPerPrize}</span>
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
                  <button type="button" className="oyk-buy-confirm" disabled={busy} onClick={() => void confirmBuy()}>{busy ? "…" : `Tasdiqlash — ${total} ball`}</button>
                  <button type="button" className="oyk-buy-cancel" onClick={() => { setSheet(null); setBuyKey(null); }}>Bekor</button>
                </div>
              </>
              );
            })()}
          </div>
        </div>
      )}

      {celebrate && (
        <div className="oyk-celebrate">
          <div className="oyk-ticket">
            <div className="oyk-ticket-emoji">
              {celebrate.prize.photoUrl && !badPhoto.has(celebrate.prize.key)
                ? <img src={celebrate.prize.photoUrl} alt="" onError={() => markBadPhoto(celebrate.prize.key)} />
                : celebrate.prize.icon}
            </div>
            {/* ⚠️ Bu raqam GLOBAL (`gno`) — Chiptalarim tabida ko'rinadigan raqamning AYNAN
                O'ZI. Avval bu yerda sovrin-ichi tartib raqami turardi ("№0002"), ro'yxatda esa
                global raqam ("№ 729476") — mijoz skrinshot qilgan raqam uniki emas edi. */}
            <div className="oyk-ticket-no">KARTA № {celebrate.ticketNo}</div>
            <div className="oyk-ticket-name">{celebrate.prize.name}</div>
            <div className="oyk-ticket-sub">
              {celebrate.count > 1 ? `${celebrate.count} ta karta oldingiz — ` : ""}mukofot kunida qatnashasiz — davr oxirida jonli efir!
            </div>
          </div>
          <div className="oyk-celebrate-wish">Omad tilaymiz!</div>
          <button type="button" className="oyk-celebrate-btn" onClick={() => setCelebrate(null)}>Zo'r! 🎉</button>
        </div>
      )}

      {onboard !== null && (() => {
        const slides = obSlides(state.hints);
        const cur = slides[onboard];
        if (!cur) return null;
        return (
        <div className="oyk-onboard">
          <div className="oyk-ob-icon">{cur.icon}</div>
          <div className="oyk-ob-step">{onboard + 1} / {slides.length} QADAM</div>
          <div className="oyk-ob-text">{cur.text}</div>
          <div className="oyk-ob-dots">
            {slides.map((sl, i) => <div key={sl.icon} className={`oyk-ob-dot${i === onboard ? " is-active" : ""}`} />)}
          </div>
          <button
            type="button" className="oyk-ob-next"
            onClick={() => (onboard >= slides.length - 1 ? finishOnboard() : setOnboard(onboard + 1))}
          >{onboard === slides.length - 1 ? "Boshladik! 🚀" : "Keyingisi"}</button>
          <button type="button" className="oyk-ob-skip" onClick={finishOnboard}>O'tkazib yuborish</button>
        </div>
        );
      })()}
    </div>
  );
}
