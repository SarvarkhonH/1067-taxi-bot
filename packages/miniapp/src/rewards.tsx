import { useEffect, useRef, useState } from "react";
import { WHEEL_PRIZES, formatNumber, type BoxStatusResponse, type GarageResponse, type MeResponse } from "@t1067/shared";
import { api } from "./api";
import { haptic } from "./telegram";
import { confetti } from "./util";
import { RouletteWheel } from "./design/RouletteWheel";
import { LoadSection, ProgressBar } from "./design/components";

// 🚗 Garaj — ride-to-earn cars: buy (sink) → it earns ONLY during real rides.
function GarageSection({ onReward }: { onReward: (msg: string) => void }) {
  const [g, setG] = useState<GarageResponse | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState(false);
  const load = () => api.garage().then((r) => { setG(r); setErr(false); }).catch(() => setErr(true));
  useEffect(() => {
    load();
  }, []);
  if (err) {
    return (
      <section className="glass pad game-card">
        <div className="section-title">🚗 Garaj</div>
        <LoadSection state="error" onRetry={load}><span /></LoadSection>
      </section>
    );
  }
  if (!g) {
    return (
      <section className="glass pad game-card">
        <div className="section-title">🚗 Garaj</div>
        <LoadSection state="loading" onRetry={load}><span /></LoadSection>
      </section>
    );
  }

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
          <div key={c.code} className="mk-item">
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

// 1067 Plus — coin-paid sub: roll x1.5 (capped) + garage +20%; first month free.
function PlusSection({ onReward }: { onReward: (msg: string) => void }) {
  const [p, setP] = useState<{ active: boolean; until: string | null; price: number; trialAvailable: boolean; canBuy: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const load = () => api.plus().then(setP).catch(() => undefined);
  useEffect(() => {
    load();
  }, []);
  if (!p) return null;

  const sub = async () => {
    if (busy) return;
    setBusy(true);
    haptic();
    try {
      const r = await api.plusSubscribe();
      if (r.ok) {
        confetti();
        onReward(r.free ? "💎 1067 Plus yoqildi — birinchi oy BEPUL!" : "💎 1067 Plus 30 kunga yangilandi!");
      } else {
        onReward(r.reason === "insufficient" ? "Tanga yetarli emas" : r.reason === "need_ride" ? "Avval kamida 1 safar qiling 🚕" : r.reason === "already_active" ? "Plus allaqachon faol" : "Xatolik");
      }
      await load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="glass pad game-card">
      <div className="section-title">💎 1067 Plus</div>
      {p.active ? (
        <p className="muted mk-sub">Faol{p.until ? ` · ${new Date(p.until).toLocaleDateString("ru-RU")} gacha` : ""} — cashback ×1.5 va Garaj +20% ishlayapti! 🎉</p>
      ) : (
        <>
          <p className="muted mk-sub">Cashback ruletkasi ×1.5 · Garaj +20% · {p.trialAvailable ? "Birinchi oy BEPUL!" : `${formatNumber(p.price)} tanga/oy`}</p>
          <button className="btn-violet" disabled={busy || !p.canBuy} onClick={sub}>
            {busy ? "…" : p.trialAvailable ? "💎 BEPUL sinash (30 kun)" : `💎 Yoqish — ${formatNumber(p.price)} tanga`}
          </button>
          {!p.canBuy && <div className="muted game-hint">Avval kamida 1 safar qiling 🚕</div>}
        </>
      )}
    </section>
  );
}

function SpinWheelGame({ me, onReward }: { me: MeResponse; onReward: (msg: string) => void }) {
  const [spinId, setSpinId] = useState(0);
  const [target, setTarget] = useState<number | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [freeUsed, setFreeUsed] = useState(!me.wheelAvailable);
  const [jackpot, setJackpot] = useState(me.jackpot);
  const pend = useRef<{ msg: string; jackpot: number; win: boolean } | null>(null);

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
      pend.current = {
        win: res.prize.amount > 0,
        jackpot: res.jackpot,
        msg: res.prize.amount > 0 ? `${res.prize.emoji} +${formatNumber(res.prize.amount)} tanga!` : `${res.prize.emoji} ${res.prize.label} — yana urinib ko'ring!`,
      };
      setTarget(idx);
      setSpinId((n) => n + 1);
    } catch {
      setSpinning(false);
    }
  };

  // g'ildirak to'xtadi: yutuq oqimi — konfetti 600ms → toast/countup → haptic
  const onWheelDone = () => {
    setSpinning(false);
    setFreeUsed(true);
    if (!pend.current) return;
    setJackpot(pend.current.jackpot);
    if (pend.current.win) confetti();
    onReward(pend.current.msg);
    pend.current = null;
  };

  return (
    <section className="glass pad game-card">
      <div className="game-head">
        <div className="section-title">🎡 Omad g'ildiragi</div>
        <div className="jackpot-badge">🎰 <b>{formatNumber(jackpot)}</b></div>
      </div>
      <RouletteWheel prizes={WHEEL_PRIZES} targetIndex={target} spinId={spinId} onDone={onWheelDone} />
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

  const [boxErr, setBoxErr] = useState(false);
  const load = () => api.box().then((r) => { setBox(r); setBoxErr(false); }).catch(() => setBoxErr(true));
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
        onReward(`🎁 ${r.prize.emoji} +${formatNumber(r.prize.amount)} tanga!`);
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

  if (boxErr) {
    return (
      <section className="glass pad game-card">
        <div className="section-title">🎁 Sirli qutilar</div>
        <LoadSection state="error" onRetry={load}><span /></LoadSection>
      </section>
    );
  }
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
              <ProgressBar className="mt6" value={pct} />
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
      <GarageSection onReward={onReward} />\n      <PlusSection onReward={onReward} />
      <SpinWheelGame me={me} onReward={onReward} />
      <BoxGame onReward={onReward} />
      <div className="muted game-hint tac mt8">
        Har safar coin va bonus olib keladi 🚕 — ko'proq safar, ko'proq omad!
      </div>
    </div>
  );
}
