import { useEffect, useState } from "react";
import { WHEEL_PRIZES, formatNumber, type BoxStatusResponse, type GarageResponse, type MeResponse } from "@t1067/shared";
import { api } from "./api";
import { haptic } from "./telegram";
import { confetti } from "./util";

// 🚗 Garaj — ride-to-earn cars: buy (sink) → it earns ONLY during real rides.
function GarageSection({ onReward }: { onReward: (msg: string) => void }) {
  const [g, setG] = useState<GarageResponse | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const load = () => api.garage().then(setG).catch(() => undefined);
  useEffect(() => {
    load();
  }, []);
  if (!g) return null;

  const act = async (fn: () => Promise<unknown>, code: string, okMsg: (r: { ok: boolean; reason?: string }) => string) => {
    if (busy) return;
    setBusy(code);
    haptic();
    try {
      const r = (await fn()) as { ok: boolean; reason?: string };
      onReward(okMsg(r));
      await load();
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="glass pad game-card">
      <div className="section-title">🚗 Garaj — mashinangiz safarda ishlaydi</div>
      <p className="muted mk-sub">Mashina sotib oling — siz taksida ketayotganingizda u sizga tanga ishlab beradi (daqiqasiga, 20 daq/safar cap).</p>
      <div className="mk-listings">
        {g.cars.map((c) => (
          <div key={c.code} className="mk-item" style={{ cursor: "default" }}>
            <span className="mk-item-emoji">{c.emoji}</span>
            <span className="mk-item-title">
              {c.name} · {c.ratePerMin}/daq
              {c.owned && c.serviceDue && <span className="muted"> · 🔧 servis kerak (50%)</span>}
              {c.equipped && <span> · 🟢 minilgan</span>}
            </span>
            {!c.owned ? (
              <button className="btn-primary sm" disabled={busy !== null} onClick={() => act(() => api.garageBuy(c.code), c.code, (r) => (r.ok ? `🚗 ${c.name} sizniki!` : r.reason === "insufficient" ? "Tanga yetarli emas" : "Xatolik"))}>
                {busy === c.code ? "…" : `🪙 ${formatNumber(c.price)}`}
              </button>
            ) : c.serviceDue ? (
              <button className="btn-violet sm" disabled={busy !== null} onClick={() => act(() => api.garageService(c.code), c.code, (r) => (r.ok ? "🔧 Servis qilindi — to'liq tezlik!" : r.reason === "insufficient" ? "Tanga yetarli emas" : "Hali kerak emas"))}>
                {busy === c.code ? "…" : `🔧 ${formatNumber(c.serviceCost)}`}
              </button>
            ) : !c.equipped ? (
              <button className="btn-ghost sm" disabled={busy !== null} onClick={() => act(() => api.garageEquip(c.code), c.code, () => `🟢 ${c.name} minildi!`)}>
                {busy === c.code ? "…" : "Minish"}
              </button>
            ) : (
              <span className="mk-item-price">🟢</span>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function SpinWheelGame({ me, onReward }: { me: MeResponse; onReward: (msg: string) => void }) {
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [freeUsed, setFreeUsed] = useState(!me.wheelAvailable);
  const [jackpot, setJackpot] = useState(me.jackpot);
  const N = WHEEL_PRIZES.length;
  const seg = 360 / N;

  const spin = async () => {
    if (spinning) return;
    setSpinning(true);
    haptic();
    try {
      const res = await api.spinWheel();
      if (res.noRide) {
        onReward("🚕 G'ildirak safar paytida aylanadi — taxi chaqiring!");
        setSpinning(false);
        return;
      }
      if (res.alreadySpun) {
        setFreeUsed(true);
        setSpinning(false);
        onReward("Bu safarning spini ishlatilgan ✅");
        return;
      }
      const idx = Math.max(0, WHEEL_PRIZES.findIndex((p) => p.label === res.prize.label));
      setRotation((prev) => prev - (prev % 360) + 360 * 6 + (360 - (idx * seg + seg / 2)));
      setTimeout(() => {
        setSpinning(false);
        setFreeUsed(true);
        setJackpot(res.jackpot);
        if (res.prize.amount > 0) confetti();
        onReward(
          res.prize.amount > 0
            ? `${res.prize.emoji} +${formatNumber(res.prize.amount)} coin!`
            : `${res.prize.emoji} ${res.prize.label} — yana urinib ko'ring!`,
        );
      }, 4200);
    } catch {
      setSpinning(false);
    }
  };

  return (
    <section className="glass pad game-card">
      <div className="game-head">
        <div className="section-title">🎡 Omad g'ildiragi</div>
        <div className="jackpot-badge">🎰 <b>{formatNumber(jackpot)}</b></div>
      </div>
      <div className="wheel-wrap">
        <div className="wheel-pointer">▼</div>
        <svg
          viewBox="0 0 200 200"
          className="wheel"
          style={{ transform: `rotate(${rotation}deg)`, transition: spinning ? "transform 4s cubic-bezier(.18,.7,.16,1)" : "none" }}
        >
          {WHEEL_PRIZES.map((p, i) => {
            const a0 = ((i * seg - 90) * Math.PI) / 180;
            const a1 = (((i + 1) * seg - 90) * Math.PI) / 180;
            const x0 = 100 + 96 * Math.cos(a0);
            const y0 = 100 + 96 * Math.sin(a0);
            const x1 = 100 + 96 * Math.cos(a1);
            const y1 = 100 + 96 * Math.sin(a1);
            const mid = (((i + 0.5) * seg - 90) * Math.PI) / 180;
            const lx = 100 + 62 * Math.cos(mid);
            const ly = 100 + 62 * Math.sin(mid);
            return (
              <g key={i}>
                <path d={`M100 100 L${x0.toFixed(2)} ${y0.toFixed(2)} A96 96 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z`} fill={p.color} stroke="#070910" strokeWidth="1" />
                <text x={lx} y={ly} fontSize="17" textAnchor="middle" dominantBaseline="middle" transform={`rotate(${(i + 0.5) * seg} ${lx.toFixed(2)} ${ly.toFixed(2)})`}>
                  {p.emoji}
                </text>
              </g>
            );
          })}
          <circle cx="100" cy="100" r="15" fill="#10182b" stroke="var(--gold)" strokeWidth="2" />
        </svg>
      </div>
      {me.wheelAvailable && !freeUsed ? (
        <button className="btn-primary" onClick={spin} disabled={spinning}>
          {spinning ? "Aylanmoqda…" : "🎡 AYLANTIRISH (safardasiz!)"}
        </button>
      ) : (
        <div className="sheet-warn">🚕 G'ildirak SAFAR PAYTIDA aylanadi — har safar 1 spin, har spin yutadi!</div>
      )}
      <div className="muted game-hint">Har safar JACKPOT'ni oshiradi — JACKPOT tushsa butun jamg'arma sizniki!</div>
    </section>
  );
}

function BoxGame({ onReward }: { onReward: (msg: string) => void }) {
  const [box, setBox] = useState<BoxStatusResponse | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => api.box().then(setBox).catch(() => undefined);
  useEffect(() => {
    load();
  }, []);

  const open = async () => {
    if (busy) return;
    setBusy(true);
    haptic();
    try {
      const r = await api.openBox();
      if (r.ok && r.prize) {
        confetti();
        onReward(`🎁 ${r.prize.emoji} +${formatNumber(r.prize.amount)} coin!`);
      } else if (r.reason === "locked") {
        onReward("🎯 Avval kunlik vazifalarni tugating!");
      }
      await load();
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  };

  if (!box) return null;
  const pct = Math.round((box.dailiesDone / Math.max(1, box.dailiesTotal)) * 100);

  return (
    <section className="glass pad game-card">
      <div className="section-title">🎁 Sirli qutilar</div>
      <div className="box-duo">
        <div className={"box-tile" + (box.eligible && !box.opened ? " ready" : "")}>
          <div className="box-tile-emoji">{box.opened ? "🎊" : "🎁"}</div>
          <div className="box-tile-name">Kunlik quti</div>
          {box.opened && box.prize ? (
            <div className="muted box-tile-sub">Bugun: {box.prize.emoji} {box.prize.label}</div>
          ) : box.eligible ? (
            <button className="btn-primary sm" disabled={busy} onClick={open}>
              {busy ? "…" : "Ochish"}
            </button>
          ) : (
            <>
              <div className="box-bar"><span style={{ width: `${pct}%` }} /></div>
              <div className="muted box-tile-sub">Vazifalar {box.dailiesDone}/{box.dailiesTotal}</div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

/**
 * Rewards hub (was the arcade): the book-aligned variable-reward layer tied to
 * rides — daily free spin + mystery box. Arcade games removed; Phase 2 adds the
 * ride-cashback roll, streak, lucky-day and level here.
 */
export function RewardsView({ me, onReward }: { me: MeResponse; onReward: (msg: string) => void }) {
  return (
    <div className="view">
      <div className="section-title">🎁 Bonuslar</div>
      <GarageSection onReward={onReward} />
      <SpinWheelGame me={me} onReward={onReward} />
      <BoxGame onReward={onReward} />
      <div className="muted game-hint" style={{ textAlign: "center", marginTop: 8 }}>
        Har safar coin va bonus olib keladi 🚕 — ko'proq safar, ko'proq omad!
      </div>
    </div>
  );
}
