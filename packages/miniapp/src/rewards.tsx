import { useEffect, useRef, useState } from "react";
import { WHEEL_PRIZES, formatNumber, type BoxStatusResponse, type MeResponse, type MissionsResponse } from "@t1067/shared";
import { api } from "./api";
import { haptic, hapticSuccess } from "./telegram";
import { confetti } from "./util";
import { RouletteWheel } from "./design/RouletteWheel";
import { LoadSection, ProgressBar } from "./design/components";

// ✨ Yutuq "juice" — har HAQIQIY tanga yutug'ida bitta katta bayram: konfetti + success-haptik
// + 0→N count-up. O'yinlar buni celebrate(amount, emoji, label) bilan chaqiradi. FAQAT faucet
// (g'ildirak/quti/streak-milestone) — spend/sink (Plus obuna) emas.
export type Celebrate = (amount: number, emoji: string, label?: string) => void;

export function WinBurst({ amount, emoji, label, onDone }: { amount: number; emoji: string; label?: string; onDone: () => void }) {
  const [n, setN] = useState(0);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  useEffect(() => {
    hapticSuccess();
    confetti(34);
    const ms = 900;
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      const eased = 1 - Math.pow(1 - p, 3);
      setN(Math.round(amount * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const done = setTimeout(() => doneRef.current(), 1750);
    return () => { cancelAnimationFrame(raf); clearTimeout(done); };
  }, [amount]);
  return (
    <div className="winburst" onClick={() => doneRef.current()}>
      <div className="wb-card">
        <div className="wb-emoji">{emoji}</div>
        <div className="wb-amount">+{formatNumber(n)} <span className="wb-coin">🪙</span></div>
        {label ? <div className="wb-label">{label}</div> : null}
      </div>
    </div>
  );
}

// 1067 Plus — coin-paid sub: roll x1.5 (capped); first month free.
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
        <p className="muted mk-sub">Faol{p.until ? ` · ${new Date(p.until).toLocaleDateString("ru-RU")} gacha` : ""} — cashback ×1.5 ishlayapti! 🎉</p>
      ) : (
        <>
          <p className="muted mk-sub">Cashback ruletkasi ×1.5 · {p.trialAvailable ? "Birinchi oy BEPUL!" : `${formatNumber(p.price)} tanga/oy`}</p>
          <button className="btn-violet" disabled={busy || !p.canBuy} onClick={sub}>
            {busy ? "…" : p.trialAvailable ? "💎 BEPUL sinash (30 kun)" : `💎 Yoqish — ${formatNumber(p.price)} tanga`}
          </button>
          {!p.canBuy && <div className="muted game-hint">Avval kamida 1 safar qiling 🚕</div>}
        </>
      )}
    </section>
  );
}

export function SpinWheelGame({ me, onReward, celebrate }: { me: MeResponse; onReward: (msg: string) => void; celebrate: Celebrate }) {
  const [spinId, setSpinId] = useState(0);
  const [target, setTarget] = useState<number | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [freeUsed, setFreeUsed] = useState(!me.wheelAvailable);
  const [jackpot, setJackpot] = useState(me.jackpot);
  const pend = useRef<{ msg: string; jackpot: number; win: boolean; amount: number; emoji: string } | null>(null);

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
        amount: res.prize.amount,
        emoji: res.prize.emoji,
        jackpot: res.jackpot,
        msg: res.prize.amount > 0 ? `${res.prize.emoji} +${formatNumber(res.prize.amount)} tanga!` : `${res.prize.emoji} ${res.prize.label} — yana urinib ko'ring!`,
      };
      setTarget(idx);
      setSpinId((n) => n + 1);
    } catch {
      setSpinning(false);
    }
  };

  // 🎁 Free DAILY spin — the wheel is playable even when not on a ride (1/day, server-capped)
  const freeSpinFn = async () => {
    if (spinning) return;
    setSpinning(true);
    haptic();
    try {
      const res = await api.wheelFree();
      if (res.alreadyUsed) {
        setSpinning(false);
        onReward("Bugungi bepul spin ishlatilgan — ertaga yana! ✅");
        return;
      }
      const idx = Math.max(0, WHEEL_PRIZES.findIndex((p) => p.label === res.prize.label));
      pend.current = { win: res.prize.amount > 0, amount: res.prize.amount, emoji: res.prize.emoji, jackpot: res.jackpot, msg: `${res.prize.emoji} +${formatNumber(res.prize.amount)} tanga!` };
      setTarget(idx);
      setSpinId((n) => n + 1);
    } catch {
      setSpinning(false);
    }
  };

  // g'ildirak to'xtadi: yutuq oqimi — yutsa katta WinBurst bayrami, aks holda oddiy toast
  const onWheelDone = () => {
    setSpinning(false);
    setFreeUsed(true);
    if (!pend.current) return;
    setJackpot(pend.current.jackpot);
    const p = pend.current;
    pend.current = null;
    if (p.win) celebrate(p.amount, p.emoji, "Omad g'ildiragi");
    else onReward(p.msg);
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
        <>
          <button className="btn-primary" onClick={freeSpinFn} disabled={spinning}>
            {spinning ? "Aylanmoqda…" : "🎁 Bepul kunlik spin"}
          </button>
          <div className="muted game-hint">Kuniga 1 bepul spin. Safar paytida g'ildirak ko'proq yutadi + JACKPOT!</div>
        </>
      )}
      <div className="muted game-hint">Har safar JACKPOT'ni oshiradi — JACKPOT tushsa butun jamg'arma sizniki!</div>
    </section>
  );
}

function BoxGame({ onReward, celebrate }: { onReward: (msg: string) => void; celebrate: Celebrate }) {
  const [box, setBox] = useState<BoxStatusResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [opening, setOpening] = useState(false);

  const [boxErr, setBoxErr] = useState(false);
  const load = () => api.box().then((r) => { setBox(r); setBoxErr(false); }).catch(() => setBoxErr(true));
  useEffect(() => {
    load();
  }, []);

  const open = async () => {
    if (busy) return;
    setBusy(true);
    setOpening(true);
    haptic();
    try {
      const r = await api.openBox();
      // anticipation: let the box rattle/charge ~750ms before the reveal bursts
      await new Promise((res) => setTimeout(res, 750));
      if (r.ok && r.prize) {
        celebrate(r.prize.amount, r.prize.emoji, "Sirli quti");
      } else if (r.reason === "locked") {
        onReward("🎯 Avval kunlik vazifalarni tugating!");
      }
      await load();
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
      setOpening(false);
    }
  };

  if (boxErr) {
    return (
      <section className="glass pad game-card">
        <div className="section-title">🎁 Sirli quti</div>
        <LoadSection state="error" onRetry={load}><span /></LoadSection>
      </section>
    );
  }
  if (!box) return null;
  const pct = Math.round((box.dailiesDone / Math.max(1, box.dailiesTotal)) * 100);
  const ready = box.eligible && !box.opened;

  return (
    <section className="glass pad game-card">
      <div className="section-title">🎁 Sirli quti</div>
      <div className={"box-hero" + (ready ? " ready" : "") + (opening ? " opening" : "")}>
        <div className="box-rays" />
        <div className="box-lid">{box.opened ? "🎊" : "🎁"}</div>
      </div>
      {box.opened && box.prize ? (
        <div className="box-result">Bugun ochildi: {box.prize.emoji} <b>{box.prize.label}</b> — ertaga yana! 🎁</div>
      ) : box.eligible ? (
        <button className="btn-primary" disabled={busy} onClick={open}>
          {opening ? "🔓 Ochilmoqda…" : "🎁 QUTINI OCHISH"}
        </button>
      ) : (
        <>
          <ProgressBar className="mt6" value={pct} />
          <div className="muted box-tile-sub tac">Kunlik vazifalar {box.dailiesDone}/{box.dailiesTotal} — tugating, quti ochiladi 🔓</div>
        </>
      )}
    </section>
  );
}

// T6: BONUS LIVING CENTER — the top of the Bonus tab aggregates streak + daily kombo
// (check-in · ride · spin) + missions-ready into one "what do I do today" glance.
// Split into a pure view (demo-able, no API) + a data-loading wrapper.
export function BonusCenterView({
  me, missions, err, checking, onCheckin, onRetry,
}: {
  me: MeResponse;
  missions: MissionsResponse | null;
  err: boolean;
  checking: boolean;
  onCheckin: () => void;
  onRetry: () => void;
}) {
  const daily = missions?.daily ?? [];
  const did = (code: string) => daily.some((m) => m.code === code && (m.progress > 0 || m.claimed || m.claimable));
  const kombo = [
    { label: "Kirish", ok: me.streak.checkedToday },
    { label: "Safar", ok: did("daily_ride") },
    { label: "Spin", ok: did("daily_spin") },
  ];
  const komboN = kombo.filter((k) => k.ok).length;
  const claimable = [...(missions?.daily ?? []), ...(missions?.weekly ?? [])].filter((m) => m.claimable).length;

  return (
    <section className="glass pad bonus-center">
      <div className="bc-streak">
        <span className="bc-fire">🔥</span>
        <div className="bc-streak-meta">
          <div className="bc-streak-n">{me.streak.current} kun streak</div>
          <div className="muted fs12">{me.streak.checkedToday ? "bugun belgilangan ✓" : "bugun kirib streakni saqlang"}</div>
        </div>
        {!me.streak.checkedToday && (
          <button className="btn-primary sm" disabled={checking} onClick={onCheckin}>{checking ? "…" : "✅ Belgilash"}</button>
        )}
      </div>
      <div className={"bc-kombo" + (komboN === 3 ? " complete" : "")}>
        {kombo.map((k) => (
          <div key={k.label} className={"bc-cell" + (k.ok ? " on" : "")}>
            <span className="bc-cell-ico">{k.ok ? "✅" : "⬜"}</span>
            <span className="bc-cell-label">{k.label}</span>
          </div>
        ))}
      </div>
      <div className={"bc-hint" + (komboN === 3 ? " complete" : "")}>{komboN === 3 ? "🎉 KOMBO TO'LIQ — ertaga ruleta ×2!" : `Kunlik kombo ${komboN}/3 · 3/3 = ertaga ruleta ×2`}</div>
      {claimable > 0 && <div className="bc-missions">🎁 {claimable} ta vazifa tayyor — «Vazifa» tabidan oling!</div>}
      {err && !missions && <div className="muted fs12 mt6">⚠️ Holat yuklanmadi · <button className="d-link" onClick={onRetry}>qayta urinish</button></div>}
    </section>
  );
}

export function BonusCenter({ me, onReward, celebrate }: { me: MeResponse; onReward: (msg: string) => void; celebrate: Celebrate }) {
  const [missions, setMissions] = useState<MissionsResponse | null>(null);
  const [err, setErr] = useState(false);
  const [checking, setChecking] = useState(false);
  const load = () => {
    setErr(false);
    api.missions().then(setMissions).catch(() => setErr(true));
  };
  useEffect(() => {
    load();
  }, []);

  const checkin = async () => {
    if (checking || me.streak.checkedToday) return;
    setChecking(true);
    haptic();
    try {
      const r = await api.checkin();
      if (r.rewardAmount > 0) celebrate(r.rewardAmount, "🔥", `${r.current} kun streak!`);
      else onReward(`🔥 ${r.current} kun streak!`);
      load();
    } finally {
      setChecking(false);
    }
  };

  return <BonusCenterView me={me} missions={missions} err={err} checking={checking} onCheckin={checkin} onRetry={load} />;
}

/**
 * Bonus tab — T6 living center (streak + kombo + missions) on top, then the
 * ride-tied variable-reward layer: Plus, in-ride wheel, mystery box.
 */
export function RewardsView({ me, onReward }: { me: MeResponse; onReward: (msg: string) => void }) {
  const [win, setWin] = useState<{ amount: number; emoji: string; label?: string; key: number } | null>(null);
  const keyRef = useRef(0);
  const celebrate: Celebrate = (amount, emoji, label) => {
    if (amount <= 0) {
      onReward(`${emoji} ${label ?? ""}`.trim());
      return;
    }
    keyRef.current += 1;
    setWin({ amount, emoji, label, key: keyRef.current });
  };
  return (
    <div className="view">
      <div className="section-title">🎁 Bonuslar</div>
      <BonusCenter me={me} onReward={onReward} celebrate={celebrate} />
      <PlusSection onReward={onReward} />
      <SpinWheelGame me={me} onReward={onReward} celebrate={celebrate} />
      <BoxGame onReward={onReward} celebrate={celebrate} />
      <div className="muted game-hint tac mt8">
        Har safar tanga va bonus olib keladi 🚕 — ko'proq safar, ko'proq omad!
      </div>
      {win ? <WinBurst key={win.key} amount={win.amount} emoji={win.emoji} label={win.label} onDone={() => setWin(null)} /> : null}
    </div>
  );
}
