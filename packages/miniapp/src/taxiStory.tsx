// 📖 TAKSI O'RGATUVCHI STORY — 6 karta, Instagram-story tartibida.
//
// NEGA BU MAVZULAR: kartalar ro'yxati `packages/server/src/services/ai/intent.ts:28-45` dagi
// FAQ jadvalidan chiqarilgan — u yerda odamlar HAQIQATDA beradigan savollarga tayyor javoblar
// yozilgan (ya'ni kimdir ularni shunchalik ko'p eshitganki, kodga yozib qo'ygan):
//   • `intent.ts:29` «narx / qancha turadi / tarif»      → 3-karta   (ro'yxatning BIRINCHISI)
//   • `intent.ts:39` «mashina qayerda / qachon keladi»   → 4-karta
//   • `intent.ts:36` «bekor qilish»                      → 5-karta
//   • `intent.ts:30,31` «cashback / tanga»               → 6-karta
//   • `booking3.tsx` coach-mark saboqi + ega kuzatuvi
//     («avtomatik deb o'ylashadi, ba'zan yozishadi»)     → 1-karta
//   • tizimda borar-manzil YO'Q (kas = taksometr)        → 2-karta  (hech qayerda aytilmagan edi)
//
// ATAYLAB CHIQMAGAN kartalar: «tayyor joylardan tanlang» · «xaritadan tanlang» · «izoh yozing»
// — uchtasi BITTA ishning uch yo'li (odam faqat bittasini ishlatadi, 98% yozadi/nomdan tanlaydi),
// uchta karta qilib ko'rsatilsa ishning OSONLIGINI emas MURAKKABLIGINI o'rgatgan bo'lardik; ular
// 1-kartaga bitta jumla bo'lib kirdi. «Yashil tugmani bosing» ham chiqdi — tugma o'zi ko'rinadi.
//
// HALOLLIK (DIZAYN_QOIDALARI #7, #9): 3- va 6-kartadagi HAR RAQAM jonli `/api/booking/info` dan
// keladi. Tarif yo'q bo'lsa 3-karta raqamsiz halol matn ko'rsatadi; cashback 0 bo'lsa 6-karta
// BUTUNLAY chizilmaydi — bo'lmagan pul hech qachon va'da qilinmaydi.
//
// KO'RSATUVCHI-ONLY: bu ekran hech narsa GRANT qilmaydi, hech qanday buyurtma yaratmaydi.
// Yagona harakati — yopilish va (oxirgi kartada) chaqirish ekraniga qaytarish.
//
// ANIMATSIYA: faqat `transform`/`opacity` (+ SVG `stroke-dashoffset` — qoida #16 istisnosi),
// hammasi CSS'da (`b3.css`, `.st-*`). GIF ISHLATILMAYDI: oltita GIF ~2-4 MB bo'lardi va sekin
// tarmoqda birinchi ochilishni bo'g'ardi; CSS varianti ~8 KB. `prefers-reduced-motion` da
// harakat to'xtaydi, MAZMUN qoladi (har karta yakuniy holatida ko'rinadi).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatNumber, RIDE_EMISSION_CAP, type BookingInfoResponse } from "@t1067/shared";
import { haptic } from "./telegram";
import "./design/feat/story.css"; // story ochilgandagina yuklanadi (kritik yo'lda emas)

// Ega jonli sinovda (2026-08-09): «storylar o'qishga ulgurmay tez o'tib ketopti». 5.4s Instagram
// FOTOSURATLARI uchun me'yor — bizda esa sarlavha + 20-25 so'zli matn bor, o'zbek tilida o'qish
// ~9-10 soniya oladi. Vaqt uzaytirildi VA barmoq bosib turilganda TO'XTAYDI (pastdagi hold-pause):
// shoshilmay o'qigan odam kartani ushlab turadi, tez o'qigan o'ngga bosib o'tib ketaveradi.
const STORY_MS = 9500;
const STORY_MS_REDUCED = 13000; // reduced-motion: harakat yo'q, faqat matn → yana ko'proq vaqt

export const STORY_SEEN_KEY = "b3story1";

/** Story ilgari ko'rilganmi? (private-mode'da localStorage yo'q — u holda "ko'rilgan" deb hisoblaymiz,
 *  ya'ni xato tomonga OG'MAYMIZ: har ochilishda qayta chiqib bezor qilmaydi.) */
export function storySeen(): boolean {
  try {
    return localStorage.getItem(STORY_SEEN_KEY) === "1";
  } catch {
    return true;
  }
}

export function markStorySeen(): void {
  try {
    localStorage.setItem(STORY_SEEN_KEY, "1");
  } catch {
    /* private mode — keyingi ochilishda yana chiqadi, zarari yo'q */
  }
}

interface Props {
  info: BookingInfoResponse;
  onClose: () => void;
}

export function TaxiStory({ info, onClose }: Props) {
  const reduced = useMemo(
    () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );

  // 6-karta FAQAT real cashback bo'lsa (DIZAYN_QOIDALARI #9 — va'da qilingan tanga REAL berilishi shart).
  const cashback = info.cashbackPerRide > 0 ? info.cashbackPerRide : 0;
  const cards = useMemo(() => (cashback > 0 ? CARD_IDS : CARD_IDS.slice(0, 5)), [cashback]);
  const n = cards.length;

  const [i, setI] = useState(0);
  const timer = useRef<number | undefined>(undefined);
  // Har kartada animatsiyalarni qayta boshlash uchun: `key` o'zgarsa React tugunni almashtiradi.
  const [run, setRun] = useState(0);

  const close = useCallback(() => {
    markStorySeen();
    onClose();
  }, [onClose]);

  // Qadam FUNKSIONAL yangilanish bilan: tez ketma-ket ikki tap bosilsa ikkalasi ham hisobga
  // olinadi (oddiy `setI(i+1)` bir render ichidagi eski `i`ni o'qib, ikki tapni bittaga
  // aylantirib qo'yardi). Chetlarda TO'XTAYDI — oxirgi kartada story qayta boshlanmaydi.
  const go = useCallback(
    (delta: 1 | -1) => {
      haptic();
      setI((v) => {
        const next = v + delta;
        return next < 0 || next >= n ? v : next;
      });
      setRun((r) => r + 1);
    },
    [n],
  );

  // ⏸ Barmoq bosib turilsa — TO'XTAYDI. Ega e'tirozidan keyingi asosiy yechim: o'qishga
  // ulgurmagan odam ekranni ushlab turadi, qo'yib yuborsa davom etadi. Instagram/WhatsApp
  // odati — o'rgatishga hojat yo'q, odamlar buni allaqachon biladi.
  const [held, setHeld] = useState(false);

  // avtomatik o'tish — oxirgi kartada TO'XTAYDI (odam o'zi yopadi yoki chaqirishga o'tadi)
  useEffect(() => {
    window.clearTimeout(timer.current);
    if (i >= n - 1 || held) return; // ushlab turilgan bo'lsa taymer umuman qo'yilmaydi
    timer.current = window.setTimeout(() => setI((v) => (v < n - 1 ? v + 1 : v)), reduced ? STORY_MS_REDUCED : STORY_MS);
    return () => window.clearTimeout(timer.current);
  }, [i, n, reduced, held]);

  // har karta almashganda animatsiyalar qaytadan boshlansin
  useEffect(() => setRun((r) => r + 1), [i]);

  // Escape / orqaga tugmasi bilan yopish
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close, go]);

  const id = cards[i];
  if (!id) return null; // bo'lmasligi kerak (i doim 0..n-1), lekin indeks-tipini xavfsiz yopamiz

  return (
    <div className="st" role="dialog" aria-modal="true" aria-label="Taksi qanday chaqiriladi">
      <div className="st-bars">
        {cards.map((c, k) => (
          <span key={c} className={`st-bar${k < i ? " done" : k === i ? " now" : ""}`}>
            <i style={k === i ? { animationDuration: `${(reduced ? STORY_MS_REDUCED : STORY_MS) / 1000}s`,
                                  animationPlayState: held ? "paused" : "running" } : undefined} />
          </span>
        ))}
      </div>

      <button className="st-skip" onClick={close}>
        {i >= n - 1 ? "Yopish" : "O'tkazib yuborish"}
      </button>

      {/* Bosish zonalari — chap 38% orqaga, o'ng 62% oldinga (story odati).
          `pointerdown` da ushlab-turish boshlanadi, `pointerup`/`pointercancel`/`pointerleave`
          da tugaydi. Bosib-qo'yib yuborish (oddiy tap) ham ishlaydi: `onClick` alohida keladi. */}
      {(["prev", "next"] as const).map((side) => (
        <button
          key={side}
          className={`st-zone ${side}`}
          aria-label={side === "prev" ? "Orqaga" : "Keyingisi"}
          onPointerDown={() => setHeld(true)}
          onPointerUp={() => setHeld(false)}
          onPointerCancel={() => setHeld(false)}
          onPointerLeave={() => setHeld(false)}
          onClick={() => go(side === "prev" ? -1 : 1)}
        />
      ))}

      <div className="st-card on" key={`${id}-${run}`}>
        <div className="st-stage">{stage(id, info)}</div>
        <div className="st-copy">
          <span className="st-tag">{TAGS[id]}</span>
          <h2 className="st-h">{TITLES[id]}</h2>
          <p className="st-p">{body(id, info, cashback)}</p>
          {i >= n - 1 && (
            <button className="st-cta" onClick={close}>
              Taxi chaqirish
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
type CardId = "joy" | "manzil" | "narx" | "keyin" | "bekor" | "tanga";
const CARD_IDS: CardId[] = ["joy", "manzil", "narx", "keyin", "bekor", "tanga"];

const TAGS: Record<CardId, string> = {
  joy: "1 — joy",
  manzil: "2 — eng muhimi",
  narx: "3 — narx",
  keyin: "4 — keyin nima bo'ladi",
  bekor: "5 — xotirjamlik",
  tanga: "6 — qaytim",
};

const TITLES: Record<CardId, string> = {
  joy: "Qayerdaligingizni o'zimiz topamiz",
  manzil: "Qayerga borishni yozmaysiz",
  narx: "Narx taksometr bo'yicha",
  keyin: "Haydovchi topiladi va yo'lga chiqadi",
  bekor: "Fikringiz o'zgarsa — bekor qilasiz",
  tanga: "Har safardan tanga qaytadi",
};

function body(id: CardId, info: BookingInfoResponse, cashback: number) {
  switch (id) {
    case "joy":
      return "Ilovani ochasiz — eng yaqin joy nomi darrov chiqadi. To'g'ri bo'lsa chaqiraverasiz. Noto'g'ri bo'lsa bir tap bilan boshqasini tanlaysiz yoki nomini yozasiz.";
    case "manzil":
      return (
        <>
          Faqat sizni <b>qayerdan</b> olishimizni aytasiz. Borar manzilni mashinaga o'tirib haydovchiga
          aytasiz — xuddi ko'chada taksi to'xtatgandek.
        </>
      );
    case "narx":
      // Tarif yo'q bo'lsa RAQAM AYTMAYMIZ — halol umumiy matn (DIZAYN_QOIDALARI #7).
      return info.tariff
        ? "Boshlanish to'lovi + bosib o'tilgan km. Hisoblagichni safar davomida ekranda ko'rib turasiz, aniq summa oxirida chiqadi. To'lov naqd yoki karta bilan."
        : "Boshlanish to'lovi + bosib o'tilgan km. Hisoblagichni safar davomida ekranda ko'rib turasiz, aniq summa safar oxirida chiqadi.";
    case "keyin":
      return "Kim kelayotganini, mashinasi qanaqaligini va necha daqiqada yetib kelishini ko'rasiz. Mashina xaritada jonli harakatlanadi — kutib turishingiz shart emas.";
    case "bekor":
      return "Xato bosdingizmi yoki rejangiz o'zgardimi — bir tap bilan bekor qilasiz. Jarima yo'q, to'lov yo'q. Shuning uchun bemalol sinab ko'ring.";
    case "tanga":
      // Ega (2026-08-10): kichik aniq son («+50 tanga») mukofotni arzon ko'rsatadi — YUQORI
      // CHEGARA aytilsin. `RIDE_EMISSION_CAP` — tizimning haqiqiy safar-chegarasi, ya'ni
      // bu matn hech qachon to'lanmaydigan summa va'da qilmaydi (DIZAYN_QOIDALARI #9).
      return (
        <>
          Har safardan <b>{formatNumber(RIDE_EMISSION_CAP)} tangagacha</b> cashback qaytadi —
          safar uzunligi va darajangizga qarab. <b>1 tanga = 1 so'm</b>: keyingi safarda
          ishlatasiz yoki so'mga yechib olasiz.
        </>
      );
  }
}

function stage(id: CardId, info: BookingInfoResponse) {
  switch (id) {
    case "joy":
      return <StageJoy name={info.quickPickup?.name ?? "5-Maktab"} />;
    case "manzil":
      return <StageManzil name={info.quickPickup?.name ?? "5-Maktab"} />;
    case "narx":
      return <StageNarx info={info} />;
    case "keyin":
      return <StageKeyin />;
    case "bekor":
      return <StageBekor />;
    case "tanga":
      return <StageTanga amount={info.cashbackPerRide} />;
  }
}

/** Ikkala xarita-sahnasi uchun umumiy fon — ko'chalar + ikki bino. Faqat bezak (aria-hidden). */
function MapBg({ variant }: { variant: 1 | 2 }) {
  return (
    <div className="st-mapbg">
      <svg viewBox="0 0 290 290" preserveAspectRatio="none" aria-hidden="true">
        <rect width="290" height="290" fill="#EAECF1" />
        <g stroke="#fff" strokeWidth="8" fill="none">
          {variant === 1 ? (
            <>
              <path d="M-5 88 L295 76" /><path d="M-5 208 L295 220" />
              <path d="M78 -5 L66 295" /><path d="M212 -5 L224 295" />
            </>
          ) : (
            <>
              <path d="M-5 108 L295 96" /><path d="M-5 224 L295 236" />
              <path d="M92 -5 L80 295" /><path d="M206 -5 L218 295" />
            </>
          )}
        </g>
        <g fill="#E1E6DF">
          <rect x="96" y="238" width="46" height="34" rx="4" />
          <rect x="150" y="96" width="44" height="32" rx="4" />
        </g>
        {variant === 2 && <path className="st-route" d="M34 218 L96 214 L104 140 L182 132 L188 96" />}
      </svg>
    </div>
  );
}

function StageJoy({ name }: { name: string }) {
  return (
    <div className="st-scene">
      <MapBg variant={1} />
      <span className="st-ring" />
      <span className="st-ring b" />
      <span className="st-ring c" />
      <span className="st-gdot" />
      <div className="st-namecard">
        <div className="st-nc-lb">✓ Siz shu yerdasiz</div>
        <div className="st-nc-nm">{name}</div>
      </div>
      <span className="st-swap">almashtirish</span>
    </div>
  );
}

function StageManzil({ name }: { name: string }) {
  return (
    <div>
      <div className="st-f from">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z" />
        </svg>
        Qayerdan: {name}
      </div>
      <div className="st-f to">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M5 3h2v18H5zM8 4h11l-2.5 4L19 12H8z" />
        </svg>
        Qayerga borasiz?
        <span className="st-strike" />
      </div>
      <div className="st-say">
        <span className="st-av">🧑‍✈️</span>
        <span className="st-bub">Manzilni haydovchining o'ziga aytasiz — u sizni olib boradi.</span>
      </div>
    </div>
  );
}

function StageNarx({ info }: { info: BookingInfoResponse }) {
  const t = info.tariff;
  // Hisoblagich namunasi: HAR raqam real tarifdan hisoblanadi (boshlanish + k×km), qo'lda yozilmaydi.
  const roll = t
    ? [0, 0.7, 1.5, 2.2, 3].map((km) => t.minimalPayment + Math.round((t.perKmCity * km) / 100) * 100)
    : null;
  return (
    <div className="st-meter">
      <div className="st-mlb">Taksometr · hisoblanyapti</div>
      {t && roll ? (
        <>
          <div className="st-mnum">
            <div className="st-mroll">
              {roll.map((v, k) => (
                <span key={k}>{formatNumber(v)}</span>
              ))}
            </div>
          </div>
          <div className="st-mlb st-dim">so'm</div>
          <div className="st-rate">
            <div className="st-rrow"><span>Boshlanish</span><b>{formatNumber(t.minimalPayment)}</b></div>
            <div className="st-rrow"><span>Har km</span><b>{formatNumber(t.perKmCity)}</b></div>
            <div className="st-rrow"><span>Kutish · daqiqasiga</span><b>{formatNumber(t.perMinute)}</b></div>
          </div>
        </>
      ) : (
        // Tarif kelmadi — SOXTA RAQAM CHIZMAYMIZ (DIZAYN_QOIDALARI #7).
        <div className="st-rate">
          <div className="st-rrow"><span>Narx</span><b>taksometr bo'yicha</b></div>
          <div className="st-rrow"><span>Aniq summa</span><b>safar oxirida</b></div>
        </div>
      )}
    </div>
  );
}

function StageKeyin() {
  return (
    <div className="st-scene">
      <MapBg variant={2} />
      <span className="st-radar" />
      <span className="st-radar b" />
      <span className="st-gdot st-gdot-far" />
      <span className="st-carmv">🚕</span>
      <div className="st-drv">
        <span className="st-av st-av-sm">🧑‍✈️</span>
        <span>
          <span className="nm">Haydovchi topildi</span>
          <br />
          <span className="sb">Yo'lda · ~2 daqiqa</span>
        </span>
      </div>
    </div>
  );
}

function StageBekor() {
  return (
    <div>
      <div className="st-cancel">
        Bekor qilish
        <span className="st-finger">👆</span>
      </div>
      <div className="st-freed">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm-1.2 14.6l-4.2-4.2 1.7-1.7 2.5 2.5 5.6-5.6 1.7 1.7-7.3 7.3z" />
        </svg>
        Bekor qilindi · to'lov yo'q
      </div>
    </div>
  );
}

function StageTanga({ amount }: { amount: number }) {
  return (
    <div className="st-scene st-scene-gold">
      <span className="st-coin a">🪙</span>
      <span className="st-coin b">🪙</span>
      <span className="st-coin c">🪙</span>
      <div className="st-wal">
        <div className="lb">Har safardan</div>
        <div className="vl">{formatNumber(RIDE_EMISSION_CAP)} 🪙 gacha</div>
      </div>
    </div>
  );
}
