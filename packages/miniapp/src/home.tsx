// V1 — Living AI home. A living map of Koson (live cars drifting, your area) with a
// named, time-aware greeting and your usual ride one tap away. Reuses booking3's proven
// bundled-Leaflet + Google tiles (works in UZ). Behind feature:livinghome (default OFF).
import { useEffect, useRef, useState } from "react";
import type { HomeResponse, MeResponse } from "@t1067/shared";
import { api } from "./api";
import { ensureLeaflet } from "./leaflet";
import { haptic } from "./telegram";
import { WalletView } from "./wallet";

const TILE_URL = "https://mt{s}.google.com/vt/lyrs=m&hl=uz&x={x}&y={y}&z={z}";
const TILE_SUBDOMAINS = ["0", "1", "2", "3"];

function greet(hour: number): { hi: string; sub: string } {
  if (hour < 6) return { hi: "Salom", sub: "Kech bo'ldi — uyga eson-omon yeting" };
  if (hour < 12) return { hi: "Xayrli tong", sub: "Bugun qayerga yo'l olamiz?" };
  if (hour < 18) return { hi: "Xayrli kun", sub: "Bir tugma — mashina eshik oldida" };
  return { hi: "Xayrli kech", sub: "Uyga? Bir bosishda chaqiramiz" };
}

export function LivingHome(props: {
  me: MeResponse;
  onBook: () => void;
  onNav: (tab: string) => void;
  onBanner: (m: string) => void;
  reload: () => void;
}) {
  const { me, onBook, onNav, onBanner, reload } = props;
  const [home, setHome] = useState<HomeResponse | null>(null);
  const [showWallet, setShowWallet] = useState(false);
  const mapRef = useRef<HTMLDivElement>(null);
  const map = useRef<unknown>(null);

  useEffect(() => {
    api.home().then(setHome).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (showWallet || !home || !mapRef.current || map.current) return;
    let alive = true;
    ensureLeaflet().then((L) => {
      if (!alive || !mapRef.current || map.current) return;
      const m = L.map(mapRef.current, { zoomControl: false, attributionControl: false, scrollWheelZoom: false }).setView(
        [home.center.lat, home.center.lng],
        14,
      );
      L.tileLayer(TILE_URL, { subdomains: TILE_SUBDOMAINS, maxZoom: 20 }).addTo(m); // no crossOrigin: WebView tile-load fix (see booking3)
      const layer = L.layerGroup().addTo(m);
      for (const c of home.carPins) {
        const icon = L.divIcon({
          className: "",
          html: `<div class="lh-car${c.busy ? " busy" : ""}">${c.busy ? "🚕" : "🟢"}</div>`,
          iconSize: [26, 26],
          iconAnchor: [13, 13],
        });
        layer.addLayer(L.marker([c.lat, c.lng], { icon }));
      }
      map.current = m;
    });
    return () => {
      alive = false;
    };
  }, [home, showWallet]);

  if (showWallet) {
    return (
      <div className="view">
        <button className="lh-back" onClick={() => { haptic(); setShowWallet(false); }}>← Uy</button>
        <WalletView me={me} onBanner={onBanner} reload={reload} onBook={onBook} onNav={onNav} />
      </div>
    );
  }

  const g = greet(new Date().getHours());
  const name = home?.name ?? me.member.fullName.split(" ")[0] ?? "do'stim";
  return (
    <div className="living-home">
      {/* map is its own flexible block (flex:1) so it shrinks to leftover space — the
          controls below always fit above the tabbar, on any phone height */}
      <div className="lh-mapwrap">
        <div className="lh-map" ref={mapRef} />
        <div className="lh-veil" />
        <div className="lh-top">
          <div className="lh-hi">{g.hi}, {name} 👋</div>
          <div className="lh-sub">{g.sub}</div>
          <div className="lh-chips">
            <span className="lh-chip">🪙 {(home?.coins ?? me.coins).toLocaleString("ru-RU")}</span>
            {(home?.streak ?? 0) > 0 && <span className="lh-chip hot">🔥 {home!.streak}</span>}
            <span className="lh-chip">🚖 {home?.freeCars ?? 0} bo'sh</span>
          </div>
        </div>
      </div>
      <div className="lh-bottom">
        {home?.usualRide && (
          <button className="lh-usual" onClick={() => { haptic(); onBook(); }}>
            <span className="lh-usual-ico">🚖</span>
            <span className="lh-usual-txt">
              <b>Odatdagi safar</b>
              <small>{home.usualRide.name}</small>
            </span>
            <span className="lh-usual-go">→</span>
          </button>
        )}
        <button className="lh-cta" onClick={() => { haptic(); onBook(); }}>🚖 Taxi chaqirish</button>
        <div className="lh-places">
          <button className="lh-place" onClick={() => { haptic(); onNav("play"); }}>🎮<span>O'yin</span></button>
          <button className="lh-place" onClick={() => { haptic(); onNav("market"); }}>🏪<span>Bozor</span></button>
          <button className="lh-place" onClick={() => { haptic(); onNav("reyting"); }}>🏆<span>Reyting</span></button>
          <button className="lh-place" onClick={() => { haptic(); setShowWallet(true); }}>💰<span>Hamyon</span></button>
        </div>
      </div>
    </div>
  );
}
