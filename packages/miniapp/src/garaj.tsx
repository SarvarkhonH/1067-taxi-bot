// 🌍 GARAJ = Motor Olami — the dedicated full-screen earning game (opens when feature
// "garajx" is ON). Core loop: ol (buy #serial car) → yoqilg'i quy → Yig'ish → savdo/merge.
// Pure view layer — all money logic + idempotency live on the server.
import { useCallback, useEffect, useRef, useState } from "react";
import type { GarajStateResponse, GarajCarView, PublicProfileView, OrzuBoardView, CarCheckView } from "@t1067/shared";
import { REPUTATION_TIERS, ZONE_NAMES, MAKE_BASE, getVariant, mergeMult, MERGE_MAX_COUNT, SPEEDER_DAYS } from "@t1067/shared";
import { api } from "./api";
import { haptic, hapticSuccess, playTierFanfare } from "./telegram";
import { Button, Card, Chip, CoinCounter, LoadSection, ProgressBar, Sheet } from "./design/components";
import "./garaj.css";

const COND_LABEL: Record<string, string> = { WORN: "Eski", FAIR: "O'rtacha", GOOD: "Yaxshi", MINT: "A'lo" };

// 🎉 tier-unlock ceremony copy — what crossing into each garage tier grants you.
// Keyed by the tier number (2..5); tier 1 is the start, no ceremony.
const TIER_UNLOCK: Record<number, { emoji: string; perks: string[] }> = {
  2: { emoji: "🔧", perks: ["Tюнинг uslubi ochildi", "Kattaroq flip narxlari", "Ko'proq buyurtmalar"] },
  3: { emoji: "🛠", perks: ["«Davr asili» uslubi ochildi", "Premium buyurtmachilar", "Yuqori talab to'lqinlari"] },
  4: { emoji: "💎", perks: ["Diler maqomi — eng qimmat mashinalar", "Eng yirik sotuvlar sizniki", "Mahalla reytingida yuqoriga"] },
  5: { emoji: "🏁", perks: ["Koson afsonasi — eng yuqori daraja", "Shon zalida abadiy nom", "To'liq prestij imkoniyati"] },
};

// per-model paint so each car reads as ITS car (not a generic emoji)
const CAR_PAINT: Record<string, string> = {
  tiko: "#3aa6a0", damas: "#cdd2d9", matiz: "#d2433a", nexia: "#aeb6c4", spark: "#3d7fd6",
  cobalt: "#2b3a67", lacetti: "#c39a3c", malibu: "#262a33", tracker: "#e07b39", tahoe: "#2b313d", gelik: "#15171d",
};

// 🚗 per-model silhouette geometry (car faces RIGHT; viewBox 0 0 200 124).
// Each real model maps to a body archetype with its own proportions, so a Damas
// reads as a van, a Gelik as a boxy off-roader, a Malibu as a long low sedan — not
// one shape recolored. rear: notch=trunk · hatch=sloped tail · square=vertical tail.
type CarGeo = {
  rear: "notch" | "hatch" | "square"; front: "slope" | "upright";
  x0: number; x1: number; sillY: number; roofY: number; beltY: number; noseY: number;
  rRoofX: number; fRoofX: number; trunkY: number;
  wRX: number; wFX: number; wY: number; wR: number; rails: boolean; spare: boolean;
};
const MINI: CarGeo  = { rear: "hatch",  front: "slope",   x0: 44, x1: 160, sillY: 92, roofY: 42, beltY: 60, noseY: 67, rRoofX: 78, fRoofX: 126, trunkY: 62, wRX: 72, wFX: 140, wY: 95, wR: 14, rails: false, spare: false };
const HATCH: CarGeo = { rear: "hatch",  front: "slope",   x0: 26, x1: 182, sillY: 92, roofY: 37, beltY: 57, noseY: 65, rRoofX: 74, fRoofX: 124, trunkY: 60, wRX: 62, wFX: 150, wY: 95, wR: 16, rails: false, spare: false };
const SEDAN: CarGeo = { rear: "notch",  front: "slope",   x0: 18, x1: 186, sillY: 92, roofY: 41, beltY: 58, noseY: 66, rRoofX: 74, fRoofX: 118, trunkY: 61, wRX: 58, wFX: 146, wY: 95, wR: 16, rails: false, spare: false };
const VAN: CarGeo   = { rear: "square", front: "upright", x0: 22, x1: 184, sillY: 92, roofY: 28, beltY: 50, noseY: 60, rRoofX: 30, fRoofX: 150, trunkY: 50, wRX: 56, wFX: 154, wY: 95, wR: 16, rails: false, spare: false };
const SUV: CarGeo   = { rear: "square", front: "slope",   x0: 20, x1: 188, sillY: 90, roofY: 33, beltY: 54, noseY: 63, rRoofX: 58, fRoofX: 130, trunkY: 55, wRX: 58, wFX: 150, wY: 92, wR: 18, rails: true,  spare: false };
const BOX: CarGeo   = { rear: "square", front: "upright", x0: 28, x1: 180, sillY: 90, roofY: 31, beltY: 53, noseY: 57, rRoofX: 36, fRoofX: 150, trunkY: 53, wRX: 62, wFX: 148, wY: 92, wR: 17, rails: false, spare: true };

const CAR_GEO: Record<string, CarGeo> = {
  tiko:    { ...MINI, roofY: 40, x0: 46, x1: 158, rRoofX: 80, fRoofX: 124, wRX: 74, wFX: 138 },
  matiz:   { ...MINI, roofY: 43, x0: 42, x1: 162, wRX: 70, wFX: 142 },
  spark:   { ...HATCH },
  nexia:   { ...SEDAN, x1: 180, roofY: 42, fRoofX: 114, wFX: 142 },
  cobalt:  { ...SEDAN, x1: 188, fRoofX: 120, wFX: 148 },
  lacetti: { ...SEDAN, x1: 188, roofY: 40, rRoofX: 76, fRoofX: 124, wFX: 148 },
  malibu:  { ...SEDAN, x1: 192, roofY: 38, beltY: 57, fRoofX: 126, wFX: 152 },
  damas:   { ...VAN },
  tracker: { ...SUV, x1: 182, roofY: 35, rear: "hatch", rRoofX: 70, fRoofX: 126, wFX: 146, wR: 17 },
  tahoe:   { ...SUV, x1: 194, roofY: 31, rRoofX: 52, fRoofX: 140, wFX: 154, wR: 18 },
  gelik:   { ...BOX },
};

function carBodyPath(g: CarGeo): string {
  const { x0, x1, sillY, roofY, beltY, noseY, rRoofX, fRoofX, trunkY } = g;
  const cowlX = fRoofX + (g.front === "upright" ? 8 : 18); // windshield base (hood start)
  let d = `M${x0} ${sillY} `;
  if (g.rear === "square") d += `L${x0} ${roofY} `;
  else if (g.rear === "hatch") d += `L${x0} ${beltY - 2} Q${x0} ${roofY} ${rRoofX} ${roofY} `;
  else d += `L${x0} ${trunkY} L${x0 + 16} ${trunkY - 3} L${rRoofX} ${roofY} `; // notch trunk deck
  d += `L${fRoofX} ${roofY} `;                                   // roof
  d += `L${cowlX} ${beltY} `;                                    // windshield
  d += `L${x1 - 4} ${noseY} Q${x1} ${noseY} ${x1} ${noseY + 6} `; // hood → rounded nose
  d += `L${x1} ${sillY} Z`;                                      // front face + bottom
  return d;
}
function carCabinPath(g: CarGeo): string {
  const r0 = g.rear === "square" ? g.x0 + 6 : g.rRoofX;
  const top = g.roofY + 3;
  return `M${r0 + 5} ${top} L${g.fRoofX - 4} ${top} L${g.fRoofX - 8} ${g.beltY - 3} L${r0 + 9} ${g.beltY - 3} Z`;
}

/** Stylized side-view car, distinct silhouette per model (sedan / hatch / van / SUV / box / mini).
 *  Condition drives grime/sheen/headlights; level ≥5 = gold frame. Pure SVG (no WebGL, no foreign
 *  images) → renders instantly inside Telegram in UZ. */
export function GarajCarArt({ carCode, condition, level, size = 132 }: { carCode: string; condition: string; level: number; size?: number }) {
  const body = CAR_PAINT[carCode] ?? "#8a93a3";
  const g = CAR_GEO[carCode] ?? SEDAN;
  const cond = (condition || "WORN").toUpperCase();
  const grime = cond === "WORN" ? 0.55 : cond === "FAIR" ? 0.3 : cond === "GOOD" ? 0.08 : 0;
  const sheen = cond === "MINT" ? 0.55 : cond === "GOOD" ? 0.28 : 0.12;
  const lightsOn = cond === "GOOD" || cond === "MINT";
  const gold = level >= 5;
  const hub = +(g.wR * 0.44).toFixed(1);
  const lightY = (g.noseY + g.sillY) / 2;
  const bodyW = g.x1 - g.x0;
  return (
    <svg viewBox="0 0 200 124" width={size} height={size * 0.62} className={`gz-art${cond === "MINT" ? " mint" : ""}${gold ? " gold" : ""}`} role="img" aria-label={`${carCode} ${cond}`}>
      <ellipse cx={(g.x0 + g.x1) / 2} cy="113" rx={bodyW / 2 + 4} ry="8" fill="rgba(0,0,0,0.4)" />
      {/* rear-mounted spare (off-roaders) */}
      {g.spare && <><circle cx={g.x0 - 1} cy={lightY - 2} r="11" fill="#1c1f26" /><circle cx={g.x0 - 1} cy={lightY - 2} r="5" fill="#39414e" /></>}
      {/* body */}
      <path d={carBodyPath(g)} fill={body} stroke={gold ? "#ffce4f" : "rgba(0,0,0,0.3)"} strokeWidth={gold ? 3.5 : 1.5} strokeLinejoin="round" />
      {/* roof rails (SUV) */}
      {g.rails && <rect x={g.rRoofX + 8} y={g.roofY - 3} width={Math.max(10, g.fRoofX - g.rRoofX - 14)} height="3" rx="1.5" fill="rgba(0,0,0,0.45)" />}
      {/* cabin glass */}
      <path d={carCabinPath(g)} fill="rgba(186,214,238,0.6)" />
      {/* sheen */}
      <path d={`M${g.x0 + 10} ${g.beltY + 10} L${g.fRoofX} ${g.beltY - 1} L${g.fRoofX} ${g.beltY + 4} L${g.x0 + 10} ${g.beltY + 15} Z`} fill="#ffffff" opacity={sheen} />
      {/* headlight */}
      {lightsOn && <circle cx={g.x1 - 6} cy={lightY} r="12" fill="#fff3c4" opacity="0.32" />}
      <circle cx={g.x1 - 6} cy={lightY} r="5" fill={lightsOn ? "#fff6d0" : "#5b626d"} />
      {/* wheels */}
      <circle cx={g.wRX} cy={g.wY} r={g.wR} fill="#14161b" /><circle cx={g.wRX} cy={g.wY} r={hub} fill="#3a4350" />
      <circle cx={g.wFX} cy={g.wY} r={g.wR} fill="#14161b" /><circle cx={g.wFX} cy={g.wY} r={hub} fill="#3a4350" />
      {/* grime + rust (worn) */}
      {grime > 0 && (
        <g opacity={grime}>
          <rect x={g.x0} y={g.beltY + 2} width={bodyW} height={g.sillY - g.beltY - 2} fill="#3b2f22" opacity="0.4" />
          <ellipse cx={g.x0 + bodyW * 0.3} cy={g.sillY - 11} rx="11" ry="6" fill="#6b4423" />
          <ellipse cx={g.x0 + bodyW * 0.62} cy={g.sillY - 8} rx="9" ry="5" fill="#6b4423" />
        </g>
      )}
    </svg>
  );
}

// 🔥 P-Fuel-B — MotorScene: vertikal yoqilg'i bar | mashina art | meta+CTA. Hay Day hook.
// Reduced-motion safe (matchMedia + CSS @media), 60fps targeted (transform/opacity only).
function MotorScene({ car, busy, onCollect, onRefuel, onEskirdi, onCarCheck, onSpeeder, onMerge, canMerge }: { car: GarajCarView; busy: boolean; onCollect: () => void; onRefuel: () => void; onEskirdi: () => void; onCarCheck: () => void; onSpeeder: () => void; onMerge: () => void; canMerge: boolean }) {
  const pct = car.fuelPct ?? 0;
  const dry = !!car.fuelDry;
  const dead = !!car.dead;
  const state = pct >= 50 ? "high" : pct >= 30 ? "mid" : pct >= 10 ? "low" : "empty";
  const cost = car.fuelRefillCost ?? 0;
  const reducedMotion = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  // Ambient coin-float (only when earning, sheet/tab visible, reduced-motion respected)
  const sceneRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (reducedMotion || dry || dead || pct <= 0) return;
    let alive = true;
    const tick = () => {
      if (!alive || !sceneRef.current || document.hidden) return;
      const host = sceneRef.current.querySelector(".gz-fuel-coins");
      if (!host || host.childElementCount >= 4) return;
      const c = document.createElement("span");
      c.className = "gz-fuel-coin";
      c.style.left = `${30 + Math.random() * 60}%`;
      c.textContent = "+1";
      host.appendChild(c);
      setTimeout(() => c.remove(), 1600);
    };
    const id = window.setInterval(tick, 2200 + Math.random() * 1500);
    return () => { alive = false; window.clearInterval(id); };
  }, [reducedMotion, dry, dead, pct]);
  return (
    <div ref={sceneRef} className={`gz-fuel-scene${dead ? " dead" : ""}${dry ? " dry" : ""}`}>
      <div className={`gz-fuel-gauge state-${state}`} aria-label={`Yoqilg'i ${pct}%`}>
        <div className="gz-fuel-track">
          <div className="gz-fuel-fill" style={{ transform: `scaleY(${Math.max(0, Math.min(100, pct)) / 100})` }} />
        </div>
        <span className="gz-fuel-pct">{pct}%</span>
      </div>
      <div className="gz-fuel-car">
        <GarajCarArt carCode={car.carCode} condition={car.condition} level={car.level} size={120} />
        <div className="gz-fuel-coins" aria-hidden />
        {dry && !dead && <span className="gz-fuel-zzz">z z z</span>}
      </div>
      <div className="gz-fuel-meta">
        <span className="gz-motor-id">#{car.serial}</span>
        {/* 🎁 P2-B — Jackpot variant badge (Qora/Afsonaviy) — shown above stats for "wow" */}
        {(() => {
          const v = getVariant(car.variant);
          return v ? (
            <span className="gz-pill-chip gold" style={{ alignSelf: "flex-start" }}>
              <span>{v.emoji} {v.label}</span>
              <b style={{ color: "var(--brand)" }}>×{v.mult.toFixed(1)}</b>
            </span>
          ) : null;
        })()}
        <span className="fs11 dim">⚙️ {car.engineHp ?? 100}% · ⚡ {car.speed}/soat{car.speederActive ? ` · 🚀×${car.speederMult ?? 1}` : ""}</span>
        <span className="fs11 dim">🕐 {car.ageDays ?? 0} kun · 👥 {car.ownerCount ?? 1}{car.cleanHistory ? " · ✨ Toza" : ""}{car.capitalRepairCount ? ` · 🔧×${car.capitalRepairCount}` : ""}{(car.mergeCount ?? 0) > 0 ? ` · 🔗★${car.mergeCount}` : ""}</span>
        {car.speederActive && (car.speederHoursLeft ?? 0) > 0 && (
          <span className="fs11" style={{ color: "var(--brand)" }}>🚀 Speeder · {Math.round(car.speederHoursLeft! / 24)} kun qoldi</span>
        )}
        {car.ofisBidPrice != null && !dead && (
          <span className="fs11 dim">🏛 Ofis: 🪙 {car.ofisBidPrice.toLocaleString("ru-RU")}</span>
        )}
        <button type="button" className="gz-list-suggest" onClick={(e) => { e.stopPropagation(); haptic(); onCarCheck(); }}>🔍 CarCheck</button>
        {dead ? (
          <Button sm onClick={onEskirdi}>⚠️ Eskirdi — tanlash</Button>
        ) : dry ? (
          <Button sm disabled={busy} onClick={onRefuel}>
            ⛽ Quyish · {cost.toLocaleString("ru-RU")}
          </Button>
        ) : (
          <>
            <Button sm disabled={busy || (car.earnPendingNet ?? 0) <= 0} onClick={onCollect}>
              💰 Yig'ish +{(car.earnPendingNet ?? 0).toLocaleString("ru-RU")}
            </Button>
            {pct <= 30 && (
              <Button sm variant="ghost" disabled={busy} onClick={onRefuel}>
                ⛽ Quyish · {cost.toLocaleString("ru-RU")}
              </Button>
            )}
            {/* 🚀 P2-C — Speeder CTA (always offered when alive; sheet shows price+stock+state) */}
            <Button sm variant="ghost" disabled={busy} onClick={() => { haptic(); onSpeeder(); }}>
              🚀 {car.speederActive ? "Speeder uzaytirish" : "Speeder olish"}
            </Button>
            {/* 🔗 P2-A — Merge CTA (only if mergeCount < MAX and there's another car to sacrifice) */}
            {canMerge && (car.mergeCount ?? 0) < MERGE_MAX_COUNT && (
              <Button sm variant="ghost" disabled={busy} onClick={() => { haptic(); onMerge(); }}>
                🔗 Toplash (★{car.mergeCount ?? 0}/{MERGE_MAX_COUNT})
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// 🛒 P-Polish-Listing-1 — beautiful list-for-sale sheet: hero + slider + buyer preview + tax breakdown
function GarajListSheet({ car, busy, onConfirm, onClose }: { car: GarajCarView; busy: boolean; onConfirm: (price: number) => void; onClose: () => void }) {
  const minPrice = Math.max(1, Math.floor(car.basePrice * 0.5));
  const maxPrice = car.basePrice * 3;
  const suggested = Math.round(car.basePrice);
  const [price, setPrice] = useState(suggested);
  const tax = Math.round(price * 0.03);
  const net = price - tax;
  return (
    <Sheet open onClose={onClose}>
      <div className="col g8">
        <div className="gz-title">🛒 Bozorga qo'yish</div>
        <div className="gz-list-hero">
          <GarajCarArt carCode={car.carCode} condition={car.condition} level={car.level} size={140} />
          <div className="col" style={{ gap: 2 }}>
            <span className="gz-list-name">{car.emoji} {car.name}{car.level > 1 ? ` ★${car.level}` : ""}</span>
            <span className="fs11 dim">{COND_LABEL[car.condition] ?? car.condition} · ta'mir: 🪙{car.repairSpent.toLocaleString("ru-RU")}</span>
            {car.serial != null && <span className="fs11" style={{ color: "var(--brand)" }}>#{car.serial}</span>}
          </div>
        </div>
        <div className="gz-list-price">
          <div className="row between">
            <span className="dim fs12">Sotuv narxi</span>
            <b className="gz-list-price-big">🪙 {price.toLocaleString("ru-RU")}</b>
          </div>
          <input type="range" min={minPrice} max={maxPrice} step={Math.max(1, Math.round(car.basePrice * 0.05))} value={price} onChange={(e) => setPrice(parseInt(e.target.value, 10))} className="gz-list-slider" aria-label="Narx" />
          <div className="row between fs11 dim">
            <span>min {minPrice.toLocaleString("ru-RU")}</span>
            <button type="button" className="gz-list-suggest" onClick={() => { haptic(); setPrice(suggested); }}>Tavsiya {suggested.toLocaleString("ru-RU")}</button>
            <span>max {maxPrice.toLocaleString("ru-RU")}</span>
          </div>
        </div>
        <div className="gz-list-break">
          <div className="row between"><span className="dim fs12">Xaridor to'laydi</span><b>🪙 {price.toLocaleString("ru-RU")}</b></div>
          <div className="row between"><span className="dim fs12">Soliq (3%)</span><span className="dim">−🪙 {tax.toLocaleString("ru-RU")}</span></div>
          <div className="gz-list-divider" />
          <div className="row between"><b>Siz olasiz</b><b style={{ color: "var(--win)" }}>🪙 {net.toLocaleString("ru-RU")}</b></div>
        </div>
        <div className="gz-sec-title">Xaridorlar shunday ko'radi:</div>
        <div className="gz-list-preview">
          <GarajCarArt carCode={car.carCode} condition={car.condition} level={car.level} size={56} />
          <div className="col" style={{ flex: 1 }}>
            <span className="fs13 b">{car.emoji} {car.name}{car.level > 1 ? ` ★${car.level}` : ""}</span>
            <span className="fs11 dim">{COND_LABEL[car.condition] ?? car.condition}</span>
          </div>
          <span className="gz-list-preview-price">🪙 {price.toLocaleString("ru-RU")}</span>
        </div>
        <p className="fs11 dim">⏱ 48 soat ichida sotilmasa, mashina garajingizga qaytadi.</p>
        <Button disabled={busy} onClick={() => onConfirm(price)}>✓ Tasdiqlash · Bozorga qo'yish</Button>
        <Button variant="ghost" sm onClick={onClose}>Bekor</Button>
      </div>
    </Sheet>
  );
}

export function GarajShell({ onClose, initial }: { onClose: () => void; initial?: GarajStateResponse }) {
  const [st, setSt] = useState<GarajStateResponse | null>(initial ?? null);
  const [state, setState] = useState<"loading" | "error" | "ready">(initial ? "ready" : "loading");
  const [openId, setOpenId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [burst, setBurst] = useState<{ amount: number; label: string } | null>(null);
  const [bazaar, setBazaar] = useState<{ id: number; garajCarId: number; carCode: string; name: string; emoji: string; askPrice: number; mine: boolean }[]>([]);
  const [auctions, setAuctions] = useState<{ id: number; garajCarId: number; carCode: string; name: string; emoji: string; minBid: number; endsAt: string; mine: boolean }[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [museumOpen, setMuseumOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false); // 🌍 ochiq profil
  const [ceremonyTier, setCeremonyTier] = useState<number | null>(null);
  const prevTierRef = useRef<number | null>(null);
  const [firstCarShown, setFirstCarShown] = useState(false); // 🌟 first-car ceremony one-shot
  const prevCarCountRef = useRef<number | null>(null);
  // 🛒 P-Polish-Listing-1 — bazaar list flow
  const [listingFor, setListingFor] = useState<number | null>(null); // carId being listed
  // 🛒 P-Polish-Listing-2 — post-list ceremony state
  const [listLift, setListLift] = useState<{ name: string } | null>(null);
  // ✨ P1-G — UI for ORZU + CarCheck + Eskirdi 4-tugma + slot status
  const [orzuOpen, setOrzuOpen] = useState(false);
  const [checkOpen, setCheckOpen] = useState<number | null>(null); // carId (own car)
  // DIAG-Bazaar — generic target for inspecting OTHER people's cars from bazaar/auction
  const [checkTarget, setCheckTarget] = useState<CarCheckTarget | null>(null);
  const [eskirdiOpen, setEskirdiOpen] = useState<number | null>(null); // carId (dead)
  const [slot, setSlot] = useState<{ slotCount: number; activeCount: number; nextSlotCost: number | null } | null>(null);
  // 🚀 P2-C + 🔗 P2-A sheet state
  const [speederOpen, setSpeederOpen] = useState<number | null>(null); // carId
  const [mergeOpen, setMergeOpen] = useState<number | null>(null); // keep carId

  const load = useCallback(() => {
    if (initial) return; // demo/fixture mode — no backend fetch
    setState("loading");
    void api.garajBazaar().then(setBazaar).catch(() => undefined);
    void api.garajAuctions().then(setAuctions).catch(() => undefined);
    void api.garajSlotStatus().then((r) => setSlot(r)).catch(() => undefined); // 🪪 P1-D
    api
      .garajState()
      .then((s) => {
        setSt(s);
        setState("ready");
      })
      .catch(() => setState("error"));
  }, [initial]);
  useEffect(() => load(), [load]);

  // 🎉 tier-unlock ceremony — fires whenever garageTier crosses UPWARD, no matter
  // which path bumped it (load / repair / flip / box). First observation only records
  // the baseline (no ceremony on mount), so it can't false-fire for returning players.
  useEffect(() => {
    const t = st?.garageTier;
    if (t == null) return;
    if (prevTierRef.current != null && t > prevTierRef.current && TIER_UNLOCK[t]) {
      setCeremonyTier(t);
      hapticSuccess();
      playTierFanfare();
    }
    prevTierRef.current = t;
  }, [st?.garageTier]);

  // 🌟 P-Polish-Home-2 — first-car ceremony: 0 → 1 cars triggers a one-shot welcome
  // (reuses .gz-ceremony shell; copy adapted for "Birinchi mashinangiz"). Baseline-only on
  // first mount so returning players don't re-trigger.
  useEffect(() => {
    const n = st?.cars.length ?? 0;
    if (prevCarCountRef.current != null && prevCarCountRef.current === 0 && n >= 1 && !firstCarShown) {
      setFirstCarShown(true);
      hapticSuccess();
      playTierFanfare();
    }
    prevCarCountRef.current = n;
  }, [st?.cars.length, firstCarShown]);

  // 🌟 P-Polish-Home-2 — scene-reveal: tag sections with [data-reveal] → fade+slide up on view.
  // IntersectionObserver runs once per element (60ms stagger via delay attr); reduced-motion users
  // get instant-visible. Safe: pure CSS class toggle, no layout thrash.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      document.querySelectorAll<HTMLElement>("[data-reveal]").forEach((el) => el.classList.add("revealed"));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          (e.target as HTMLElement).classList.add("revealed");
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.15 });
    document.querySelectorAll<HTMLElement>("[data-reveal]:not(.revealed)").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [st?.cars.length, st?.motorEnabled]);

  const flash = (msg: string): void => { setToast(msg); setTimeout(() => setToast(null), 2200); };

  const car = st?.cars.find((c) => c.id === openId) ?? null;

  const act = async (fn: () => Promise<{ ok: boolean; reason?: string; grant?: number }>, onWin?: (grant: number) => void): Promise<void> => {
    if (busy) return;
    setBusy(true);
    haptic();
    try {
      const r = await fn();
      if (r.ok && onWin && r.grant) onWin(r.grant);
      setSt(await api.garajState());
    } catch {
      /* keep current state; user can retry */
    } finally {
      setBusy(false);
    }
  };

  const coins = st?.coins ?? 0;

  return (
    <div className="gz">
      <div className="gz-head">
        <button className="gz-back" onClick={() => { haptic(); onClose(); }} aria-label="Ortga">←</button>
        <span className="gz-title">🏎 <b>Motor Olami</b></span>
        <div className="gz-purse">
          {st?.motorEnabled && <button className="gz-back" onClick={() => { haptic(); setOrzuOpen(true); }} aria-label="ORZU board">✨</button>}
          {st?.motorEnabled && <button className="gz-back" onClick={() => { haptic(); setProfileOpen(true); }} aria-label="Ochiq profil">🌍</button>}
          <button className="gz-back" onClick={() => { haptic(); setMuseumOpen(true); }} aria-label="Muzey">🏛</button>
          <span className="gz-pill">🪙 <CoinCounter value={coins} /></span>
        </div>
      </div>

      <div className="gz-body">
        <LoadSection state={state} onRetry={load}>
          {st && (
            <>
              {/* 🎁 Bonus hafta — yangi o'yinchi hook */}
              {st.motorEnabled && st.motorBonus?.active && (
                <div className="gz-motor-bonus">
                  <span className="gz-motor-bonus-pill">🎁 Bonus hafta — <b>{st.motorBonus.daysLeft} kun qoldi</b></span>
                  <span className="fs11 dim">⚡ {st.motorBonus.speedMult.toFixed(1)}× daromad · ⛽ {Math.round(st.motorBonus.fuelMult * 100)}% yoqilg'i</span>
                </div>
              )}

              {/* 🏎 MENING MASHINALARIM — har mashina alohida pul ishlaydi (Yig'ish per-car) */}
              <div className="gz-sec-title mt0">🏎 Mening mashinalarim{slot ? ` (${slot.activeCount}/${slot.slotCount})` : ""}</div>
              {st.cars.length === 0 ? (
                <p className="gz-empty">Hali mashinangiz yo'q. Pastdagi <b>🛒 Bozor</b>dan birinchi mashinangizni oling — u darhol pul ishlay boshlaydi.</p>
              ) : (
                <div className="col g8" data-reveal style={{ ["--reveal-delay" as never]: "0ms" }}>
                  {st.cars.map((c) => {
                    const v = getVariant(c.variant);
                    const dead = !!c.dead;
                    const dry = !!c.fuelDry;
                    return (
                      <div key={c.id} className={`gz-mcard${dead ? " dead" : ""}`}>
                        <button className="gz-mcard-main" onClick={() => { haptic(); setOpenId(c.id); }}>
                          <GarajCarArt carCode={c.carCode} condition={c.condition} level={c.level} size={60} />
                          <div className="col gz-mcard-info">
                            <span className="gz-mcard-name">{c.emoji} {c.name} <span className="gz-motor-id">#{c.serial}</span>{v ? ` ${v.emoji}` : ""}{(c.mergeCount ?? 0) > 0 ? ` ★${c.mergeCount}` : ""}</span>
                            <span className="fs11 dim">⚙️ {c.engineHp ?? 100}% · ⚡ {c.speed}/soat{c.speederActive ? ` · 🚀×${c.speederMult}` : ""}</span>
                            <div className="gz-mcard-fuel" aria-label={`Yoqilg'i ${c.fuelPct ?? 0}%`}><span className="gz-mcard-fuel-fill" style={{ width: `${Math.max(0, Math.min(100, c.fuelPct ?? 0))}%` }} /></div>
                          </div>
                          <span className="gz-mcard-chev">›</span>
                        </button>
                        <div className="gz-mcard-cta">
                          {dead ? (
                            <Button sm onClick={() => { haptic(); setEskirdiOpen(c.id); }}>⚠️ Eskirdi</Button>
                          ) : dry ? (
                            <Button sm disabled={busy} onClick={() => motorRefuel(c.id)}>⛽ Quyish · {(c.fuelRefillCost ?? 0).toLocaleString("ru-RU")}</Button>
                          ) : (
                            <Button sm disabled={busy || (c.earnPendingNet ?? 0) <= 0} onClick={() => motorCollect(c.id)}>💰 Yig'ish +{(c.earnPendingNet ?? 0).toLocaleString("ru-RU")}</Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {slot && slot.nextSlotCost != null && (
                <Button variant="ghost" sm className="mt8" disabled={busy} onClick={() => void slotBuy()}>🪪 Yangi slot ochish · 🪙{slot.nextSlotCost.toLocaleString("ru-RU")}</Button>
              )}
              {slot && slot.slotCount > 1 && slot.slotCount > slot.activeCount && (
                <Button variant="ghost" sm disabled={busy} onClick={() => void slotRefund()}>🪪 Bo'sh slotni qaytarish (qisman tanga)</Button>
              )}

              {/* 🔥 KUNLIK — streak + offline quti */}
              <div className="gz-sec-title">🔥 Kunlik</div>
              <div className="gz-daily">
                <div className="gz-streak">
                  <span className="gz-streak-fire">🔥</span>
                  <span className="gz-streak-n">{st.streak.current}</span>
                  <span className="gz-streak-lbl">
                    kun ketma-ket{st.streak.freezeAvailable ? " · 🛞 zaxira" : ""}
                    {st.streak.nextMilestone ? ` · ${st.streak.nextMilestone}-kunda bonus` : ""}
                  </span>
                </div>
                {st.offlineBoxPending > 0 ? (
                  <Button sm disabled={busy} onClick={() => collectBox()}>📦 Quti +{st.offlineBoxPending}</Button>
                ) : (
                  <span className="gz-box-idle">📦 Quti to'lmoqda</span>
                )}
              </div>

              {/* 🛒 BOZOR — yangi mashina katalogi (acquire) */}
              <div className="gz-sec-title">🛒 Bozor — yangi mashina</div>
              <div className="gz-grid">
                {st.shop.filter((s) => !s.owned).map((s) => (
                  <Card key={s.carCode} className="gz-car">
                    <span className="gz-car-emoji">{s.emoji}</span>
                    <span className="gz-car-name">{s.name}</span>
                    <span className="gz-car-sub">🪙 {s.buyPrice.toLocaleString("ru-RU")}</span>
                    <Button sm disabled={busy || coins < s.buyPrice} onClick={() => acquireCar(s.carCode, s.name)}>Sotib olish</Button>
                  </Card>
                ))}
              </div>

              {/* 📦 Yo'l sovg'alari — real safarlardan arzon mashina takliflari */}
              {st.roadDrops && st.roadDrops.length > 0 && (
                <>
                  <div className="gz-sec-title">📦 Yo'l sovg'alari</div>
                  <div className="col g8">
                    {st.roadDrops.map((d) => (
                      <Card key={d.id} className="gz-tow">
                        <div className="row between">
                          <span className="gz-tow-car">{d.emoji} <b>{d.name}</b> · yo'lda topildi</span>
                          <span className="gz-tow-price">🪙 {d.price.toLocaleString("ru-RU")}</span>
                        </div>
                        <div className="row g8 mt8">
                          <Button sm disabled={busy || coins < d.price} onClick={() => claimTow(d.id)}>Olish</Button>
                          <Button variant="ghost" sm disabled={busy} onClick={() => declineTow(d.id)}>Rad etish</Button>
                        </div>
                      </Card>
                    ))}
                  </div>
                </>
              )}

              {bazaar.filter((b) => b.mine).length > 0 && (
                <>
                  <div className="gz-sec-title">🏷 Mening sotuvdagilarim</div>
                  <div className="gz-grid">
                    {bazaar
                      .filter((b) => b.mine)
                      .map((b) => (
                        <Card key={b.id} className="gz-car">
                          <span className="gz-car-emoji">{b.emoji}</span>
                          <span className="gz-car-name">{b.name}</span>
                          <span className="gz-car-sub">🪙 {b.askPrice.toLocaleString("ru-RU")} · sotuvda</span>
                          <Button variant="ghost" sm disabled={busy} onClick={() => bazaarUnlist(b.id)}>
                            Bekor qilish
                          </Button>
                        </Card>
                      ))}
                  </div>
                </>
              )}

              <div className="gz-sec-title">🤝 Boshqa o'yinchilardan</div>
              {bazaar.filter((b) => !b.mine).length === 0 ? (
                <p className="gz-empty">Hozircha boshqa o'yinchilar e'loni yo'q. Mashinangizni sotuvga qo'ying — boshqalar shu yerdan sotib oladi.</p>
              ) : (
                <div className="gz-grid">
                  {bazaar
                    .filter((b) => !b.mine)
                    .map((b) => (
                      <Card key={b.id} className="gz-car">
                        <span className="gz-car-emoji">{b.emoji}</span>
                        <span className="gz-car-name">{b.name}</span>
                        <span className="gz-car-sub">🪙 {b.askPrice.toLocaleString("ru-RU")}</span>
                        {/* 🔍 DIAG-Bazaar — pre-buy CarCheck (tarix sotib olishdan oldin ko'rinadi) */}
                        {st?.motorEnabled && (
                          <Button sm variant="ghost" onClick={() => { haptic(); setCheckTarget({ id: b.garajCarId, carCode: b.carCode, name: b.name, emoji: b.emoji }); }}>
                            🔍 Tekshir
                          </Button>
                        )}
                        <Button sm disabled={busy || coins < b.askPrice} onClick={() => bazaarBuy(b.id)}>
                          Sotib olish
                        </Button>
                      </Card>
                    ))}
                </div>
              )}

              {auctions.filter((a) => !a.mine).length > 0 && (
                <>
                  <div className="gz-sec-title">🔨 Auksion (yopiq taklif)</div>
                  <div className="col g8">
                    {auctions
                      .filter((a) => !a.mine)
                      .map((a) => (
                        <Card key={a.id} className="gz-auc">
                          <div className="row between">
                            <span>{a.emoji} {a.name}</span>
                            <div className="row g8">
                              <span className="fs12 dim">min 🪙{a.minBid.toLocaleString("ru-RU")}</span>
                              {/* 🔍 DIAG-Bazaar — pre-bid CarCheck */}
                              {st?.motorEnabled && (
                                <button type="button" className="gz-list-suggest" onClick={() => { haptic(); setCheckTarget({ id: a.garajCarId, carCode: a.carCode, name: a.name, emoji: a.emoji }); }}>
                                  🔍 Tekshir
                                </button>
                              )}
                            </div>
                          </div>
                          <div className="gz-buyers">
                            {[1, 1.5, 2].map((mult) => {
                              const bid = Math.round(a.minBid * mult);
                              return (
                                <Chip key={mult} onClick={() => aucBid(a.id, bid)}>
                                  🪙{bid.toLocaleString("ru-RU")}
                                </Chip>
                              );
                            })}
                          </div>
                        </Card>
                      ))}
                  </div>
                </>
              )}

            </>
          )}
        </LoadSection>
      </div>

      {/* 🌍 Motor Olami — per-car detail (replaces the old repair/flip bench). MotorScene gives the
          full motor action set: Yig'ish · Quyish · CarCheck · Speeder · Toplash · Eskirdi. Selling
          goes through the P2P bozor/auksion (no NPC flip). */}
      <Sheet open={!!car} onClose={() => setOpenId(null)}>
        {car && (
          <div className="col g8">
            {car.serial != null ? (
              <MotorScene
                car={car}
                busy={busy}
                onCollect={() => motorCollect(car.id)}
                onRefuel={() => motorRefuel(car.id)}
                onEskirdi={() => setEskirdiOpen(car.id)}
                onCarCheck={() => setCheckOpen(car.id)}
                onSpeeder={() => setSpeederOpen(car.id)}
                onMerge={() => setMergeOpen(car.id)}
                canMerge={(st?.cars?.length ?? 0) >= 2}
              />
            ) : (
              <div className="row between">
                <span className="gz-title">{car.emoji} {car.name}</span>
                <span className="fs12 dim">#raqam tez orada</span>
              </div>
            )}
            <Button variant="ghost" sm onClick={() => { haptic(); setListingFor(car.id); }}>
              🛒 Bozorga qo'yish
            </Button>
            <Button variant="ghost" sm onClick={() => aucCreate(car.id, Math.round(car.basePrice * 0.5))}>
              🔨 Auksionga qo'yish (min {Math.round(car.basePrice * 0.5).toLocaleString("ru-RU")})
            </Button>
          </div>
        )}
      </Sheet>

      {st && state === "ready" && st.onboardStep < 5 && (
        <GarajFtue
          onDone={(grant) => {
            hapticSuccess();
            if (grant > 0) {
              setBurst({ amount: grant, label: "BIRINCHI FOYDA! 🎉" });
              setTimeout(() => setBurst(null), 2200);
            }
            if (!initial) api.garajState().then(setSt).catch(() => undefined);
          }}
        />
      )}

      {burst && (
        <div className="gz-burst" onClick={() => setBurst(null)}>
          <span className="gz-burst-emoji">🪙</span>
          <span className="gz-burst-amt">+{burst.amount.toLocaleString("ru-RU")}</span>
          <span className="gz-burst-label">{burst.label}</span>
        </div>
      )}

      {toast && <div className="gz-toast" onClick={() => setToast(null)}>{toast}</div>}

      {museumOpen && <GarajMuseumSheet demo={initial ? GARAJ_DEMO_MUSEUM : undefined} onClose={() => setMuseumOpen(false)} />}
      {profileOpen && <GarajProfileSheet demo={initial ? GARAJ_DEMO_PROFILE : undefined} onClose={() => setProfileOpen(false)} />}
      {orzuOpen && <GarajOrzuSheet onClose={() => setOrzuOpen(false)} />}
      {checkOpen != null && (() => {
        const cc = st?.cars.find((c) => c.id === checkOpen);
        return cc ? <GarajCarCheckSheet car={cc} onClose={() => setCheckOpen(null)} /> : null;
      })()}
      {checkTarget != null && <GarajCarCheckSheet car={checkTarget} onClose={() => setCheckTarget(null)} />}
      {eskirdiOpen != null && (() => {
        const ec = st?.cars.find((c) => c.id === eskirdiOpen);
        return ec ? <GarajEskirdiSheet car={ec} busy={busy} onSellOfis={() => void eskirdiSellOfis(ec.id)} onCapital={() => eskirdiCapital(ec.id)} onClose={() => setEskirdiOpen(null)} /> : null;
      })()}
      {speederOpen != null && (() => {
        const sc = st?.cars.find((c) => c.id === speederOpen);
        return sc ? <GarajSpeederSheet car={sc} onBuy={speederBuy} onClose={() => setSpeederOpen(null)} /> : null;
      })()}
      {mergeOpen != null && (() => {
        const kc = st?.cars.find((c) => c.id === mergeOpen);
        const others = st?.cars.filter((c) => c.id !== mergeOpen) ?? [];
        return kc ? <GarajMergeSheet keep={kc} others={others} onMerge={(sacId) => mergeConfirm(kc.id, sacId)} onClose={() => setMergeOpen(null)} /> : null;
      })()}
      {listingFor != null && (() => {
        const lc = st?.cars.find((c) => c.id === listingFor);
        return lc ? <GarajListSheet car={lc} busy={busy} onConfirm={(price) => { bazaarList(lc.id, price); setListingFor(null); }} onClose={() => setListingFor(null)} /> : null;
      })()}

      {/* 🎉 tier-unlock ceremony — full-screen celebration when you reach a new garage tier */}
      {ceremonyTier != null && TIER_UNLOCK[ceremonyTier] && (
        <div className="gz-ceremony" onClick={() => setCeremonyTier(null)}>
          <div className="gz-cer-rays" aria-hidden />
          <div className="gz-cer-card" onClick={(e) => e.stopPropagation()}>
            <div className="gz-cer-badge">{TIER_UNLOCK[ceremonyTier]!.emoji}</div>
            <div className="gz-cer-kicker">Yangi daraja ochildi</div>
            <div className="gz-cer-tier">{REPUTATION_TIERS[ceremonyTier - 1]?.name ?? ""}</div>
            <div className="gz-cer-sub">Daraja {ceremonyTier}/5</div>
            <ul className="gz-cer-perks">
              {TIER_UNLOCK[ceremonyTier]!.perks.map((p) => (
                <li key={p}><span className="gz-cer-tick">✓</span> {p}</li>
              ))}
            </ul>
            <Button onClick={() => { haptic(); setCeremonyTier(null); }}>Davom etish</Button>
          </div>
        </div>
      )}

      {/* 🛒 P-Polish-Listing-2 — post-list lift effect (car lifts off + dust dots) */}
      {listLift && (
        <div className="gz-list-lift" aria-hidden onAnimationEnd={() => setListLift(null)}>
          <span className="gz-list-lift-icon">🛒</span>
          <span className="gz-list-lift-dust d1" />
          <span className="gz-list-lift-dust d2" />
          <span className="gz-list-lift-dust d3" />
          <span className="gz-list-lift-name">{listLift.name} → Bozorda</span>
        </div>
      )}

      {/* 🌟 P-Polish-Home-2 — first-car welcome (one-shot when player goes from 0 → 1 cars) */}
      {firstCarShown && (
        <div className="gz-ceremony" onClick={() => setFirstCarShown(false)}>
          <div className="gz-cer-rays" aria-hidden />
          <div className="gz-cer-card" onClick={(e) => e.stopPropagation()}>
            <div className="gz-cer-badge">🚗</div>
            <div className="gz-cer-kicker">Birinchi mashinangiz</div>
            <div className="gz-cer-tier">Xush kelibsiz!</div>
            <div className="gz-cer-sub">Garaj endi sizniki</div>
            <ul className="gz-cer-perks">
              <li><span className="gz-cer-tick">✓</span> Mashina pul ishlay boshladi</li>
              <li><span className="gz-cer-tick">✓</span> «Yig'ish» bilan tanga oling</li>
              <li><span className="gz-cer-tick">✓</span> Bozorda boshqalar bilan savdo qiling</li>
            </ul>
            <Button onClick={() => { haptic(); setFirstCarShown(false); }}>Boshlash</Button>
          </div>
        </div>
      )}
    </div>
  );

  function collectBox(): void {
    void act(
      () => api.garajCollectBox(),
      (grant) => { hapticSuccess(); setBurst({ amount: grant, label: "OFFLINE QUTI 📦" }); setTimeout(() => setBurst(null), 1900); },
    );
  }
  function claimTow(dropId: number): void {
    void act(() => api.garajClaimTow(dropId));
    flash("Mashina garajga qo'shildi 🚗");
  }
  function declineTow(dropId: number): void {
    void act(() => api.garajDeclineTow(dropId));
  }
  // 🪪 P1-D — buy next slot
  async function slotBuy(): Promise<void> {
    if (busy) return; setBusy(true); haptic();
    try {
      const r = await api.garajSlotPurchase();
      if (r.ok) { hapticSuccess(); flash(`✓ Slot #${r.newSlotCount} ochildi`); }
      else if (r.reason === "insufficient") flash("Tanga yetarli emas");
      else if (r.reason === "max_slot") flash("Maksimal slot soni");
      else flash("Slot ololmadik");
      void api.garajSlotStatus().then((s) => setSlot(s)).catch(() => undefined);
      if (!initial) setSt(await api.garajState());
    } finally { setBusy(false); }
  }
  // 🪪 P2-deep-2 — slot trade-in: refund a spare slot for partial tanga
  async function slotRefund(): Promise<void> {
    if (busy) return; setBusy(true); haptic();
    try {
      const r = await api.garajSlotRefund();
      if (r.ok) { hapticSuccess(); flash(`🪪 Slot qaytarildi · +${(r.refund ?? 0).toLocaleString("ru-RU")}`); }
      else if (r.reason === "slot_full") flash("Avval mashina soting — bo'sh slot kerak");
      else if (r.reason === "min_slot") flash("Birinchi slot bepul — qaytarib bo'lmaydi");
      else flash("Qaytarib bo'lmadi");
      void api.garajSlotStatus().then((s) => setSlot(s)).catch(() => undefined);
      if (!initial) setSt(await api.garajState());
    } finally { setBusy(false); }
  }
  // 🏛 P1-B — Sell to 1067 Ofis (instant 80% × reference price)
  async function eskirdiSellOfis(carId: number): Promise<void> {
    if (busy) return; setBusy(true); haptic();
    try {
      const r = await api.garajOfisSell(carId);
      if (r.ok) { hapticSuccess(); setBurst({ amount: r.received ?? 0, label: `🏛 Ofis sotib oldi · +${(r.received ?? 0).toLocaleString("ru-RU")}` }); setTimeout(() => setBurst(null), 2200); setEskirdiOpen(null); }
      else flash(r.reason === "budget_dry" ? "Ofis bugun byudjeti tugadi" : "Sotib bo'lmadi");
      if (!initial) { setSt(await api.garajState()); void api.garajSlotStatus().then((s) => setSlot(s)).catch(() => undefined); }
    } finally { setBusy(false); }
  }
  // 🔧 Kapital remont — opens the existing RESTORE craft station (Workshop)
  function eskirdiCapital(carId: number): void {
    setEskirdiOpen(null);
    void act(() => api.garajCraft(carId, "RESTORE"));
  }
  // 🚀 P2-C — Speeder buy
  async function speederBuy(carId: number): Promise<void> {
    if (busy) return; setBusy(true); haptic();
    try {
      const r = await api.garajSpeederBuy(carId);
      if (r.ok) { hapticSuccess(); setBurst({ amount: 0, label: `🚀 Speeder yoqildi · ${SPEEDER_DAYS} kun` }); setTimeout(() => setBurst(null), 2000); }
      else if (r.reason === "out_of_stock" || r.reason === "stock_race") flash("Zaxira tugadi — ertaga qayta urinib ko'ring");
      else if (r.reason === "insufficient") flash("Tanga yetarli emas");
      else if (r.reason === "dead_car") flash("Mashina eskirgan");
      else if (r.reason === "already") flash("Bugun allaqachon olingan");
      else flash("Sotib bo'lmadi");
      if (!initial) setSt(await api.garajState());
    } finally { setBusy(false); }
  }
  // 🔗 P2-A — Merge confirm
  async function mergeConfirm(keepId: number, sacId: number): Promise<void> {
    if (busy) return; setBusy(true); haptic();
    try {
      const r = await api.garajMerge(keepId, sacId);
      if (r.ok) { hapticSuccess(); setBurst({ amount: 0, label: `🔗 Toplandi · ★${r.mergeCount} (×${(r.newMult ?? 1).toFixed(2)})` }); setTimeout(() => setBurst(null), 2400); }
      else if (r.reason === "max_merge") flash("Maksimum bosqichga yetilgan");
      else if (r.reason === "same_car") flash("Boshqa mashinani tanlang");
      else if (r.reason === "not_found") flash("Mashina topilmadi");
      else if (r.reason === "already_merged") flash("Bu juftlik allaqachon ishlatilgan");
      else flash("Toplab bo'lmadi");
      if (!initial) { setSt(await api.garajState()); void api.garajSlotStatus().then((s) => setSlot(s)).catch(() => undefined); }
    } finally { setBusy(false); }
  }
  async function motorRefuel(garajCarId: number): Promise<void> {
    if (busy) return;
    setBusy(true);
    haptic();
    try {
      const r = await api.garajMotorRefuel(garajCarId);
      if (r.ok) {
        hapticSuccess();
        setBurst({ amount: r.cost ?? 0, label: `⛽ Yoqilg'i quyildi · 24 soat` });
        setTimeout(() => setBurst(null), 1800);
      } else if (r.reason === "already_full") flash("Bak hali to'la — keyinroq quying");
      else if (r.reason === "insufficient") flash("Tanga yetarli emas");
      else if (r.reason === "dead_car") flash("Mashina eskirgan — soting yoki yangilang");
      else flash("Quyib bo'lmadi");
      if (!initial) setSt(await api.garajState());
    } catch {
      /* keep state */
    } finally {
      setBusy(false);
    }
  }
  // 🌍 Motor Olami «Yig'ish» — credit net (gross−wear in fuel model), dopamin burst
  async function motorCollect(garajCarId?: number): Promise<void> {
    if (busy) return;
    setBusy(true);
    haptic();
    try {
      const r = await api.garajMotorCollect(garajCarId);
      if (r.ok && (r.net ?? 0) > 0) {
        hapticSuccess();
        setBurst({ amount: r.net ?? 0, label: `🚗 ${(r.gross ?? 0).toLocaleString("ru-RU")} − ${(r.wear ?? 0).toLocaleString("ru-RU")} eyilish` });
        setTimeout(() => setBurst(null), 2200);
      } else if (r.reason === "cap_reached") flash("🛡 Bugungi limit to'ldi — ertaga davom etadi");
      else if (r.dead) flash("⚠️ Mashina eskirgan — soting yoki yangilang");
      else if (r.dry) flash("⛽ Yoqilg'i tugagan — quying");
      else flash("Hali daromad to'planmadi");
      if (!initial) setSt(await api.garajState());
    } catch {
      /* keep state */
    } finally {
      setBusy(false);
    }
  }
  // 🛒 Bozor — yangi mashina (acquire). Toast FAQAT muvaffaqiyatda (no_slot/insufficient da xato xabar).
  async function acquireCar(carCode: string, name: string): Promise<void> {
    if (busy) return;
    setBusy(true);
    haptic();
    try {
      const r = await api.garajAcquire(carCode);
      if (r.ok) { hapticSuccess(); flash(`${name} olindi! 🏎`); }
      else if (r.reason === "no_slot") flash("🪪 Slot to'lgan — yangi slot oching yoki mashina soting");
      else if (r.reason === "insufficient") flash("Tanga yetarli emas");
      else if (r.reason === "owned") flash("Bu model sizda allaqachon bor");
      else flash("Sotib bo'lmadi");
      if (!initial) { setSt(await api.garajState()); void api.garajSlotStatus().then((s) => setSlot(s)).catch(() => undefined); }
    } catch {
      /* keep state */
    } finally {
      setBusy(false);
    }
  }
  async function bazaarAct(fn: () => Promise<{ ok: boolean }>): Promise<void> {
    if (busy) return;
    setBusy(true);
    haptic();
    try {
      await fn();
      if (!initial) {
        setSt(await api.garajState());
        setBazaar(await api.garajBazaar());
        setAuctions(await api.garajAuctions());
      }
    } catch {
      /* keep state */
    } finally {
      setBusy(false);
    }
  }
  function bazaarList(id: number, price: number): void {
    const car = st?.cars.find((c) => c.id === id);
    void (async () => {
      await bazaarAct(() => api.garajBazaarList(id, price));
      setOpenId(null);
      // 🛒 P-Polish-Listing-2 — post-list ceremony: car "lifts" off the garage + dust + burst
      setListLift({ name: car?.name ?? "Mashina" });
      hapticSuccess();
      setBurst({ amount: price, label: `🛒 ${car?.name ?? "Mashina"} bozorda` });
      setTimeout(() => setBurst(null), 2000);
      setTimeout(() => setListLift(null), 2400);
    })();
  }
  function bazaarBuy(listingId: number): void {
    void bazaarAct(() => api.garajBazaarBuy(listingId));
  }
  function bazaarUnlist(listingId: number): void {
    void bazaarAct(() => api.garajBazaarUnlist(listingId));
  }
  function aucBid(auctionId: number, amount: number): void {
    void bazaarAct(() => api.garajAuctionBid(auctionId, amount));
  }
  function aucCreate(id: number, minBid: number): void {
    void bazaarAct(() => api.garajAuctionCreate(id, minBid));
    setOpenId(null);
  }
  async function flip(id: number, buyer: string): Promise<void> {
    if (busy) return;
    setBusy(true);
    haptic();
    try {
      const r = await api.garajFlip(id, buyer);
      if (r.ok) {
        hapticSuccess();
        const ob = r.orderBonus ?? 0;
        setBurst({ amount: (r.grant ?? 0) + ob, label: ob > 0 ? `SOTILDI! 📋 buyurtma +${ob}` : "SOTILDI!" });
        setOpenId(null);
        setTimeout(() => setBurst(null), 2100);
      } else if (r.reason === "daily_cap") flash("Bugungi sotuv chegarasi to'ldi");
      if (!initial) setSt(await api.garajState());
    } catch {
      /* keep state */
    } finally {
      setBusy(false);
    }
  }
}

export const GARAJ_DEMO_MUSEUM = {
  collection: [
    { carCode: "tiko", name: "Tiko", emoji: "🚙", owned: true },
    { carCode: "damas", name: "Damas", emoji: "🚐", owned: true },
    { carCode: "matiz", name: "Matiz", emoji: "🚗", owned: true },
    { carCode: "nexia", name: "Nexia", emoji: "🚙", owned: true },
    { carCode: "spark", name: "Spark", emoji: "🚗", owned: false },
    { carCode: "cobalt", name: "Cobalt", emoji: "🚘", owned: true },
    { carCode: "lacetti", name: "Lacetti", emoji: "🚖", owned: false },
    { carCode: "malibu", name: "Malibu", emoji: "🏎", owned: false },
    { carCode: "tracker", name: "Tracker", emoji: "🛻", owned: true },
    { carCode: "tahoe", name: "Tahoe", emoji: "🚙", owned: false },
    { carCode: "gelik", name: "Gelandewagen", emoji: "🏁", owned: false },
  ],
  collectedCount: 6,
  totalModels: 11,
  totalFlips: 14,
  bestProfit: 3480,
  hallOfFame: [{ name: "Jasur", prestigeCount: 5, repAtEntry: 26800 }, { name: "Dilnoza", prestigeCount: 3, repAtEntry: 12400 }],
};

// Static fixture for the #garajdemo render-proof (no backend, no auth).
export const GARAJ_DEMO: GarajStateResponse = {
  enabled: true,
  motorEnabled: true,
  coins: 4820,
  kozacha: 24,
  garageTier: 2,
  reputationScore: 1340,
  onboardStep: 5,
  cars: [
    { id: 1, carCode: "nexia", name: "Nexia", emoji: "🚙", basePrice: 2600, source: "ride_drop", condition: "GOOD", style: "FULL_RESTORE", level: 2, diagnosed: true, diagnosis: { engine: 72, body: 58, transmission: 64, electric: 80, interior: 45 }, zones: { engine: 72, body: 58, transmission: 64, electric: 80, interior: 45 }, acquireCost: 1690, repairSpent: 240, serial: 1251, engineHp: 88, ageDays: 3, dead: false, speed: 47, earnPendingNet: 220, ownerCount: 4, totalTrips: 1213, fuelPct: 78, fuelHoursLeft: 18.7, fuelDry: false, fuelRefillCost: 790 },
    { id: 2, carCode: "damas", name: "Damas", emoji: "🚐", basePrice: 900, source: "shop", condition: "WORN", style: null, level: 1, diagnosed: false, diagnosis: null, zones: null, acquireCost: 585, repairSpent: 0, serial: 1342, engineHp: 64, ageDays: 6, dead: false, speed: 16, earnPendingNet: 180, ownerCount: 2, totalTrips: 540, fuelPct: 22, fuelHoursLeft: 5.2, fuelDry: false, fuelRefillCost: 269 },
  ],
  shop: [
    { carCode: "tiko", name: "Tiko", emoji: "🚙", buyPrice: 455, owned: false },
    { carCode: "matiz", name: "Matiz", emoji: "🚗", buyPrice: 975, owned: false },
    { carCode: "cobalt", name: "Cobalt", emoji: "🚘", buyPrice: 2470, owned: false },
    { carCode: "tracker", name: "Tracker", emoji: "🛻", buyPrice: 7800, owned: false },
  ],
  skill: { ustaKozRank: 47, muhandis: 3, kuzovchi: 2, savdogar: 1, kollektsioner: 3, muhandisXp: 80, kuzovchiXp: 40, savdogarXp: 12, kollektsionerXp: 90 },
  reputationName: "Usta",
  streak: { current: 4, longest: 9, freezeAvailable: false, nextMilestone: 5 },
  cipher: { solvedToday: false, attemptsLeft: 5, reward: 30, hasCode: true },
  prestige: { count: 0, multiplier: 1.0, eligible: false },
  offlineBoxPending: 18,
  seasonalEvent: "Navro'z",
  mahalla: { id: 1, name: "Koson Ustalari", code: "LUPYQG", weeklyScore: 1240, memberCount: 7, rank: 2, role: "MEMBER" },
  orders: [
    { slot: 0, carCode: "nexia", style: "FULL_RESTORE", buyer: "FAMILY_DRIVER", bonus: 208, done: false },
    { slot: 1, carCode: "matiz", style: "TUNING", buyer: "YOUNG_TUNER", bonus: 120, done: true },
    { slot: 2, carCode: "tiko", style: "PERIOD_CORRECT", buyer: "COLLECTOR", bonus: 120, done: false },
  ],
  roadDrops: [{ id: 1, carCode: "matiz", name: "Matiz", emoji: "🚗", price: 825, expiresAt: "2026-06-20T10:00:00Z" }],
  weeklyEvent: { type: "discount_service", label: "🔧 Arzon ta'mir haftasi (−20%)", mult: 0.8 },
  exhibition: {
    entries: [
      { id: 1, carCode: "tahoe", name: "Tahoe", emoji: "🚙", level: 4, condition: "MINT", votes: 12, mine: false },
      { id: 2, carCode: "nexia", name: "Nexia", emoji: "🚙", level: 2, condition: "GOOD", votes: 5, mine: true },
    ],
    myEntryId: 2,
    myVoteEntryId: null,
    lastWinner: { name: "Jasur", carName: "Malibu", emoji: "🏎", votes: 19 },
  },
  craftJob: { id: 9, garajCarId: 1, carName: "Nexia", emoji: "🚙", station: "TUNE", stationName: "🔧 Tюнинг stendi", finishesAt: "2030-01-01T00:00:00Z", ready: false, speedupCost: 400 },
  motorBonus: { active: true, untilAt: "2030-01-01T00:00:00Z", daysLeft: 5, speedMult: 2, fuelMult: 0.3 },
};

/** #garajdemo render-proof entry — the shell populated from the static fixture. */
export function GarajDemo() {
  return <GarajShell initial={GARAJ_DEMO} onClose={() => { window.location.hash = ""; }} />;
}

// 🏁 Garaj Bozori — the app-level "Bozor" tab market: every player's open listings
// + live auctions, buyable here without entering the game. Money logic is server-side.
export function GarajMarketView({ coins, onBanner }: { coins: number; onBanner?: (m: string) => void }) {
  const [bazaar, setBazaar] = useState<{ id: number; garajCarId: number; carCode: string; name: string; emoji: string; askPrice: number; mine: boolean }[]>([]);
  const [auctions, setAuctions] = useState<{ id: number; garajCarId: number; carCode: string; name: string; emoji: string; minBid: number; endsAt: string; mine: boolean }[]>([]);
  const [shop, setShop] = useState<{ carCode: string; name: string; emoji: string; buyPrice: number; owned: boolean; demandMult?: number }[]>([]);
  const [busy, setBusy] = useState(false);
  const [sortAsc, setSortAsc] = useState(true);
  const load = useCallback(() => {
    void api.garajBazaar().then(setBazaar).catch(() => undefined);
    void api.garajAuctions().then(setAuctions).catch(() => undefined);
    void api.garajState().then((s) => setShop(s.shop)).catch(() => undefined);
  }, []);
  useEffect(() => load(), [load]);
  const act = async (fn: () => Promise<{ ok: boolean; reason?: string }>, okMsg?: string): Promise<void> => {
    if (busy) return;
    setBusy(true);
    haptic();
    try {
      const r = await fn();
      if (r.ok) { hapticSuccess(); if (okMsg) onBanner?.(okMsg); }
      else if (r.reason === "insufficient") onBanner?.("Tanga yetarli emas");
      else if (r.reason === "already_sold") onBanner?.("Allaqachon sotilgan");
      else if (r.reason === "owned") onBanner?.("Bu mashina sizda bor");
      else if (r.reason === "self_trade") onBanner?.("O'z e'loningizni sotib ololmaysiz");
      else if (r.reason === "off") onBanner?.("Hozir mavjud emas");
      else if (!r.ok) onBanner?.("Xatolik — qayta urining");
      load();
    } catch { onBanner?.("Internet xatosi — qayta urining"); } finally { setBusy(false); }
  };
  const open = bazaar.filter((b) => !b.mine).sort((a, b) => (sortAsc ? a.askPrice - b.askPrice : b.askPrice - a.askPrice));
  const mine = bazaar.filter((b) => b.mine);
  const liveAuctions = auctions.filter((a) => !a.mine);
  return (
    <div className="view gz-market">
      <div className="gz-market-head">
        <span className="gz-market-title">🏁 Garaj Bozori</span>
        <span className="gz-market-sub">Yangi loyiha oling yoki boshqa ustalardan tiklangan mashina soting/sotib oling</span>
      </div>

      {/* 🛒 Do'kon — buy a fresh project car (moved here from the GARAJ screen) */}
      <div className="gz-sec-title">🛒 Do'kon — yangi loyiha</div>
      <div className="gz-coll">
        {shop.filter((s) => !s.owned).map((s) => (
          <div key={s.carCode} className="gz-coll-car">
            <GarajCarArt carCode={s.carCode} condition="WORN" level={1} size={94} />
            <span className="gz-coll-name">{s.name}</span>
            {s.demandMult != null && Math.abs(s.demandMult - 1) >= 0.03 && (
              <span className={`gz-demand ${s.demandMult > 1 ? "up" : "down"}`}>{s.demandMult > 1 ? `talab ↑ ${Math.round((s.demandMult - 1) * 100)}%` : `talab ↓ ${Math.round((1 - s.demandMult) * 100)}%`}</span>
            )}
            <Button sm disabled={busy || coins < s.buyPrice} onClick={() => act(() => api.garajAcquire(s.carCode), `${s.name} olindi! 🔧`)}>🪙 {s.buyPrice.toLocaleString("ru-RU")}</Button>
          </div>
        ))}
        {shop.length > 0 && shop.every((s) => s.owned) && <p className="gz-empty">Barcha mashinalar sizda! 🏆</p>}
      </div>

      {mine.length > 0 && (
        <>
          <div className="gz-sec-title">🏷 Mening sotuvdagilarim</div>
          <div className="gz-grid">
            {mine.map((b) => (
              <Card key={b.id} className="gz-car">
                <span className="gz-car-emoji">{b.emoji}</span>
                <span className="gz-car-name">{b.name}</span>
                <span className="gz-car-sub">🪙 {b.askPrice.toLocaleString("ru-RU")} · sotuvda</span>
                <Button variant="ghost" sm disabled={busy} onClick={() => act(() => api.garajBazaarUnlist(b.id), "Bekor qilindi")}>Bekor qilish</Button>
              </Card>
            ))}
          </div>
        </>
      )}

      <div className="gz-sec-title">
        🛒 Ochiq e'lonlar
        {open.length > 1 && <button className="gz-sort" onClick={() => { haptic(); setSortAsc((s) => !s); }}>{sortAsc ? "narx ↑" : "narx ↓"}</button>}
      </div>
      {open.length === 0 ? (
        <p className="gz-empty">Hozircha boshqa ustalar e'loni yo'q. GARAJ'da mashinangizni «Bozorga qo'yish» bilan birinchi bo'ling.</p>
      ) : (
        <div className="gz-grid">
          {open.map((b) => (
            <Card key={b.id} className="gz-car">
              <span className="gz-car-emoji">{b.emoji}</span>
              <span className="gz-car-name">{b.name}</span>
              <span className="gz-car-sub">🪙 {b.askPrice.toLocaleString("ru-RU")}</span>
              <Button sm disabled={busy || coins < b.askPrice} onClick={() => act(() => api.garajBazaarBuy(b.id), "Sotib olindi! 🚗")}>Sotib olish</Button>
            </Card>
          ))}
        </div>
      )}

      {liveAuctions.length > 0 && (
        <>
          <div className="gz-sec-title">🔨 Auksionlar (yopiq taklif)</div>
          <div className="col g8">
            {liveAuctions.map((a) => (
              <Card key={a.id} className="gz-auc">
                <div className="row between">
                  <span>{a.emoji} {a.name}</span>
                  <span className="fs12 dim">min 🪙{a.minBid.toLocaleString("ru-RU")}</span>
                </div>
                <div className="gz-buyers">
                  {[1, 1.5, 2].map((mult) => {
                    const bid = Math.round(a.minBid * mult);
                    return <Chip key={mult} onClick={() => act(() => api.garajAuctionBid(a.id, bid), "Taklif yuborildi 🔨")}>🪙{bid.toLocaleString("ru-RU")}</Chip>;
                  })}
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// 👤 Player collection sheet — opened by tapping a Reyting row. Shows another
// master's garage: reputation, stats, and the cars they own. Read-only.
export function GarajCollectionSheet({ memberId, name, onClose }: { memberId: number; name: string; onClose: () => void }) {
  const [col, setCol] = useState<Awaited<ReturnType<typeof api.garajCollection>>>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    api.garajCollection(memberId).then((c) => { if (alive) { setCol(c); setLoading(false); } }).catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [memberId]);
  return (
    <Sheet open onClose={onClose}>
      {loading ? (
        <p className="gz-empty">Yuklanmoqda…</p>
      ) : !col ? (
        <p className="gz-empty">Kolleksiya topilmadi.</p>
      ) : (
        <div className="col g8">
          <div className="gz-col-head">
            <span className="gz-hero-badge">{col.reputationName}</span>
            {col.prestige > 0 && <span className="gz-hero-stars">{"★".repeat(col.prestige)}</span>}
          </div>
          <div className="gz-title">{col.name || name}</div>
          <div className="gz-col-stats">
            <div><b>{col.reputationScore.toLocaleString("ru-RU")}</b><span>obro'</span></div>
            <div><b>{col.carsOwned}</b><span>mashina</span></div>
            <div><b>{col.flips}</b><span>sotuv</span></div>
            <div><b>{col.bestProfit.toLocaleString("ru-RU")}</b><span>eng zo'r foyda</span></div>
          </div>
          {col.mahalla && <div className="fs12 dim">🏘 {col.mahalla} · Daraja {col.garageTier}/5</div>}
          <div className="gz-sec-title">Kolleksiya</div>
          {col.cars.length === 0 ? (
            <p className="gz-empty">Hozircha garajda mashina yo'q.</p>
          ) : (
            <div className="gz-grid">
              {col.cars.map((c, i) => (
                <Card key={i} className="gz-car">
                  <span className={`gz-cond ${c.condition.toLowerCase()}`}>{COND_LABEL[c.condition] ?? c.condition}</span>
                  <span className="gz-car-emoji">{c.emoji}</span>
                  <span className="gz-car-name">{c.name}</span>
                  <span className="gz-car-sub">{c.level > 1 ? `★${c.level}` : "Daraja 1"}</span>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}

// 🏛 #9 Museum sheet — your collection progress + records + the Hall of Fame.
// 🌍 ochiq profil render-proof fixture (#garajdemo)
export const GARAJ_DEMO_PROFILE: PublicProfileView = {
  memberId: 0,
  name: "Sarvar",
  reputation: 18200,
  garageValue: 1250000,
  rank: 41,
  cars: [
    { serial: 11, carCode: "tracker", name: "Tracker", emoji: "🛻", engineHp: 92, dead: false },
    { serial: 211, carCode: "nexia", name: "Nexia", emoji: "🚙", engineHp: 70, dead: false },
    { serial: 987, carCode: "damas", name: "Damas", emoji: "🚐", engineHp: 0, dead: true },
  ],
};

// 🌍 ochiq profil — boshqalar garajini ko'rish (status/maqtanish). "me" = o'zingnikini ko'rish.
export function GarajProfileSheet({ demo, target, onClose }: { demo?: PublicProfileView; target?: number | "me"; onClose: () => void }) {
  const [p, setP] = useState<PublicProfileView | null>(demo ?? null);
  const [loading, setLoading] = useState(!demo);
  useEffect(() => {
    if (demo) return;
    let alive = true;
    api.garajProfile(target ?? "me").then((d) => { if (alive) { setP(d); setLoading(false); } }).catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [demo, target]);
  return (
    <Sheet open onClose={onClose}>
      {loading ? (
        <p className="gz-empty">Yuklanmoqda…</p>
      ) : !p ? (
        <p className="gz-empty">Profil topilmadi.</p>
      ) : (
        <div className="col g8">
          <div className="gz-title">👤 {p.name} garaji</div>
          <div className="gz-col-stats">
            <div><b>{p.garageValue.toLocaleString("ru-RU")}</b><span>jami qiymat</span></div>
            <div><b>{p.reputation.toLocaleString("ru-RU")}</b><span>obro'</span></div>
            <div><b>{p.rank != null ? `#${p.rank}` : "—"}</b><span>reyting</span></div>
          </div>
          <div className="gz-pillstrip" role="list">
            {p.sellerRating ? (
              <span className="gz-pill-chip gold" role="listitem"><span className="dim fs11">Sotuvchi</span><b>⭐ {p.sellerRating.avg} ({p.sellerRating.count})</b></span>
            ) : (
              <span className="gz-pill-chip" role="listitem"><span className="dim fs11">Sotuvchi</span><b>—</b></span>
            )}
            {p.cleanHistoryCount != null && p.cleanHistoryCount > 0 && (
              <span className="gz-pill-chip" role="listitem"><span className="dim fs11">Toza tarix</span><b>✨ {p.cleanHistoryCount}</b></span>
            )}
          </div>
          <div className="gz-sec-title">Mashinalar ({p.cars.length})</div>
          <div className="col g8">
            {p.cars.map((c) => (
              <div key={`${c.carCode}-${c.serial}`} className={`gz-craft${c.dead ? " gz-motor dead" : ""}`}>
                <div className="row" style={{ gap: 10, alignItems: "center" }}>
                  <GarajCarArt carCode={c.carCode} condition={c.dead ? "WORN" : "GOOD"} level={1} size={56} />
                  <div className="col">
                    <span className="gz-craft-name">{c.emoji} {c.name} <span className="gz-motor-id">#{c.serial}</span></span>
                    <span className="fs11 dim">{c.dead ? "⚠️ eskirgan" : `⚙️ ${c.engineHp}%`}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <p className="fs11 dim mt4">👀 Boshqalar sizning garajingizni ham shunday ko'radi.</p>
        </div>
      )}
    </Sheet>
  );
}

export function GarajMuseumSheet({ demo, onClose }: { demo?: typeof GARAJ_DEMO_MUSEUM; onClose: () => void }) {
  const [m, setM] = useState<Awaited<ReturnType<typeof api.garajMuseum>> | null>(demo ?? null);
  const [loading, setLoading] = useState(!demo);
  useEffect(() => {
    if (demo) return;
    let alive = true;
    api.garajMuseum().then((d) => { if (alive) { setM(d); setLoading(false); } }).catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [demo]);
  return (
    <Sheet open onClose={onClose}>
      {loading ? (
        <p className="gz-empty">Yuklanmoqda…</p>
      ) : !m ? (
        <p className="gz-empty">Muzey topilmadi.</p>
      ) : (
        <div className="col g8">
          <div className="gz-title">🏛 Muzey</div>
          <div className="gz-col-stats">
            <div><b>{m.collectedCount}/{m.totalModels}</b><span>kolleksiya</span></div>
            <div><b>{m.totalFlips}</b><span>sotuv</span></div>
            <div><b>{m.bestProfit.toLocaleString("ru-RU")}</b><span>rekord foyda</span></div>
          </div>
          <div className="gz-sec-title">Kolleksiya — egallagan modellaringiz</div>
          <div className="gz-museum-grid">
            {m.collection.map((c) => (
              <div key={c.carCode} className={`gz-museum-car${c.owned ? "" : " locked"}`}>
                <span className="gz-museum-emoji">{c.owned ? c.emoji : "🔒"}</span>
                <span className="fs11">{c.name}</span>
              </div>
            ))}
          </div>
          {m.hallOfFame.length > 0 && (
            <>
              <div className="gz-sec-title">🏅 Shon zali — Prestij afsonalari</div>
              <div className="gz-hist">
                {m.hallOfFame.map((h, i) => (
                  <div key={i} className="gz-hist-row">
                    <span className="gz-hist-emoji">{"★".repeat(Math.min(5, h.prestigeCount))}</span>
                    <span className="gz-hist-name">{h.name}</span>
                    <span className="gz-hist-amt">obro' {h.repAtEntry.toLocaleString("ru-RU")}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </Sheet>
  );
}

// ✨ P1-F — ORZU board sheet (global ranking + per-model #1 podium + Muzey extend)
export function GarajOrzuSheet({ onClose }: { onClose: () => void }) {
  const [b, setB] = useState<OrzuBoardView | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    api.garajOrzu().then((r) => { if (alive) { setB(r.board ?? null); setLoading(false); } }).catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);
  return (
    <Sheet open onClose={onClose}>
      {loading ? (
        <p className="gz-empty">Yuklanmoqda…</p>
      ) : !b ? (
        <p className="gz-empty">ORZU hozir ochiq emas.</p>
      ) : (
        <div className="col g8">
          <div className="gz-title">✨ ORZU — eng zo'rlar</div>
          {b.myRank != null && (
            <div className="gz-pillstrip" role="list">
              <span className="gz-pill-chip gold"><span className="dim fs11">Mening o'rnim</span><b>#{b.myRank}</b></span>
            </div>
          )}
          <div className="gz-sec-title">🏆 Top garajlar</div>
          {b.topGarages.length === 0 ? (
            <p className="gz-empty">Hali hech kim garaj yig'magan.</p>
          ) : (
            <div className="gz-hist">
              {b.topGarages.map((t) => (
                <div key={t.memberId} className="gz-hist-row">
                  <span className="gz-hist-emoji">{t.rank <= 3 ? ["🥇","🥈","🥉"][t.rank - 1] : `#${t.rank}`}</span>
                  <span className="gz-hist-name">{t.name}{t.cleanHistoryCount > 0 ? ` ✨${t.cleanHistoryCount}` : ""}</span>
                  <span className="gz-hist-amt">🪙 {t.garageValue.toLocaleString("ru-RU")} · {t.carCount} 🚗</span>
                </div>
              ))}
            </div>
          )}
          <div className="gz-sec-title">🏛 Model chempionlari (eng eski #raqam)</div>
          <div className="gz-museum-grid">
            {b.modelChampions.map((m) => (
              <div key={m.carCode} className={`gz-museum-car${m.champion ? "" : " locked"}`}>
                <span className="gz-museum-emoji">{m.emoji}</span>
                <span className="fs11">{m.name}</span>
                <span className="fs11 dim">{m.champion ? `#${m.champion.serial} · ${m.champion.name}` : "—"}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Sheet>
  );
}

// 🔍 P1-E + DIAG-Bazaar — CarCheck 3-tier modal. Accepts EITHER a GarajCarView (own car) OR a
// lightweight target { id, carCode, name, emoji, serial? } (e.g. a bazaar/auction listing of
// SOMEONE ELSE'S car — pre-buy inspection). Backend allows any garajCarId.
export type CarCheckTarget = { id: number; carCode: string; name: string; emoji: string; serial?: number | null };
export function GarajCarCheckSheet({ car, onClose }: { car: CarCheckTarget; onClose: () => void }) {
  const [tier, setTier] = useState<"ODDIY" | "EKSPERT" | "PREMIUM">("ODDIY");
  const [check, setCheck] = useState<CarCheckView | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const cost = tier === "ODDIY" ? 50 : tier === "EKSPERT" ? 500 : 5000;
  async function run(): Promise<void> {
    if (busy) return; setBusy(true); setErr(null); haptic();
    try {
      const r = await api.garajCarCheck(car.id, tier);
      if (r.ok && r.check) { setCheck(r.check); hapticSuccess(); }
      else setErr(r.reason === "insufficient" ? "Tanga yetarli emas" : "Tekshirib bo'lmadi");
    } catch { setErr("Xato"); } finally { setBusy(false); }
  }
  return (
    <Sheet open onClose={onClose}>
      <div className="col g8">
        <div className="gz-title">🔍 CarCheck · {car.emoji} {car.name}{car.serial != null ? <> <span className="gz-motor-id">#{car.serial}</span></> : null}</div>
        {!check ? (
          <>
            <p className="fs12 dim mt0">Tarix saqlanadi, soxtalashtirib bo'lmaydi. Tier qancha balandsa, shuncha ko'p ma'lumot.</p>
            <div className="row g8">
              {(["ODDIY","EKSPERT","PREMIUM"] as const).map((t) => (
                <Chip key={t} on={tier === t} onClick={() => { haptic(); setTier(t); }}>
                  {t === "ODDIY" ? "Oddiy" : t === "EKSPERT" ? "Ekspert" : "Premium"}
                </Chip>
              ))}
            </div>
            <div className="fs12 dim">
              {tier === "ODDIY" && "Asosiy ma'lumot: #serial, yosh, eyilish."}
              {tier === "EKSPERT" && "+ Zona kondisiyalari, kapital remont soni."}
              {tier === "PREMIUM" && "+ Yashirin nuqson · ma'lumot narxi · sotuvchi reytingi (birinchi marta BEPUL)"}
            </div>
            <Button disabled={busy} onClick={run}>🔍 Tekshirish · 🪙{cost.toLocaleString("ru-RU")}</Button>
            {err && <div className="fs12" style={{ color: "var(--err)" }}>{err}</div>}
          </>
        ) : (
          <div className="col g8">
            <div className="gz-list-break">
              <div className="row between"><span className="dim">#raqam</span><b>{check.serial ?? "—"}</b></div>
              <div className="row between"><span className="dim">Eyilish</span><b>{check.engineHp}%</b></div>
              <div className="row between"><span className="dim">Yosh</span><b>{check.ageDays} kun</b></div>
              <div className="row between"><span className="dim">Egalar / safarlar</span><b>{check.ownerCount} / {check.totalTrips}</b></div>
              {check.capitalRepairCount != null && <div className="row between"><span className="dim">Kapital remont</span><b>{check.capitalRepairCount}</b></div>}
              {check.zones && (
                <div className="col g2">
                  <span className="dim fs11">Zonalar:</span>
                  {Object.entries(check.zones).map(([z, v]) => (
                    <div key={z} className="row between fs12"><span>{ZONE_NAMES[z] ?? z}</span><b>{v}%</b></div>
                  ))}
                </div>
              )}
              {check.referencePrice != null && <div className="row between"><span className="dim">Bozor narxi (ko'rsatkich)</span><b>🪙 {check.referencePrice.toLocaleString("ru-RU")}</b></div>}
              {check.sellerRating != null && <div className="row between"><span className="dim">Sotuvchi reytingi</span><b>⭐ {check.sellerRating}</b></div>}
              {check.hiddenDefect && (
                <div className="row between" style={{ color: "var(--err)" }}>
                  <span>⚠️ Yashirin nuqson</span><b>{ZONE_NAMES[check.hiddenDefect.zone] ?? check.hiddenDefect.zone} ({check.hiddenDefect.severity === "major" ? "katta" : "kichik"})</b>
                </div>
              )}
              {check.tier === "PREMIUM" && !check.hiddenDefect && <div className="row between" style={{ color: "var(--win)" }}><span>✓ Yashirin nuqson</span><b>YO'Q</b></div>}
              {check.freeOfChargeUsed && <div className="fs11 dim">🎁 Birinchi Premium BEPUL ishlatildi.</div>}
            </div>
            <Button variant="ghost" onClick={onClose}>Yopish</Button>
          </div>
        )}
      </div>
    </Sheet>
  );
}

// 🚀 P2-C — Speeder sheet (limited daily stock + price + duration + active state)
export function GarajSpeederSheet({ car, onBuy, onClose }: { car: GarajCarView; onBuy: (carId: number) => Promise<void>; onClose: () => void }) {
  const [st, setSt] = useState<Awaited<ReturnType<typeof api.garajSpeederState>> | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    api.garajSpeederState().then((r) => { if (alive) { setSt(r); setLoading(false); } }).catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);
  async function buy(): Promise<void> {
    if (busy) return; setBusy(true);
    try { await onBuy(car.id); } finally { setBusy(false); onClose(); }
  }
  return (
    <Sheet open onClose={onClose}>
      <div className="col g8">
        <div className="gz-title">🚀 Speeder · {car.emoji} {car.name} <span className="gz-motor-id">#{car.serial ?? "?"}</span></div>
        {loading ? (
          <p className="gz-empty">Yuklanmoqda…</p>
        ) : !st || !st.ok ? (
          <p className="gz-empty">{st?.reason === "off" ? "Speeder hozir ochiq emas." : "Yuklab bo'lmadi."}</p>
        ) : (
          <>
            <div className="gz-list-break">
              <div className="row between"><span className="dim fs12">Daromad tezligi (×)</span><b style={{ color: "var(--brand)" }}>×{st.mult ?? 4}</b></div>
              <div className="row between"><span className="dim fs12">Davomiyligi</span><b>{st.days ?? SPEEDER_DAYS} kun</b></div>
              <div className="row between"><span className="dim fs12">Narxi (hozir)</span><b>🪙 {(st.price ?? 5000).toLocaleString("ru-RU")}</b></div>
              <div className="row between"><span className="dim fs12">Zaxira</span><b>{st.stockLeft ?? 0}/{st.stockMax ?? 0}</b></div>
            </div>
            <div className="fs11 dim">⚡ Zaxira kamaygan sari narx oshadi — erta olgan arzon oladi.</div>
            {car.speederActive && (car.speederHoursLeft ?? 0) > 0 ? (
              <div className="fs12" style={{ color: "var(--brand)" }}>🚀 Hozir aktiv · {Math.round((car.speederHoursLeft ?? 0) / 24)} kun qoldi. Sotib olsangiz vaqt UZAYADI.</div>
            ) : (
              <div className="fs12 dim">⚠️ Speeder yoqilg'ini TEZ tugatadi — bak qisqaroq turadi. Lekin daromad ×{st.mult ?? 4} bo'ladi.</div>
            )}
            <Button disabled={busy || (st.stockLeft ?? 0) <= 0} onClick={buy}>
              🚀 {car.speederActive ? "Uzaytirish" : "Sotib olish"} · 🪙{(st.price ?? 5000).toLocaleString("ru-RU")}
            </Button>
            {(st.stockLeft ?? 0) <= 0 && <div className="fs11" style={{ color: "var(--err)" }}>Bugun zaxira tugadi — ertaga qayta urinib ko'ring.</div>}
            <Button variant="ghost" onClick={onClose}>Yopish</Button>
          </>
        )}
      </div>
    </Sheet>
  );
}

// 🔗 P2-A — Merge sheet (pick a sacrifice to promote this car; mergeMult preview)
export function GarajMergeSheet({ keep, others, onMerge, onClose }: { keep: GarajCarView; others: GarajCarView[]; onMerge: (sacId: number) => Promise<void>; onClose: () => void }) {
  const [selected, setSelected] = useState<number | null>(others.length === 1 ? others[0]!.id : null);
  const [busy, setBusy] = useState(false);
  const cur = keep.mergeCount ?? 0;
  const next = Math.min(MERGE_MAX_COUNT, cur + 1);
  const curMult = mergeMult(cur);
  const nextMult = mergeMult(next);
  async function confirm(): Promise<void> {
    if (busy || selected == null) return;
    setBusy(true);
    try { await onMerge(selected); } finally { setBusy(false); onClose(); }
  }
  return (
    <Sheet open onClose={onClose}>
      <div className="col g8">
        <div className="gz-title">🔗 Toplash · {keep.emoji} {keep.name}</div>
        <div className="gz-list-break">
          <div className="row between"><span className="dim fs12">Hozirgi bosqich</span><b>★{cur}/{MERGE_MAX_COUNT} · ×{curMult.toFixed(2)}</b></div>
          <div className="row between"><span className="dim fs12">Toplashdan keyin</span><b style={{ color: "var(--brand)" }}>★{next}/{MERGE_MAX_COUNT} · ×{nextMult.toFixed(2)}</b></div>
        </div>
        <p className="fs12 dim mt0">Boshqa mashinangizdan birini qurbon qiling. U abadiy yo'qoladi, lekin bu mashina KUCHAYADI: dvigatel 100% gacha tiklanadi, daraja oshadi, sotuv narxi +10% bo'ladi.</p>
        <div className="gz-sec-title">Qurbon mashinasi:</div>
        <div className="col g8">
          {others.length === 0 ? (
            <p className="gz-empty">Boshqa mashinangiz yo'q — avval yana bitta oling.</p>
          ) : (
            others.map((o) => (
              <button key={o.id} type="button" className={`gz-craft${selected === o.id ? " selected" : ""}`} onClick={() => { haptic(); setSelected(o.id); }}>
                <div className="row" style={{ gap: 10, alignItems: "center" }}>
                  <GarajCarArt carCode={o.carCode} condition={o.condition} level={o.level} size={56} />
                  <div className="col">
                    <span className="gz-craft-name">{o.emoji} {o.name} <span className="gz-motor-id">#{o.serial ?? "?"}</span></span>
                    <span className="fs11 dim">⚙️ {o.engineHp ?? 100}% · 🕐 {o.ageDays ?? 0} kun</span>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
        <Button disabled={busy || selected == null || cur >= MERGE_MAX_COUNT} onClick={confirm}>
          🔗 Toplashni tasdiqlash
        </Button>
        <Button variant="ghost" onClick={onClose}>Bekor</Button>
        {cur >= MERGE_MAX_COUNT && <div className="fs11" style={{ color: "var(--err)" }}>Maksimum bosqichga yetilgan — endi toplab bo'lmaydi.</div>}
      </div>
    </Sheet>
  );
}

// ⚠️ P1-B/C — Eskirdi action sheet (Ofis sotish · Kapital remont · Bekor)
export function GarajEskirdiSheet({ car, busy, onSellOfis, onCapital, onClose }: { car: GarajCarView; busy: boolean; onSellOfis: () => void; onCapital: () => void; onClose: () => void }) {
  const ofisBid = car.ofisBidPrice ?? Math.floor((MAKE_BASE[car.carCode] ?? 0) * 0.8);
  return (
    <Sheet open onClose={onClose}>
      <div className="col g8">
        <div className="gz-title">⚠️ Eskirdi · {car.emoji} {car.name} <span className="gz-motor-id">#{car.serial ?? "?"}</span></div>
        <p className="fs12 dim mt0">Mashinangizning dvigateli tugadi. Tanlang:</p>
        <Button disabled={busy} onClick={onSellOfis}>🏛 1067 Ofisga sotish · 🪙 {ofisBid.toLocaleString("ru-RU")}</Button>
        <Button variant="ghost" disabled={busy} onClick={onCapital}>🔧 Kapital remont (dvigatel almashtirish)</Button>
        <Button variant="ghost" disabled={busy} onClick={onClose}>Hozir emas</Button>
        <p className="fs11 dim mt0">💡 Ofis sotish — eng tezi · Kapital remont — eyilish 100% qayta tiklanadi.</p>
      </div>
    </Sheet>
  );
}

// 90-second onboarding — scripted first restoration on a free starter Tiko.
// Pure visual until the final "sell" step, which calls the one-time +80 grant.
function GarajFtue({ onDone }: { onDone: (grant: number) => void }) {
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const STEPS = [
    { emoji: "🚗", title: "Xush kelibsiz, usta!", body: "Mana hovlingizdagi birinchi loyiha — buzuq Tiko. Keling, unga jon beramiz.", btn: "Boshlaymiz" },
    { emoji: "🔧", title: "Detalni o'rnating", body: "Bitta detal qo'yamiz — usta ishi shunday boshlanadi.", btn: "Detal qo'y" },
    { emoji: "🔑", title: "Dvigatelni sinang", body: "Endi ishlaydimi? Vrooom!", btn: "Sinab ko'r" },
    { emoji: "💰", title: "Xaridor topildi!", body: "Tiklangan Tiko'ni sotamiz — birinchi foydangiz.", btn: "Sotish" },
  ];
  const cur = STEPS[Math.min(step, STEPS.length - 1)]!;
  const advance = async (): Promise<void> => {
    if (busy) return;
    haptic();
    if (step < STEPS.length - 1) {
      setStep(step + 1);
      return;
    }
    setBusy(true);
    try {
      const r = await api.garajOnboardFinish();
      onDone(r.grant ?? 80);
    } catch {
      onDone(0);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="gz-ftue">
      <div className="gz-ftue-car">{cur.emoji}</div>
      <h2 className="gz-ftue-title">{cur.title}</h2>
      <p className="gz-ftue-body">{cur.body}</p>
      <Button onClick={advance} disabled={busy}>{busy ? "…" : cur.btn}</Button>
      <div className="gz-ftue-dots">
        {STEPS.map((_, i) => (
          <span key={i} className={i <= step ? "on" : ""} />
        ))}
      </div>
    </div>
  );
}

// Timing mini-game — a marker sweeps a bar; tap in the green zone for a better
// repair (raises repairQualityBonus → higher flip price). Avtomatik = skip (a11y).
