// 🍽 RESTORAN — «ESHIK» ekrani (ega qarori 2026-08-15).
//
// NIMA O'ZGARDI: bu tab ilgari bizning O'Z katalogimiz edi (restoranlar, menyu, savat, checkout,
// operator-navbat — concierge V1, RESTORAN_PLAN.md). Endi taom-buyurtma TO'LIQ hamkorning tashqi
// mini-appida. Bu ekran shuning uchun bitta ish qiladi: hamkor ilovasini ochadi. Bizda menyu ham,
// narx ham, buyurtma ham, holat ham SAQLANMAYDI — hech qanday server chaqiruvi yo'q.
//
// NEGA "ochish" — "ichiga joylash" emas: Telegram bitta mini app ICHIDA boshqa botning mini
// appini ko'rsatishga ruxsat bermaydi, iframe ham ishlamaydi (hamkor bizning freymda o'z
// `initData`sini olmaydi + ko'p host freymni bloklaydi). Yagona ishlaydigan yo'l — deep-link.
import { useEffect, useRef } from "react";
import type { MeResponse } from "@t1067/shared";
import { haptic, tg } from "./telegram";
import { useIsActive } from "./useIsActive";
import "./design/feat/rstDoor.css"; // bu tab ochilgandagina yuklanadi (kritik yo'lda emas)

/** 🔗 HAMKOR ILOVASI HAVOLASI — YAGONA MANBA.
 *
 *  Ikki format qo'llab-quvvatlanadi:
 *   · "https://t.me/<bot>/<app>"  → Telegram MINI APP sifatida ochiladi (initData BERILADI)
 *   · "https://…"                 → Telegram ichki brauzerida oddiy sayt sifatida ochiladi
 *
 *  ⚠️ HOZIRGI QIYMAT — hamkorning DEV mini-app manzili (ega bergan, 2026-08-15). U `t.me` emas,
 *  ya'ni ochilganda Telegram avtorizatsiyasi (initData) UZATILMAYDI. Tekshirildi: shu manzil
 *  brauzerda 401 qaytaradi (ilova o'z API'siga initData bilan kirmoqchi bo'ladi). Ya'ni bu
 *  havola EGA-PREVIEW uchun yaroqli, MIJOZ uchun emas — mijozga chiqarishdan oldin hamkordan
 *  BotFather direct-link'i ("t.me/<bot>/<app>") olinishi SHART. Shu sababli `restoran` bayrog'i
 *  ataylab O'CHIRIQ: tabni faqat ega ko'radi (owner-preview). */
const PARTNER_LINK = "https://mini-app.dev.koson-dasturxon.uz/";
/** Hamkor brendi — matnda ishlatiladi. */
const PARTNER_NAME = "Koson Dasturxon";

/** Havolani ochish. `t.me` bo'lsa — `openTelegramLink` (mini app sifatida, initData bilan).
 *  Oddiy https bo'lsa — `openLink` (Telegram ichki brauzeri). `window.open` faqat Telegramdan
 *  tashqarida ishlaydi (webview'da bloklanadi), shuning uchun u eng oxirgi zaxira.
 *  Xuddi shu naqsh services.tsx:211/255 da ham ishlatilgan. */
function openPartner(): void {
  if (!PARTNER_LINK) return;
  const t = tg as unknown as { openTelegramLink?: (u: string) => void; openLink?: (u: string) => void } | undefined;
  const isTme = /^https:\/\/t\.me\//i.test(PARTNER_LINK);
  if (isTme && t?.openTelegramLink) t.openTelegramLink(PARTNER_LINK);
  else if (!isTme && t?.openLink) t.openLink(PARTNER_LINK);
  else window.open(PARTNER_LINK, "_blank");
}

/** Hero ikonkasi — inline SVG (emoji EMAS: bu bo'lim dizayni emoji'ni taqiqlaydi, eski
 *  rstIcons.tsx bilan bir xil qoida). currentColor bilan ishlaydi, ya'ni tokendan rang oladi. */
function ForkKnifeIcon() {
  return (
    <svg className="rd-hero-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 3v7a2.5 2.5 0 0 0 5 0V3" />
      <path d="M9.5 10v11" />
      <path d="M17.5 3c-1.4 1.6-2 3.4-2 5.5 0 1.6.7 2.6 2 3.1V21" />
    </svg>
  );
}

// Props App.tsx chaqiruvi bilan mos turadi, lekin HECH BIRI ishlatilmaydi: bu ekran shaxsiy
// ma'lumot ko'rsatmaydi va bironta so'rov yubormaydi — u shunchaki eshik.
export function RestoranView(_props: { me: MeResponse; onBanner?: (m: string) => void; openRestaurantId?: number | null }) {
  const active = useIsActive();
  const autoOpened = useRef(false);
  const linked = PARTNER_LINK.length > 0;
  const brand = PARTNER_NAME || "hamkorimiz ilovasi";

  // Ega talabi: «tabga bosganda ochilsin». Tab ochilishi bilan deep-link BIR MARTA o'zi ishga
  // tushadi — foydalanuvchi qo'shimcha bosmaydi. Ekranning o'zi ortda qoladi: Telegram hamkor
  // ilovasini bizning oyna USTIGA ochadi, orqaga qaytilganda BirJoy shu yerda turadi va
  // «Ochish» tugmasi bilan qayta kirish mumkin (avto-ochilish bloklansa ham yo'l ochiq qoladi).
  useEffect(() => {
    if (!active || autoOpened.current || !linked) return;
    autoOpened.current = true;
    openPartner();
  }, [active, linked]);

  return (
    <div className="rd-wrap">
      <div className="rd-hero">
        <ForkKnifeIcon />
        <h2>Kosonda taom buyurtmasi</h2>
        <p>
          Shahardagi restoran va oshxonalardan yetkazib berish — {brand} orqali.
          Buyurtma, to'lov va yetkazish o'sha ilovada boshqariladi.
        </p>
        <div className="rd-chips">
          <span className="rd-chip">Yetkazish</span>
          <span className="rd-chip">Olib ketish</span>
        </div>
      </div>

      {linked ? (
        <div>
          <button className="rd-cta" onClick={() => { haptic(); openPartner(); }}>
            Ochish
          </button>
          <p className="rd-cta-note">Telegram {PARTNER_NAME || "hamkor"} ilovasini ochadi</p>
        </div>
      ) : (
        <>
          {/* Havola yo'q ekan — soxta tugma ko'rsatilmaydi. Sabab ochiq aytiladi. */}
          <div className="rd-soon">
            <span>Bu bo'lim hamkor ilovasiga ulanmoqda. Tayyor bo'lishi bilan shu yerda ochiladi.</span>
          </div>
          <button className="rd-cta" disabled>
            Tez orada
          </button>
        </>
      )}

      <div className="rd-steps">
        <div className="rd-step">
          <span className="rd-step-n">1</span>
          <div>
            <div className="rd-step-t">Ilova ochiladi</div>
            <div className="rd-step-s">Menyu va restoranlar ro'yxati o'sha yerda.</div>
          </div>
        </div>
        <div className="rd-step">
          <span className="rd-step-n">2</span>
          <div>
            <div className="rd-step-t">Buyurtma beriladi</div>
            <div className="rd-step-s">To'lov va yetkazish shartlari hamkor tomonidan belgilanadi.</div>
          </div>
        </div>
        <div className="rd-step">
          <span className="rd-step-n">3</span>
          <div>
            <div className="rd-step-t">BirJoy shu yerda</div>
            <div className="rd-step-s">Orqaga qaytsangiz — taksi, do'kon va qolgan bo'limlar joyida.</div>
          </div>
        </div>
      </div>
    </div>
  );
}
