// 🏠 "Uy" — the taxi-first home tab (default). Light + leaflet-free; the LivingHome map
// version is the flag-gated upgrade. Greeting + balance + taxi CTA + Bugun + quick tiles.
import { useEffect, useState } from "react";
import type { MeResponse } from "@t1067/shared";
import { api } from "./api";
import { haptic } from "./telegram";
import { BugunStripView } from "./wallet";

export function UyView({ me, onBook, onNav }: { me: MeResponse; onBook: () => void; onNav: (t: string) => void }) {
  const [ready, setReady] = useState<number | null>(null);
  useEffect(() => {
    api
      .missions()
      .then((m) => setReady([...m.daily, ...m.weekly].filter((x) => x.claimable).length))
      .catch(() => undefined);
  }, []);
  return (
    <div className="view uy-view">
      <div className="uy-hero">
        <div className="uy-greet">Assalomu alaykum, {me.member.fullName.split(" ")[0] || "do'stim"} 👋</div>
        <div className="uy-bal">
          <span className="uy-coin">🪙 {me.coins.toLocaleString("ru-RU")}</span>
          <span className="uy-cash">🚕 {me.stats.points.toLocaleString("ru-RU")} so'm cashback</span>
        </div>
      </div>
      <button className="book-cta-hero" onClick={() => { haptic(); onBook(); }}>🚖 Taxi chaqirish</button>
      {/* 🎁 invite — top-of-home so a client never hunts for it (was buried under Reyting) */}
      <button className="uy-invite" onClick={() => { haptic(); onNav("invite"); }}>
        <span className="uy-invite-ic">🎁</span>
        <span className="uy-invite-txt">
          <b>Do'stni chaqir — pul ishla</b>
          <small>Har do'st uchun sovg'a · do'stingizga birinchi safar bepul</small>
        </span>
        <span className="uy-invite-arr">→</span>
      </button>
      <BugunStripView me={me} ready={ready} onNav={() => onNav("play")} />
      <div className="uy-tiles">
        <button className="uy-tile" onClick={() => { haptic(); onNav("play"); }}>🎮<span>O'yin</span></button>
        <button className="uy-tile" onClick={() => { haptic(); onNav("market"); }}>🏪<span>Bozor</span></button>
        <button className="uy-tile" onClick={() => { haptic(); onNav("reyting"); }}>🏆<span>Reyting</span></button>
        <button className="uy-tile" onClick={() => { haptic(); onNav("wallet"); }}>💰<span>Hamyon</span></button>
      </div>
    </div>
  );
}
