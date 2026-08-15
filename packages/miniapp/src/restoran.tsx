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
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { MeResponse } from "@t1067/shared";
import { getInitData } from "./api";
import { tg } from "./telegram";
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
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, [src]);

  // ‹ Orqaga — ega talabi: «back bo'lsa avto back home». Freym ichidagi navigatsiyaga
  //   aralashmaymiz (cross-origin, o'qiy olmaymiz) — orqaga BirJoy Uy sahifasiga qaytaradi.
  useBackButton(!!src, () => onNav?.("uy"));

  // Telegram'ning yopish-tasdig'i: mijoz buyurtma o'rtasida tasodifan swipe qilib ilovani
  // yopib yubormasin. Tabdan chiqilganda o'chiriladi.
  useEffect(() => {
    const w = tg as unknown as { enableClosingConfirmation?: () => void; disableClosingConfirmation?: () => void } | undefined;
    if (!src) return;
    w?.enableClosingConfirmation?.();
    return () => w?.disableClosingConfirmation?.();
  }, [src]);

  // 🚪 «Yopilsa — avto Uy sahifasi» (ega talabi). Freym ichidagi rasmiy `telegram-web-app.js`
  // hodisalarni ota-oynaga `postMessage(JSON, '*')` bilan yuboradi (SDK manbasida tekshirildi:
  // targetOrigin '*'). Ya'ni hamkor ilovasi `WebApp.close()` chaqirsa — biz eshitamiz.
  // `event.origin` ATAYLAB tekshiriladi: '*' bo'lgani uchun istalgan sayt shu xabarni yubora
  // oladi, biz esa faqat hamkor domenidan kelganini qabul qilamiz.
  useEffect(() => {
    if (!src) return;
    const partnerOrigin = new URL(PARTNER_URL).origin;
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== partnerOrigin) return;
      let type = "";
      try {
        const d = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
        type = (d as { eventType?: string })?.eventType ?? "";
      } catch { return; } // JSON emas — bizniki emas, jim o'tkazamiz
      if (type === "web_app_close") onNav?.("uy");
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
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
        className="rd-frame"
        src={src}
        title={PARTNER_NAME}
        onLoad={() => setLoaded(true)}
        allow="geolocation; clipboard-write; payment"
        // sandbox ATAYLAB qo'yilmadi: hamkor ilovasiga o'z domenidagi to'liq huquq kerak
        // (localStorage/sessionStorage, cookie, to'lov oqimi). U CSP bilan o'zini himoya qiladi.
      />
    </div>
  );
}
