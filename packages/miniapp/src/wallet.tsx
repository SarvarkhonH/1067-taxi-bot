import { useEffect, useRef, useState } from "react";
import {
  TRANSFER_MAX_PER_TX,
  TRANSFER_MIN,
  estimateFare,
  formatNumber,
  rankMedal,
  type FareConfigResponse,
  type MeResponse,
  type WalletResponse,
} from "@t1067/shared";
import { api } from "./api";
import { haptic } from "./telegram";
import { confetti, useCountUp } from "./util";
import { Spinner, StreakCard } from "./components";

// kas1067-powered: shows how much cashback a ride earns + a live fare estimate.
function CashbackFareCard() {
  const [cfg, setCfg] = useState<FareConfigResponse | null>(null);
  const [km, setKm] = useState(5);
  useEffect(() => {
    api.fareConfig().then(setCfg).catch(() => undefined);
  }, []);
  if (!cfg) return null;
  const est = estimateFare(cfg, km, false);
  return (
    <section className="glass pad cashback-card">
      <div className="section-title">🚕 Safar = cashback</div>
      <div className="cashback-rules">
        <div className="cb-rule">
          <b>+{formatNumber(cfg.cashback.perAppRide)}</b>
          <span className="muted">har safar</span>
        </div>
        <div className="cb-rule">
          <b>+{formatNumber(cfg.cashback.firstAppBonus)}</b>
          <span className="muted">ilk safar</span>
        </div>
      </div>
      <div className="fare-est">
        <div className="fare-row">
          <span>📏 {km} km masofa</span>
          <span className="fare-price">≈ {formatNumber(est.price)} so'm</span>
        </div>
        <input className="fare-slider" type="range" min={1} max={30} value={km} onChange={(e) => setKm(Number(e.target.value))} />
        <div className="muted fare-hint">Bu safardan: 🪙 +{formatNumber(est.cashback)} cashback</div>
      </div>
    </section>
  );
}

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
  transfer_in: "📥",
  transfer_out: "📤",
  tip_in: "🙏",
  tip_out: "🙏",
};

// P2P: send coins to any 1067 member by phone (closed-loop, small burn).
function TransferSheet({ wallet, onClose, onDone }: { wallet: WalletResponse; onClose: () => void; onDone: (msg: string) => void }) {
  const [phone, setPhone] = useState("");
  const [who, setWho] = useState<{ found: boolean; name?: string } | null>(null);
  const [amount, setAmount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const lookupTimer = useRef<number | null>(null);

  const max = Math.floor(Math.min(wallet.coins, TRANSFER_MAX_PER_TX));
  const presets = [1000, 5000, 10000].filter((p) => p >= TRANSFER_MIN && p <= max);
  if (max >= TRANSFER_MIN && !presets.includes(max)) presets.push(max);

  const onPhone = (v: string) => {
    setPhone(v);
    setWho(null);
    if (lookupTimer.current) window.clearTimeout(lookupTimer.current);
    const digits = v.replace(/\D/g, "");
    if (digits.length < 9) return;
    lookupTimer.current = window.setTimeout(() => {
      api.recipient(v).then(setWho).catch(() => undefined);
    }, 450);
  };

  const submit = async () => {
    if (!amount || busy || !who?.found) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await api.transfer(phone, amount);
      if (r.ok) {
        confetti();
        onDone(`📤 ${formatNumber(r.amount)} tanga ${r.toName ?? "qabul qiluvchi"}ga yuborildi!`);
        onClose();
      } else {
        const msgs: Record<string, string> = {
          below_min: `Minimal: ${formatNumber(TRANSFER_MIN)} tanga`,
          over_max: `Maksimal: ${formatNumber(TRANSFER_MAX_PER_TX)} tanga`,
          insufficient: "Tanga yetarli emas",
          daily_sent_cap: "Bugungi yuborish limiti tugadi",
          daily_received_cap: "Qabul qiluvchining bugungi limiti to'ldi",
          too_many_recipients: "Bugun juda ko'p odamga yubordingiz",
          account_too_new: "Hisobingiz hali juda yangi (48 soat)",
          self: "O'zingizga yuborib bo'lmaydi",
          ring: "Bu o'tkazma hozircha bloklangan",
          not_found: "Bu raqam 1067da topilmadi",
        };
        setErr(msgs[r.reason ?? ""] ?? "Yuborilmadi");
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
        <h3>📤 Tanga o'tkazish</h3>
        <p className="muted sheet-sub">
          Istalgan 1067 a'zosiga (mijoz yoki haydovchi) tanga yuboring. Kichik xizmat haqi 2%.
        </p>
        <input
          className="bk-input"
          placeholder="📱 Qabul qiluvchi raqami: 90 123 45 67"
          value={phone}
          inputMode="tel"
          onChange={(e) => onPhone(e.target.value)}
        />
        {who && (
          <div className={who.found ? "sheet-ok" : "sheet-warn"}>
            {who.found ? `→ ${who.name}` : "Bu raqam topilmadi"}
          </div>
        )}
        {who?.found && (
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
              {busy ? "Yuborilmoqda…" : `📤 ${amount ? formatNumber(amount) : ""} tanga yuborish`}
            </button>
          </>
        )}
        <button className="btn-ghost" onClick={onClose}>Yopish</button>
      </div>
    </div>
  );
}

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
          insufficient: "Tanga yetarli emas",
          not_client: "Faqat mijoz hisoblari uchun",
          no_ride: "So'mga aylantirish uchun avval kamida 1 ta safar qiling 🚕",
          risk_hold: "Hisobingiz tekshiruvda — dispetcherga murojaat qiling",
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
          1 tanga = 1 so'm. Pul <b>taxi cashback</b> hisobingizga tushadi va safarlarda ishlatiladi.
        </p>
        {max < wallet.withdrawMin ? (
          <div className="sheet-warn">
            Minimal {formatNumber(wallet.withdrawMin)} tanga kerak.
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

// Reverse direction: kas cashback bonus → game coins (two-way wallet).
function TopupSheet({ wallet, onClose, onDone }: { wallet: WalletResponse; onClose: () => void; onDone: (msg: string) => void }) {
  const max = Math.floor(wallet.cashback);
  const presets = [1000, 5000, 10000].filter((p) => p >= wallet.topupMin && p <= max);
  if (max >= wallet.topupMin && !presets.includes(max)) presets.push(max);
  const [amount, setAmount] = useState<number | null>(presets[0] ?? null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (!amount || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await api.topup(amount);
      if (r.ok) {
        confetti();
        onDone(`🔁 ${formatNumber(r.amount)} tanga xazinangizga o'tdi!`);
        onClose();
      } else {
        const msgs: Record<string, string> = {
          below_min: `Minimal: ${formatNumber(wallet.topupMin)} so'm`,
          insufficient: "Cashback yetarli emas",
          not_client: "Faqat mijoz hisoblari uchun",
          kas_failed: "Tizim xatosi — keyinroq urinib ko'ring",
        };
        setErr(msgs[r.reason ?? ""] ?? "Xatolik");
      }
    } catch {
      setErr("Tarmoq xatosi");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sheet-back" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" />
        <h3>🔁 Cashback → coin</h3>
        <p className="muted sheet-sub">Taxi <b>cashback</b>ingizni o'yin <b>coin</b>iga o'tkazing va o'ynang. 1 so'm = 1 coin.</p>
        {max < wallet.topupMin ? (
          <div className="sheet-warn">Minimal {formatNumber(wallet.topupMin)} so'm cashback kerak.<br /><span className="muted">Sizda: {formatNumber(wallet.cashback)}</span></div>
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
            <button className="btn-violet" disabled={!amount || busy} onClick={submit}>{busy ? "…" : `🔁 ${amount ? formatNumber(amount) : ""} coinga o'tkazish`}</button>
          </>
        )}
        <button className="btn-ghost" onClick={onClose}>Yopish</button>
      </div>
    </div>
  );
}

export function WalletView({ me, onBanner, reload, onBook }: { me: MeResponse; onBanner: (m: string) => void; reload: () => void; onBook: () => void }) {
  const [wallet, setWallet] = useState<WalletResponse | null>(null);
  const [sheet, setSheet] = useState(false);
  const [topup, setTopup] = useState(false);
  const [send, setSend] = useState(false);
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
      {me.luckyDay && (
        <div className="sheet-ok" style={{ textAlign: "center" }}>🍀 BUGUN OMAD KUNI — har safar cashback 2x!</div>
      )}
      <div className="jackpot-badge" style={{ alignSelf: "center", marginBottom: 4 }}>🎰 JACKPOT: <b>{formatNumber(me.jackpot)}</b> tanga — har safar oshadi!</div>
      <button className="book-cta" onClick={onBook}>
        🚖 Taxi chaqirish
        <span className="book-cta-sub">jonli xarita · cashback</span>
      </button>

      <section className="wallet-hero glass">
        <div className="wh-row">
          <div className="wh-main">
            <div className="wh-label">🪙 O'yin hamyoni</div>
            <div className="wh-coins">{formatNumber(coins)}</div>
            <div className="wh-sub muted">tanga · 1 tanga = 1 so'm</div>
          </div>
          <div className="wh-ring" style={{ ["--accent" as string]: me.level.color }}>
            <span className="wh-emoji">{me.level.emoji}</span>
            <span className="wh-lv">{me.level.name}</span>
            <span className="wh-tier muted">Liga: {me.leagueTier}</span>
          </div>
        </div>
        <div className="wh-cashback">
          <span>🚕 Taxi cashback (safarlardan)</span>
          <b>{formatNumber(cashback)} so'm</b>
        </div>
        <div className="wh-actions">
          <button className="btn-primary wh-cta" onClick={() => { haptic(); setSheet(true); }}>💸 So'mga</button>
          <button className="btn-violet wh-cta" onClick={() => { haptic(); setSend(true); }}>📤 O'tkazish</button>
          {wallet?.canTopup && (
            <button className="btn-violet wh-cta" onClick={() => { haptic(); setTopup(true); }}>🔁 Coinga</button>
          )}
        </div>
        <div className="wh-meta muted">
          {me.rank && <span>O'rin {rankMedal(me.rank)}</span>}
          <span>🚕 {formatNumber(me.stats.trips)} safar</span>
          <span>🎖 {earned.length}/{me.badges.length}</span>
        </div>
      </section>

      <StreakCard me={me} onReward={onDone} />

      <CashbackFareCard />

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
      {topup && wallet && <TopupSheet wallet={wallet} onClose={() => setTopup(false)} onDone={onDone} />}
      {send && wallet && <TransferSheet wallet={wallet} onClose={() => setSend(false)} onDone={onDone} />}
    </div>
  );
}
