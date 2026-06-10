import { useEffect, useState } from "react";
import { formatNumber, rankMedal, type MeResponse, type WalletResponse } from "@t1067/shared";
import { api } from "./api";
import { haptic } from "./telegram";
import { confetti, useCountUp } from "./util";
import { Spinner, StreakCard } from "./components";

const KIND_EMOJI: Record<string, string> = {
  streak: "🔥",
  wheel: "🎡",
  mission: "🎯",
  box: "🎁",
  weekly: "🏆",
  surprise: "🎉",
  referral: "👥",
  respin: "🎡",
  premium_box: "💎",
  withdraw: "💸",
  withdraw_refund: "↩️",
};

function WithdrawSheet({
  wallet,
  onClose,
  onDone,
}: {
  wallet: WalletResponse;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const capLeft = Math.max(0, wallet.withdrawDailyCap - wallet.withdrawnToday);
  const max = Math.floor(Math.min(wallet.coins, capLeft));
  const presets = [5000, 10000, 25000].filter((p) => p >= wallet.withdrawMin && p <= max);
  if (max >= wallet.withdrawMin && !presets.includes(max)) presets.push(max);
  const [amount, setAmount] = useState<number | null>(presets[0] ?? null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (!amount || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await api.withdraw(amount);
      if (r.ok) {
        confetti();
        onDone(`💸 ${formatNumber(r.amount)} so'm cashback hisobingizga o'tdi!`);
        onClose();
      } else {
        const msgs: Record<string, string> = {
          below_min: `Minimal: ${formatNumber(wallet.withdrawMin)} coin`,
          daily_cap: `Bugungi limit tugadi (${formatNumber(wallet.withdrawDailyCap)}/kun)`,
          insufficient: "Coin yetarli emas",
          not_client: "Faqat mijoz hisoblari uchun",
          kas_failed: "Tizim xatosi — coin qaytarildi, keyinroq urinib ko'ring",
        };
        setErr(msgs[r.reason ?? ""] ?? "Xatolik yuz berdi");
      }
    } catch {
      setErr("Tarmoq xatosi — qayta urinib ko'ring");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sheet-back" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" />
        <h3>💸 So'mga aylantirish</h3>
        <p className="muted sheet-sub">
          1 coin = 1 so'm. Pul <b>taxi cashback</b> hisobingizga tushadi va safarlarda ishlatiladi.
        </p>
        {max < wallet.withdrawMin ? (
          <div className="sheet-warn">
            Minimal {formatNumber(wallet.withdrawMin)} coin kerak.
            <br />
            <span className="muted">Sizda: {formatNumber(wallet.coins)} — o'ynab to'plang! 🎮</span>
          </div>
        ) : (
          <>
            <div className="chip-row">
              {presets.map((p) => (
                <button key={p} className={"amt-chip" + (amount === p ? " active" : "")} onClick={() => { haptic(); setAmount(p); }}>
                  {p === max && presets.length > 1 ? `MAX ${formatNumber(p)}` : formatNumber(p)}
                </button>
              ))}
            </div>
            {err && <div className="sheet-err">{err}</div>}
            <button className="btn-primary" disabled={!amount || busy} onClick={submit}>
              {busy ? "O'tkazilmoqda…" : `💸 ${amount ? formatNumber(amount) : ""} so'mga aylantirish`}
            </button>
          </>
        )}
        <button className="btn-ghost" onClick={onClose}>Yopish</button>
      </div>
    </div>
  );
}

export function WalletView({ me, onBanner, reload }: { me: MeResponse; onBanner: (m: string) => void; reload: () => void }) {
  const [wallet, setWallet] = useState<WalletResponse | null>(null);
  const [sheet, setSheet] = useState(false);
  const coins = useCountUp(wallet?.coins ?? me.coins);
  const cashback = useCountUp(wallet?.cashback ?? me.stats.points);

  const loadWallet = () => api.wallet().then(setWallet).catch(() => undefined);
  useEffect(() => {
    loadWallet();
  }, []);

  const onDone = (msg: string) => {
    onBanner(msg);
    loadWallet();
    reload();
  };

  const earned = me.badges.filter((b) => b.earned);

  return (
    <div className="view">
      <section className="wallet-hero glass">
        <div className="wh-row">
          <div className="wh-main">
            <div className="wh-label">🪙 O'yin hamyoni</div>
            <div className="wh-coins">{formatNumber(coins)}</div>
            <div className="wh-sub muted">coin · 1 coin = 1 so'm</div>
          </div>
          <div className="wh-ring" style={{ ["--accent" as string]: me.level.color }}>
            <span className="wh-emoji">{me.level.emoji}</span>
            <span className="wh-lv">{me.level.name}</span>
          </div>
        </div>
        <div className="wh-cashback">
          <span>🚕 Taxi cashback (safarlardan)</span>
          <b>{formatNumber(cashback)} so'm</b>
        </div>
        <button className="btn-primary wh-cta" onClick={() => { haptic(); setSheet(true); }}>
          💸 So'mga aylantirish
        </button>
        <div className="wh-meta muted">
          {me.rank && <span>O'rin {rankMedal(me.rank)}</span>}
          <span>🚕 {formatNumber(me.stats.trips)} safar</span>
          <span>🎖 {earned.length}/{me.badges.length}</span>
        </div>
      </section>

      <StreakCard me={me} onReward={onDone} />

      {earned.length > 0 && (
        <section className="glass pad">
          <div className="section-title">🎖 Nishonlar</div>
          <div className="badge-strip">{earned.map((b) => <span key={b.code} title={b.name}>{b.emoji}</span>)}</div>
        </section>
      )}

      <section className="glass pad">
        <div className="section-title">📜 So'nggi harakatlar</div>
        {!wallet ? (
          <Spinner />
        ) : wallet.txns.length === 0 ? (
          <div className="muted txn-empty">Hali harakat yo'q — 🎮 O'yinlardan boshlang!</div>
        ) : (
          <div className="txn-list">
            {wallet.txns.map((t, i) => (
              <div key={i} className="txn">
                <span className="txn-emoji">{KIND_EMOJI[t.kind] ?? "🪙"}</span>
                <span className="txn-reason">{t.reason}</span>
                <span className={"txn-amt" + (t.amount < 0 ? " neg" : "")}>
                  {t.amount > 0 ? "+" : ""}
                  {formatNumber(t.amount)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {sheet && wallet && <WithdrawSheet wallet={wallet} onClose={() => setSheet(false)} onDone={onDone} />}
    </div>
  );
}
