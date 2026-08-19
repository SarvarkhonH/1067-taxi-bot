// 🍽 RESTORAN — hamkor ilovasi BIZNING ILOVA ICHIDA (ega qarori 2026-08-15).
//
// NIMA: tab ochilsa Koson Dasturxon mini-appi shu yerda, to'liq ekranda ochiladi. Alohida
// brauzer oynasi YO'Q, ortiqcha ekran YO'Q. Orqaga bosilsa — Uy sahifasiga qaytadi.
// Bizda katalog ham, buyurtma ham, holat ham saqlanmaydi va hech qanday server chaqiruvi yo'q.
//
// NEGA FREYM (avvalgi "deep-link" yondashuvidan farqli): ega talabi — «alohida web page
// ochmaslik kerak». Freym buni beradi va orqaga/yopish xatti-harakatini ham BIZ boshqaramiz.
//
// 🔑 AVTORIZATSIYA (401 muammosi): hamkor ilovasi rasmiy `telegram-web-app.js` ni yuklaydi, u
// esa `initData` ni URL HASH'idan o'qiydi (`#tgWebAppData=…`) — Telegram Web klientlari ham
// aynan shunday uzatadi. Shuning uchun freym manziliga BIZNING initData'ni hash orqali
// qo'shamiz. Hamkor tomonda bitta shart bor: bu initData BirJoy botining tokeni bilan
// imzolangan, ya'ni ularning serveri uni BirJoy tokeni bilan ham tekshira olishi kerak
// (batafsil: PROGRESS.md 2026-08-15).
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { MeResponse } from "@t1067/shared";
import { getInitData } from "./api";
import { attachHostBridge, EMPTY_BUTTONS, type BottomButton, type ButtonsState, type HostBridge } from "./rstHost";
import { haptic, tg } from "./telegram";
import { useBackButton } from "./useBackButton";
import "./design/feat/rstDoor.css"; // bu tab ochilgandagina yuklanadi (kritik yo'lda emas)

/** 🔗 Hamkor mini-app manzili — YAGONA MANBA. Bo'sh bo'lsa ekran halol "ulanmoqda" holatini
 *  ko'rsatadi (soxta yuklanish yoki ishlamaydigan tugma emas). */
const PARTNER_URL = "https://mini-app.dev.koson-dasturxon.uz/";
const PARTNER_NAME = "Koson Dasturxon";

/** Freym manzilini yig'ish: hamkor URL + Telegram konteksti hash'da.
 *  `telegram-web-app.js` aynan shu kalitlarni qidiradi — nom bir harf ham farq qilmasligi kerak. */
function buildFrameUrl(): string {
  if (!PARTNER_URL) return "";
  const w = tg as unknown as {
    version?: string; platform?: string; colorScheme?: string; themeParams?: Record<string, string>;
  } | undefined;
  const p = new URLSearchParams();
  const initData = getInitData();
  if (initData) p.set("tgWebAppData", initData);
  p.set("tgWebAppVersion", w?.version || "7.0");
  p.set("tgWebAppPlatform", w?.platform || "web");
  p.set("tgWebAppThemeParams", JSON.stringify(w?.themeParams ?? {}));
  return `${PARTNER_URL}#${p.toString()}`;
}

export function RestoranView({ onNav }: { me: MeResponse; onBanner?: (m: string) => void; onNav?: (t: string) => void }) {
  // Manzil BIR MARTA hisoblanadi: `src` har renderda o'zgarsa freym qayta yuklanardi va
  // foydalanuvchi savatini yo'qotardi.
  const src = useMemo(buildFrameUrl, []);
  const [loaded, setLoaded] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const bridgeRef = useRef<HostBridge | null>(null);
  // Hamkorning MainButton/SecondaryButton holati — Telegram uni O'ZI chizardi, freymda esa
  // chizadigan hech kim yo'q. Shuning uchun holatni olib, tugmani BIZ chizamiz.
  const [btns, setBtns] = useState<ButtonsState>(EMPTY_BUTTONS);
  const barH = (btns.main.isVisible ? 58 : 0) + (btns.secondary.isVisible ? 51 : 0);
  const barRef = useRef(0);
  barRef.current = barH;

  // 📏 Balandlik TAXMIN QILINMAYDI, O'LCHANADI. Qobiq ikki xil: oddiy ekranda tepada topbar +
  // pastda tabbar, mehmon rejimida topbar YO'Q lekin pastda "guest-bar" bor. CSS'da qattiq
  // raqam yozilsa ulardan biri albatta noto'g'ri chiqardi. Shuning uchun freym qutisining
  // haqiqiy `top` i o'lchanadi va qolgan joy CSS o'zgaruvchisiga beriladi (inline stil emas —
  // uslub qoidasi baribir CSS faylida qoladi). BOTTOM_GAP = tabbar/guest-bar uchun zaxira.
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const BOTTOM_GAP = 96; // .content padding-bottom (styles.css:80) — tabbar shu joyni egallaydi
    const apply = () => {
      const top = el.getBoundingClientRect().top;
      el.style.setProperty("--rd-h", `${Math.max(320, window.innerHeight - top - BOTTOM_GAP)}px`);
    };
    apply();
    const onResize = () => {
      apply();
      // O'lcham o'zgardi → hamkor ilovasiga YANGI o'lchamni aytamiz. Aks holda u eski
      // balandlik bo'yicha chizilib qoladi (klaviatura ochilgan/yopilgan holat).
      bridgeRef.current?.sendViewport();
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [src]);

  // ‹ Orqaga. Hamkor O'Z orqaga tugmasini ko'rsatgan bo'lsa (ya'ni ilova ichida qaytadigan
  //   joy bor — masalan restoran menyusidan ro'yxatga) bosish ULARGA uzatiladi. Aks holda
  //   BirJoy Uy sahifasiga chiqiladi (ega talabi). Telegram ham aynan shunday ishlaydi:
  //   avval ilova ichida ortga, tugagach ilovadan chiqish.
  useBackButton(!!src, () => {
    if (bridgeRef.current?.pressBack()) return;
    onNav?.("uy");
  });

  // Telegram'ning yopish-tasdig'i: mijoz buyurtma o'rtasida tasodifan swipe qilib ilovani
  // yopib yubormasin. Tabdan chiqilganda o'chiriladi.
  useEffect(() => {
    const w = tg as unknown as { enableClosingConfirmation?: () => void; disableClosingConfirmation?: () => void } | undefined;
    if (!src) return;
    w?.enableClosingConfirmation?.();
    return () => w?.disableClosingConfirmation?.();
  }, [src]);

  // 🔌 MEZBON KO'PRIGI — eng muhim qism. Freymga solganimizda biz Telegram O'RNIDA turamiz:
  // hamkor ilovasi bizdan ekran o'lchami, xavfsiz-zona va mavzuni SO'RAYDI. Javob bermasak
  // u noto'g'ri o'lchamda chiziladi va ba'zi tugmalar bosilmay qoladi (2026-08-16 da ega
  // aynan shuni ko'rdi). Batafsil protokol va o'lchov: `rstHost.ts`.
  // Yopish hodisasi ham shu ko'prik orqali keladi → Uy sahifasi (ega talabi).
  useEffect(() => {
    const frame = frameRef.current;
    if (!src || !frame) return;
    const bridge = attachHostBridge(
      frame,
      new URL(PARTNER_URL).origin,
      () => onNav?.("uy"),
      setBtns,
      () => barRef.current, // tugmalar egallagan balandlik — viewport shuncha kichik e'lon qilinadi
    );
    bridgeRef.current = bridge;
    return () => {
      bridge.dispose();
      bridgeRef.current = null;
      setBtns(EMPTY_BUTTONS);
    };
  }, [src, onNav]);

  if (!src) {
    return (
      <div className="rd-wrap">
        <div className="rd-soon">
          <span>{PARTNER_NAME || "Hamkor"} ilovasi ulanmoqda. Tayyor bo'lishi bilan shu yerda ochiladi.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="rd-frame-wrap" ref={boxRef}>
      {/* Skeleton REAL layoutni takrorlaydi: to'liq ekran maydoni, spinner emas — freym
          yuklangach joyida hech narsa "sakramaydi". */}
      {!loaded && <div className="rd-frame-skel" aria-hidden="true" />}
      <iframe
        ref={frameRef}
        className="rd-frame"
        src={src}
        title={PARTNER_NAME}
        // Yuklanish tugashi = hamkor SDK'si so'rovlarini yuborib bo'ldi. Ba'zi so'rovlar
        // ko'prik ulanmasidan OLDIN kelib qolishi mumkin (freym tez yuklansa), shuning uchun
        // o'lchamni bu yerda BIR MARTA majburan qayta e'lon qilamiz — javobsiz qolmasin.
        onLoad={() => { setLoaded(true); bridgeRef.current?.sendViewport(); }}
        allow="geolocation; clipboard-write; payment"
        // sandbox ATAYLAB qo'yilmadi: hamkor ilovasiga o'z domenidagi to'liq huquq kerak
        // (localStorage/sessionStorage, cookie, to'lov oqimi). U CSP bilan o'zini himoya qiladi.
      />

      {/* 🔘 Hamkorning asosiy harakat tugmasi (savat / buyurtma berish). Bu Telegramning
          MainButton'i: uni sahifa emas, MEZBON chizadi. Freymda Telegram yo'q — shuning uchun
          BIZ chizamiz, aks holda tugma umuman ko'rinmaydi va bosilmaydi.
          Ranglar hamkordan kelsa o'shani hurmat qilamiz (Telegram ham shunday), kelmasa
          o'z tokenimiz. Qiymat ma'lumot bo'lgani uchun CSS o'zgaruvchisi orqali beriladi. */}
      {(btns.main.isVisible || btns.secondary.isVisible) && (
        <div className="rd-btnbar">
          {btns.secondary.isVisible && (
            <button
              className="rd-btn rd-btn-2"
              disabled={!btns.secondary.isActive || btns.secondary.isProgress}
              onClick={() => { haptic(); bridgeRef.current?.pressSecondary(); }}
              style={btnVars(btns.secondary)}
            >
              {btns.secondary.isProgress ? "…" : btns.secondary.text}
            </button>
          )}
          {btns.main.isVisible && (
            <button
              className="rd-btn"
              disabled={!btns.main.isActive || btns.main.isProgress}
              onClick={() => { haptic(); bridgeRef.current?.pressMain(); }}
              style={btnVars(btns.main)}
            >
              {btns.main.isProgress ? "…" : btns.main.text}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Hamkor bergan ranglarni CSS o'zgaruvchisiga o'giradi (bo'lmasa CSS o'z tokenini ishlatadi). */
function btnVars(b: BottomButton): CSSProperties {
  const v: Record<string, string> = {};
  if (b.color) v["--rd-btn-bg"] = b.color;
  if (b.textColor) v["--rd-btn-fg"] = b.textColor;
  return v as CSSProperties;
}
