// 🎮 Koson O'yini vizual-QA — FAQAT `#oyindemo` hash bilan (App.tsx). ShopDemo/RstDemo naqshi:
// Telegram initData-autentifikatsiyasiz HAQIQIY OyinView komponent-daraxtini ko'rish uchun.
// OyinView hozircha to'liq mock-holatda ishlaydi (qorong'i qurilish), shuning uchun fetch-intercept
// ham kerak emas — to'g'ridan-to'g'ri render. Ega telefonda QABUL uchun ham shu manzil ishlatiladi:
// https://birjoy.online/#oyindemo (flag `oyin` hali yo'q — jonli mijozga hech narsa ko'rinmaydi).
import { useCallback } from "react";
import { OyinView } from "../oyin";

export function OyinDemoPage() {
  // Onboardingni qayta ko'rish: localStorage belgisi o'chiriladi va sahifa yangilanadi.
  const resetOnboard = useCallback(() => {
    try { localStorage.removeItem("oyk_onboard_seen"); } catch { /* ignore */ }
    window.location.reload();
  }, []);
  return (
    <div style={{ maxWidth: 480, margin: "0 auto", minHeight: "100dvh", position: "relative" }}>
      <OyinView />
      <button
        type="button" onClick={resetOnboard}
        style={{
          position: "fixed", bottom: 8, right: 8, zIndex: 99, fontSize: 10, padding: "6px 8px",
          borderRadius: 8, border: "1px solid rgba(255,255,255,.2)", background: "rgba(0,0,0,.6)",
          color: "rgba(255,255,255,.6)", cursor: "pointer",
        }}
      >QA: onboarding qayta</button>
    </div>
  );
}
