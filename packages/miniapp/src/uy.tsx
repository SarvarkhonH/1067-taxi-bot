// 🏠 "Uy" — the taxi-first home tab (default). Light + leaflet-free; the LivingHome map
// version is the flag-gated upgrade. Greeting + balance + taxi CTA + Bugun + quick tiles.
import { useEffect, useState } from "react";
import type { MeResponse, SavedAddressView } from "@t1067/shared";
import { api } from "./api";
import { haptic } from "./telegram";
import { BugunStripView } from "./wallet";
import { HomeGames } from "./homeGames";

export function UyView({ me, onBook, onNav, onBanner }: { me: MeResponse; onBook: () => void; onNav: (t: string) => void; onBanner?: (msg: string) => void }) {
  const [ready, setReady] = useState<number | null>(null);
  const [recent, setRecent] = useState<SavedAddressView[]>([]);
  const [dispatching, setDispatching] = useState<number | null>(null);
  useEffect(() => {
    api
      .missions()
      .then((m) => setReady([...m.daily, ...m.weekly].filter((x) => x.claimable).length))
      .catch(() => undefined);
    api.recentPickups().then(setRecent).catch(() => undefined);
  }, []);

  const repeatRoute = async (a: SavedAddressView) => {
    if (dispatching != null) return;
    haptic();
    setDispatching(a.id);
    try {
      const r = await api.bookingCreate({ pickupId: a.id, pickupName: a.name, lat: a.lat, lng: a.lng });
      if (r.ok && r.live) {
        onBook(); // real dispatch — open the live tracking overlay (Booking3View picks up the active ride)
      } else {
        onBanner?.(r.message ?? (r.ok ? `TEST — ${a.name}` : "Xatolik yuz berdi"));
      }
    } catch {
      onBanner?.("Xatolik yuz berdi — qayta urinib ko'ring");
    } finally {
      setDispatching(null);
    }
  };

  return (
    <div className="view uy-view">
      <div className="uy-hero">
        <div className="uy-greet">Assalomu alaykum, {me.member.fullName.split(" ")[0] || "do'stim"} 👋</div>
        <button className="uy-bal" onClick={() => { haptic(); onNav("wallet"); }} aria-label="Hamyonni ochish">
          <span className="uy-coin">🪙 {me.coins.toLocaleString("ru-RU")}</span>
          <span className="uy-cash">🚕 {me.stats.points.toLocaleString("ru-RU")} so'm cashback</span>
        </button>
      </div>
      <button className="book-cta-hero" onClick={() => { haptic(); onBook(); }}>🚖 Taxi chaqirish</button>
      {recent.length > 0 && (
        <div className="uy-repeat">
          <div className="uy-repeat-label">🔁 Yana shu yo'l</div>
          <div className="uy-repeat-row">
            {recent.map((a) => (
              <button key={a.id + a.name} className="uy-chip" disabled={dispatching != null} onClick={() => repeatRoute(a)}>
                {dispatching === a.id ? "..." : a.name}
              </button>
            ))}
          </div>
        </div>
      )}
      {/* 🎁 invite — top-of-home so a client never hunts for it (was buried under Reyting) */}
      <button className="uy-invite" onClick={() => { haptic(); onNav("invite"); }}>
        <span className="uy-invite-ic">👥</span>
        <span className="uy-invite-txt">
          <b>Do'stni chaqir — pul ishla</b>
          <small>Har do'st uchun bonus · do'stingizga birinchi safar bepul</small>
        </span>
        <span className="uy-invite-arr">→</span>
      </button>
      <BugunStripView me={me} ready={ready} onNav={() => onNav("play")} />
      <div className="uy-tiles">
        <button className="uy-tile" onClick={() => { haptic(); onNav("wallet"); }}>👛<span>Hamyon</span></button>
        <button className="uy-tile" onClick={() => { haptic(); onNav("play"); }}>🎮<span>O'yin</span></button>
        <button className="uy-tile" onClick={() => { haptic(); onNav("market"); }}>🏪<span>Bozor</span></button>
        <button className="uy-tile" onClick={() => { haptic(); onNav("reyting"); }}>🏆<span>Reyting</span></button>
        <button className="uy-tile" onClick={() => { haptic(); onNav("history"); }}>📜<span>Tarix</span></button>
      </div>
      <HomeGames me={me} onBanner={onBanner} />
    </div>
  );
}
