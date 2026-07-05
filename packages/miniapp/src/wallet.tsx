import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  FARE_MAX_PER_TX,
  LEVELS,
  TRANSFER_MAX_PER_TX,
  TRANSFER_MIN,
  estimateFare,
  formatNumber,
  rankMedal,
  type DriverPayLookup,
  type FareConfigResponse,
  type MeResponse,
  type RecipientLookup,
  type TierBenefitsResponse,
  type WalletResponse,
} from "@t1067/shared";
import { api } from "./api";
import { haptic, shareLink, inviteText } from "./telegram";
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

// shared error copy for transfer/pay flows
function txErr(reason: string | undefined, maxLabel: number): string {
  const msgs: Record<string, string> = {
    below_min: `Minimal: ${formatNumber(TRANSFER_MIN)} tanga`,
    over_max: `Maksimal: ${formatNumber(maxLabel)} tanga`,
    insufficient: "Tanga yetarli emas",
    daily_sent_cap: "Bugungi yuborish limiti tugadi",
    daily_received_cap: "Qabul qiluvchining bugungi limiti to'ldi",
    too_many_recipients: "Bugun juda ko'p odamga yubordingiz",
    account_too_new: "Hisobingiz hali juda yangi (48 soat)",
    self: "O'zingizga yuborib bo'lmaydi",
    ring: "Bu o'tkazma hozircha bloklangan",
    not_found: "Topilmadi",
    disabled: "O'tkazma hozircha o'chiq",
  };
  return msgs[reason ?? ""] ?? "Yuborilmadi";
}

// Dedicated amount-entry step (the "yangi oyna"): big input, presets, live commission preview.
// Shared by friend-transfer and driver-fare. The fee line only shows when commission is live.
function PayAmountStep({
  coins, maxTx, commissionPct, confirm, cta, busy, err, onBack, onSubmit,
}: {
  coins: number; maxTx: number; commissionPct: number; confirm: ReactNode; cta: string;
  busy: boolean; err: string | null; onBack: () => void; onSubmit: (amount: number) => void;
}) {
  const [val, setVal] = useState("");
  const amount = Math.floor(Number(val.replace(/\D/g, "")) || 0);
  const fee = Math.floor((amount * commissionPct) / 100);
  const charged = amount + fee;
  const maxAmt = Math.min(maxTx, Math.floor(coins / (1 + commissionPct / 100)));
  const presets = [5000, 10000, 20000, 50000].filter((p) => p <= maxTx && p + Math.floor((p * commissionPct) / 100) <= coins);
  const valid = amount >= TRANSFER_MIN && amount <= maxTx && charged <= coins;
  return (
    <>
      <button className="pay-back" onClick={onBack}>‹ Orqaga</button>
      <div className="pay-confirm">{confirm}</div>
      <div className="pay-amt-wrap">
        <input className="pay-amt" inputMode="numeric" placeholder="0" value={val ? formatNumber(amount) : ""} onChange={(e) => setVal(e.target.value)} autoFocus />
        <span className="pay-amt-cur">tanga</span>
      </div>
      <div className="chip-row">
        {presets.map((p) => (
          <button key={p} className={"amt-chip" + (amount === p ? " active" : "")} onClick={() => { haptic(); setVal(String(p)); }}>{formatNumber(p)}</button>
        ))}
        {maxAmt >= TRANSFER_MIN && (
          <button className={"amt-chip" + (amount === maxAmt ? " active" : "")} onClick={() => { haptic(); setVal(String(maxAmt)); }}>MAX</button>
        )}
      </div>
      {commissionPct > 0 && amount > 0 ? (
        <div className="pay-fee">+{commissionPct}% komissiya ({formatNumber(fee)}) · jami <b>{formatNumber(charged)}</b> tanga yechiladi</div>
      ) : null}
      {err && <div className="sheet-err">{err}</div>}
      <button className="btn-primary" disabled={!valid || busy} onClick={() => onSubmit(amount)}>
        {busy ? "Yuborilmoqda…" : cta.replace("{a}", amount ? formatNumber(amount) : "—")}
      </button>
    </>
  );
}

// 👥 Send tanga to any 1067 member by phone — 2-step: pick recipient (rich confirm: name, type,
// Telegram @nick, phone) → dedicated amount screen.
function TransferSheet({ wallet, onClose, onDone }: { wallet: WalletResponse; onClose: () => void; onDone: (msg: string) => void }) {
  const [step, setStep] = useState<"who" | "amount">("who");
  const [phone, setPhone] = useState("");
  const [who, setWho] = useState<RecipientLookup | null>(null);
  const [looking, setLooking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const lookupTimer = useRef<number | null>(null);

  const onPhone = (v: string) => {
    setPhone(v);
    setWho(null);
    const digits = v.replace(/\D/g, "");
    setLooking(digits.length >= 9);
    if (lookupTimer.current) window.clearTimeout(lookupTimer.current);
    if (digits.length < 9) { setLooking(false); return; }
    lookupTimer.current = window.setTimeout(() => {
      api.recipient(v).then((r) => { setWho(r); setLooking(false); }).catch(() => setLooking(false));
    }, 450);
  };

  const submit = async (amount: number) => {
    setBusy(true);
    setErr(null);
    try {
      const r = await api.transfer(phone, amount);
      if (r.ok) {
        confetti();
        onDone(`📤 ${formatNumber(r.amount)} tanga ${r.toName ?? "qabul qiluvchi"}ga yuborildi!`);
        onClose();
      } else {
        setErr(txErr(r.reason, TRANSFER_MAX_PER_TX));
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
        {step === "who" ? (
          <>
            <h3>👥 Do'stga tanga yuborish</h3>
            <p className="muted sheet-sub">Raqamni yozing — kim ekani chiqadi, keyin summani kiritasiz.</p>
            <input className="bk-input" placeholder="📱 Qabul qiluvchi raqami: 90 123 45 67" value={phone} inputMode="tel" onChange={(e) => onPhone(e.target.value)} />
            {looking && !who && <div className="dim fs13 mt6">⏳ Tekshirilmoqda…</div>}
            {who && !who.found && <div className="sheet-warn">Bu raqam 1067da topilmadi</div>}
            {who?.found && (
              <button className="pay-card" onClick={() => { haptic(); setStep("amount"); }}>
                <div className="pay-card-av">{who.type === "driver" ? "🚖" : "👤"}</div>
                <div className="pay-card-main">
                  <div className="pay-card-name">{who.name}</div>
                  <div className="pay-card-sub">
                    {who.type === "driver" ? "Haydovchi" : "Mijoz"}
                    {who.username ? ` · @${who.username}` : ""}
                    {who.phone ? ` · ${who.phone}` : ""}
                  </div>
                </div>
                <div className="pay-card-go">Davom →</div>
              </button>
            )}
            <button className="btn-ghost" onClick={onClose}>Yopish</button>
          </>
        ) : (
          <PayAmountStep
            coins={wallet.coins}
            maxTx={TRANSFER_MAX_PER_TX}
            commissionPct={wallet.commissionPct}
            confirm={<>👥 <b>{who?.name}</b>ga yuborasiz{who?.username ? ` · @${who.username}` : ""}</>}
            cta="📤 {a} tanga yuborish"
            busy={busy}
            err={err}
            onBack={() => { setErr(null); setStep("who"); }}
            onSubmit={submit}
          />
        )}
      </div>
    </div>
  );
}

// 🚖 Pay the driver's FARE by car number — 2-step: type the plate → rich kas confirm (name,
// model, plate, phone, rating) with typo suggestions → dedicated amount screen. NOT a tip.
function PayDriverSheet({ wallet, onClose, onDone }: { wallet: WalletResponse; onClose: () => void; onDone: (msg: string) => void }) {
  const [step, setStep] = useState<"who" | "amount">("who");
  const [car, setCar] = useState("");
  const [who, setWho] = useState<DriverPayLookup | null>(null);
  const [looking, setLooking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const lookupTimer = useRef<number | null>(null);

  const runLookup = (clean: string) => {
    api.driverByCar(clean).then((r) => { setWho(r); setLooking(false); }).catch(() => setLooking(false));
  };
  const onCar = (v: string) => {
    const up = v.toUpperCase();
    setCar(up);
    setWho(null);
    const clean = up.replace(/\s+/g, "");
    setLooking(clean.length >= 4);
    if (lookupTimer.current) window.clearTimeout(lookupTimer.current);
    if (clean.length < 4) { setLooking(false); return; }
    lookupTimer.current = window.setTimeout(() => runLookup(clean), 450);
  };
  const pickSuggestion = (plate: string) => {
    setCar(plate);
    setWho(null);
    setLooking(true);
    runLookup(plate.replace(/\s+/g, ""));
  };

  const submit = async (amount: number) => {
    setBusy(true);
    setErr(null);
    try {
      const r = await api.payDriver(car.replace(/\s+/g, ""), amount);
      if (r.ok) {
        confetti();
        onDone(`🚕 Yo'l haqi ${formatNumber(r.amount)} tanga ${r.toName ?? "haydovchi"}ga to'landi!`);
        onClose();
      } else {
        setErr(txErr(r.reason, FARE_MAX_PER_TX));
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
        {step === "who" ? (
          <>
            <h3>🚖 Haydovchiga yo'l haqini to'lash</h3>
            <p className="muted sheet-sub">Mashina raqamini yozing — haydovchi ma'lumoti chiqadi, keyin yo'l haqi summasini kiritasiz.</p>
            <input className="bk-input" placeholder="🚗 Mashina raqami: 01A123BC" value={car} autoCapitalize="characters" onChange={(e) => onCar(e.target.value)} />
            {looking && <div className="dim fs13 mt6">⏳ Tekshirilmoqda…</div>}
            {who?.found && (
              <button className="pay-card" onClick={() => { haptic(); setStep("amount"); }}>
                <div className="pay-card-av">🚖</div>
                <div className="pay-card-main">
                  <div className="pay-card-name">{who.name}{who.rating ? ` ⭐${who.rating.toFixed(1)}` : ""}</div>
                  <div className="pay-card-sub">
                    {who.carModel ? `${who.carModel} · ` : ""}<b>{who.carNumber}</b>{who.phone ? ` · ${who.phone}` : ""}
                  </div>
                </div>
                <div className="pay-card-go">Davom →</div>
              </button>
            )}
            {who && !who.found && (
              <>
                <div className="sheet-warn">Bu raqamli haydovchi topilmadi</div>
                {who.suggestions && who.suggestions.length > 0 && (
                  <div className="pay-sugg-wrap">
                    <div className="dim fs13">Balki shulardan biri?</div>
                    {who.suggestions.map((s) => (
                      <button key={s.car} className="pay-sugg" onClick={() => { haptic(); pickSuggestion(s.car); }}>
                        🚗 <b>{s.car}</b> · {s.name}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
            <button className="btn-ghost" onClick={onClose}>Yopish</button>
          </>
        ) : (
          <PayAmountStep
            coins={wallet.coins}
            maxTx={FARE_MAX_PER_TX}
            commissionPct={wallet.commissionPct}
            confirm={<>🚖 <b>{who?.name}</b> · {who?.carNumber} — yo'l haqi</>}
            cta="🚕 {a} tanga to'lash"
            busy={busy}
            err={err}
            onBack={() => { setErr(null); setStep("who"); }}
            onSubmit={submit}
          />
        )}
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
          below_min: `Minimal: ${formatNumber(wallet.withdrawMin)} tanga`,
          daily_cap: `Sizning kunlik limitingiz tugadi (${formatNumber(wallet.withdrawDailyCap)}/kun) — ertaga yana ochiladi`,
          // fund_low ≠ daily_cap: the COMPANY's revenue-linked fund for today is short, the member's
          // own limit is untouched (drivers with ~5k withdrawn used to see "100 000 limit tugadi")
          fund_low:
            (r.fundLeft ?? 0) > 0
              ? `Bugungi umumiy fond kam qoldi — hozircha ${formatNumber(r.fundLeft ?? 0)} tangagacha yechish mumkin, qolganini ertaga`
              : "Bugungi umumiy fond tugadi — ertaga safarlar bilan yana to'ladi 🚕",
          insufficient: "Tanga yetarli emas",
          not_client: "Faqat mijoz hisoblari uchun",
          no_ride: "So'mga aylantirish uchun avval kamida 1 ta safar qiling 🚕",
          risk_hold: "Hisobingiz tekshiruvda — dispetcherga murojaat qiling",
          kas_failed: "Tizim xatosi — tanga qaytarildi, keyinroq urinib ko'ring",
          pending_review: "Oldingi yechish holati aniqlanmoqda — admin tekshirmoqda, birozdan keyin urinib ko'ring",
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
        <h3>{wallet.isClient ? "💸 So'mga aylantirish" : "💳 kas1067 balansiga"}</h3>
        <p className="muted sheet-sub">
          1 tanga = 1 so'm.{" "}
          {wallet.isClient ? (
            <>Pul <b>taxi cashback</b> hisobingizga tushadi va safarlarda ishlatiladi.</>
          ) : (
            <>Tangangiz <b>kas1067 balansingizga</b> so'm bo'lib o'tadi.</>
          )}
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

// 💵 Real cash-out (tanga → plastik karta / naxt uyga). Unlike WithdrawSheet (tanga → kas balance),
// this lodges a request to the OWNER who pays real money manually; tangas are spent only on approval.
// Card number is sent over HTTPS and NEVER stored (only a •••• 1234 mask) — full number rides only
// the owner's Telegram message. Thresholds KEEP IN SYNC with server cashoutService (50k / 100k).
const CASHOUT_CARD_MIN = 50_000;
const CASHOUT_HOME_MIN = 100_000;
function CashoutSheet({ wallet, onClose, onDone }: { wallet: WalletResponse; onClose: () => void; onDone: (msg: string) => void }) {
  const bal = Math.floor(wallet.coins);
  const [method, setMethod] = useState<"card" | "home">("card");
  const [card, setCard] = useState("");
  const [holder, setHolder] = useState("");
  const [addr, setAddr] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const min = method === "home" ? CASHOUT_HOME_MIN : CASHOUT_CARD_MIN;
  const eligible = bal >= min;
  const cardDigits = card.replace(/\D/g, "");
  const canSubmit = eligible && !busy && (method === "card" ? cardDigits.length >= 16 && holder.trim().length >= 3 : addr.trim().length >= 5);

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await api.cashout(method === "card" ? { method, cardNumber: cardDigits, cardHolder: holder.trim() } : { method, address: addr.trim() });
      if (r.ok) {
        confetti();
        onDone(`✅ So'rov yuborildi! ${formatNumber(r.amount ?? bal)} tanga — tez orada bog'lanib pulingizni o'tkazamiz 💸`);
        onClose();
      } else {
        const msgs: Record<string, string> = {
          off: "Naxt pul hozircha mavjud emas",
          not_linked: "Avval telefon raqamingizni ulang",
          below_min: `Minimal: ${formatNumber(r.min ?? min)} tanga`,
          pending_exists: "Sizda javob kutayotgan so'rov bor — avval u hal bo'lsin",
          bad_card: "Karta raqami 16 xonali bo'lishi kerak",
          no_holder: "Karta egasining ism-familiyasini yozing",
          bad_address: "Manzilni to'liqroq yozing",
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
        <h3>💵 Naxt pulga olish</h3>
        <p className="muted sheet-sub">
          Tangangizni <b>real pulga</b> aylantiramiz. So'rov adminga boradi — tekshirib pulingizni o'tkazamiz.
          Karta raqamingiz <b>hech qayerda saqlanmaydi</b>. 🔒
        </p>
        <div className="chip-row">
          <button className={"amt-chip" + (method === "card" ? " active" : "")} onClick={() => { haptic(); setMethod("card"); }}>💳 Plastik karta</button>
          <button className={"amt-chip" + (method === "home" ? " active" : "")} onClick={() => { haptic(); setMethod("home"); }}>🏠 Naxt uyga</button>
        </div>
        {!eligible ? (
          <div className="sheet-warn">
            {method === "card" ? "Kartaga" : "Uyga"} olish uchun kamida {formatNumber(min)} tanga kerak.
            <br />
            <span className="muted">Sizda: {formatNumber(bal)} — safar qilib to'plang 🚕</span>
          </div>
        ) : (
          <>
            <div className="cashout-amt">💰 Yechiladi: <b>{formatNumber(bal)}</b> tanga (≈{formatNumber(bal)} so'm)</div>
            {method === "card" ? (
              <>
                <input className="bk-input" inputMode="numeric" placeholder="💳 Karta raqami (16 raqam)" value={card} maxLength={23} onChange={(e) => setCard(e.target.value)} />
                <input className="bk-input" placeholder="👤 Karta egasi: Ism Familiya" value={holder} maxLength={60} onChange={(e) => setHolder(e.target.value)} />
              </>
            ) : (
              <input className="bk-input" placeholder="🏠 Manzil: ko'cha, uy raqami" value={addr} maxLength={120} onChange={(e) => setAddr(e.target.value)} />
            )}
            {err && <div className="sheet-err">{err}</div>}
            <button className="btn-primary" disabled={!canSubmit} onClick={submit}>
              {busy ? "Yuborilmoqda…" : "💵 So'rov yuborish"}
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
        <h3>🔁 Cashback → tanga</h3>
        <p className="muted sheet-sub">Taxi <b>cashback</b>ingizni o'yin <b>tanga</b>siga o'tkazing va o'ynang. 1 so'm = 1 tanga.</p>
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
            <button className="btn-violet" disabled={!amount || busy} onClick={submit}>{busy ? "…" : `🔁 ${amount ? formatNumber(amount) : ""} tangaga o'tkazish`}</button>
          </>
        )}
        <button className="btn-ghost" onClick={onClose}>Yopish</button>
      </div>
    </div>
  );
}

// "Bugun" strip — the action-first glance under the hero CTA: streak · missions-ready
// · jackpot. Each cell deep-jumps to its tab. Missions-ready is fetched once.
export function BugunStripView({ me, ready, onNav }: { me: MeResponse; ready: number | null; onNav: (t: "rewards" | "missions") => void }) {
  return (
    <div className="bugun-strip">
      <button className="bugun-cell" onClick={() => { haptic(); onNav("rewards"); }}>
        <span className="bugun-ico">🔥</span>
        <span className="bugun-val">{me.streak.current}</span>
        <span className="bugun-lbl">kun streak</span>
      </button>
      <button className={"bugun-cell" + (ready ? " hot" : "")} onClick={() => { haptic(); onNav("missions"); }}>
        <span className="bugun-ico">🎁</span>
        <span className="bugun-val">{ready ?? "·"}</span>
        <span className="bugun-lbl">vazifa tayyor</span>
      </button>
      <button className="bugun-cell" onClick={() => { haptic(); onNav("rewards"); }}>
        <span className="bugun-ico">🎰</span>
        <span className="bugun-val">{formatNumber(me.jackpot)}</span>
        <span className="bugun-lbl">jackpot</span>
      </button>
    </div>
  );
}

function BugunStrip({ me, onNav }: { me: MeResponse; onNav: (t: "rewards" | "missions") => void }) {
  const [ready, setReady] = useState<number | null>(null);
  useEffect(() => {
    api
      .missions()
      .then((m) => setReady([...m.daily, ...m.weekly].filter((x) => x.claimable).length))
      .catch(() => setReady(null));
  }, []);
  return <BugunStripView me={me} ready={ready} onNav={onNav} />;
}

export function WalletView({ me, onBanner, reload, onBook, onNav }: { me: MeResponse; onBanner: (m: string) => void; reload: () => void; onBook: () => void; onNav: (t: "rewards" | "missions") => void }) {
  const [wallet, setWallet] = useState<WalletResponse | null>(null);
  const [walletErr, setWalletErr] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [cash, setCash] = useState(false);
  const [topup, setTopup] = useState(false);
  const [send, setSend] = useState(false);
  const [payd, setPayd] = useState(() => {
    // Bot menyusidan «🙏 Haydovchiga to'lash» — Mini App'ni hamyon ekranida ochib, pay-driver
    // sheet'ni darhol chiqaradi (bir bosishda to'g'ridan-to'g'ri to'lov oynasi).
    const go = new URLSearchParams(location.search).get("go") || "";
    return go === "tip" || go === "paydriver" || go === "pay";
  });
  const coins = useCountUp(wallet?.coins ?? me.coins);
  const cashback = useCountUp(wallet?.cashback ?? me.stats.points);

  const loadWallet = () => {
    setWalletErr(false);
    api.wallet().then(setWallet).catch(() => setWalletErr(true)); // P1: no permanent spinner on error
  };
  useEffect(() => {
    loadWallet();
  }, []);

  const onDone = (msg: string) => {
    onBanner(msg);
    loadWallet();
    reload();
  };

  // C: convert ALL cashback → tanga in ONE click (no sheet, no amount picking)
  const convertAll = async () => {
    if (!wallet || wallet.cashback < wallet.topupMin) {
      onBanner(`Minimal ${formatNumber(wallet?.topupMin ?? 1000)} so'm cashback kerak`);
      return;
    }
    const r = await api.topup(Math.floor(wallet.cashback)).catch(() => null);
    if (r?.ok) {
      confetti();
      onDone(`🔁 ${formatNumber(r.amount)} tanga xazinangizga o'tdi!`);
    } else {
      onBanner("Hozircha o'tkazib bo'lmadi");
    }
  };

  const earned = me.badges.filter((b) => b.earned);

  return (
    <div className="view">
      {me.luckyDay && (
        <div className="sheet-ok tac">🍀 BUGUN OMAD KUNI — har safar cashback 2x!</div>
      )}
      <button className="book-cta book-cta-hero" onClick={onBook}>
        <span className="book-cta-main">🚖 Taxi chaqirish</span>
        <span className="book-cta-sub">jonli xarita · ETA · cashback</span>
      </button>
      <BugunStrip me={me} onNav={onNav} />

      <section className="wallet-hero glass">
        <div className="wh-row">
          <div className="wh-main">
            <div className="wh-label">🪙 O'yin hamyoni</div>
            <div className="wh-coins">{formatNumber(coins)}</div>
            <div className="wh-sub muted">tanga · 1 tanga = 1 so'm</div>
          </div>
          <div className="wh-ring" ref={(el) => el?.style.setProperty("--accent", me.level.color)}>
            <span className="wh-emoji">{me.level.emoji}</span>
            <span className="wh-lv">{me.level.name}</span>
            <span className="wh-tier muted">Liga: {me.leagueTier}</span>
          </div>
        </div>
        <div className="wh-cashback">
          <span>{me.type === "driver" ? "💼 kas1067 balans (haydovchi)" : "🚕 Taxi cashback (safarlardan)"}</span>
          <b>{formatNumber(cashback)} so'm</b>
        </div>
        {wallet?.isClient && (
          <div className="wh-actions">
            <button className="btn-violet wh-cta" onClick={() => { haptic(); convertAll(); }}>🔁 Hammasini tangaga</button>
          </div>
        )}
        <div className="wh-actions">
          <button className="btn-violet wh-cta" onClick={() => { haptic(); setSend(true); }}>👥 Do'stga</button>
          <button className="btn-primary wh-cta" onClick={() => { haptic(); setPayd(true); }}>🚖 Haydovchiga</button>
        </div>
        <div className="wh-actions">
          {/* withdraw works for BOTH client + driver (tanga → kas1067 balance). Drivers see it as a deposit. */}
          <button className="btn-ghost wh-cta" onClick={() => { haptic(); setSheet(true); }}>{wallet?.isClient ? "💸 So'mga yechish" : "💳 kas1067 balansiga"}</button>
        </div>
        {/* 💵 real cash-out (tanga → plastik karta / naxt uyga) — the owner pays out manually */}
        <div className="wh-actions">
          <button className="btn-primary wh-cta" onClick={() => { haptic(); setCash(true); }}>💵 Naxt pulga olish</button>
        </div>
        <div className="wh-meta muted">
          {me.rank && <span>O'rin {rankMedal(me.rank)}</span>}
          <span>🚕 {formatNumber(me.stats.trips)} safar</span>
          <span>🎖 {earned.length}/{me.badges.length}</span>
        </div>
      </section>

      <StreakCard me={me} onReward={onDone} />

      <section className="glass pad">
        <div className="section-title">📜 So'nggi harakatlar</div>
        {walletErr && !wallet ? (
          <div className="txn-empty muted">📡 Yuklanmadi · <button className="d-link" onClick={loadWallet}>qayta urinish</button></div>
        ) : !wallet ? (
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

      <AccountCard />

      {sheet && wallet && <WithdrawSheet wallet={wallet} onClose={() => setSheet(false)} onDone={onDone} />}
      {cash && wallet && <CashoutSheet wallet={wallet} onClose={() => setCash(false)} onDone={onDone} />}
      {topup && wallet && <TopupSheet wallet={wallet} onClose={() => setTopup(false)} onDone={onDone} />}
      {send && wallet && <TransferSheet wallet={wallet} onClose={() => setSend(false)} onDone={onDone} />}
      {payd && wallet && <PayDriverSheet wallet={wallet} onClose={() => setPayd(false)} onDone={onDone} />}
    </div>
  );
}

// ⚙️ Account & settings IN the Mini App (mirrors the bot /account): info + notification toggle.
type AccountInfo = {
  name: string;
  phone: string;
  joined: string | null;
  type: string;
  coins: number;
  cashback: number;
  streak: number;
  trips: number;
  notifyOff: boolean;
};
// 🏅 Daraja narvoni — mijoz qaysi darajada turganini VA har daraja nimaligini ko'radi.
// Ball = safar + faollik (computeXp). Halol: yuqori daraja = ko'proq safar = status.
const TIER_MEANING: Record<string, string> = {
  Yangi: "Boshlang'ich — birinchi safaringiz",
  Bronza: "Doimiy mijoz bo'lyapsiz",
  Kumush: "Faol mijoz — bizni tez-tez tanlaysiz",
  Oltin: "Sodiq mijoz — eng yaxshilardan",
  Platina: "Top mijoz — kam odam yetadi",
  Olmos: "Elita — shahardagi eng faollar",
  Afsona: "Afsona — 1067 ning yulduzi",
};

export function TierLadder({ me }: { me: MeResponse }) {
  const tierOn = !!me.flags?.tierloyalty;
  const [ben, setBen] = useState<TierBenefitsResponse | null>(null);
  const [filled, setFilled] = useState(false); // drives the "to'lib borishi" fill animation on open
  useEffect(() => {
    if (tierOn) api.tierBenefits().then(setBen).catch(() => undefined);
    const t = setTimeout(() => setFilled(true), 60);
    return () => clearTimeout(t);
  }, [tierOn]);

  const cur = me.level.index;
  const pct = Math.round((me.progress || 0) * 100);
  const toNext = me.nextLevel ? Math.max(0, me.nextLevel.minXp - me.xp) : 0;
  const benFor = (idx: number) => ben?.tiers.find((x) => x.levelIndex === idx);
  // chiroyli tavsif HAR DOIM (boyagi gaplar) — foyda alohida +X% badge'da ko'rsatiladi
  const meanFor = (l: (typeof LEVELS)[number]) => TIER_MEANING[l.name] ?? "";
  const ball = me.ballPoints ?? 0;
  const fromRides = me.stats.trips * 2;
  const fromCash = Math.max(0, Math.round(me.stats.points));

  return (
    <section className="glass pad tier-card">
      <div className="section-title">🏅 Sizning darajangiz</div>

      {/* 📉 decay ogohlantirishi (faqat flag ON + faolsiz oyna) */}
      {tierOn && me.decayWarning && (
        <div className="tier-decay">⚠️ <b>{me.idleDays} kun</b> faol bo&apos;lmadingiz — ballingiz kamaymoqda. Bugun safar qiling yoki vazifa bajaring!</div>
      )}

      {/* joriy daraja hero */}
      <div className="tier-hero" style={{ ["--lvl" as string]: me.level.color }}>
        <span className="tier-hero-emoji">{me.level.emoji}</span>
        <div className="tier-hero-info">
          <b className="tier-hero-name">{me.level.name}</b>
          <span className="tier-hero-xp">{formatNumber(me.xp)} ball{tierOn && benFor(cur) && benFor(cur)!.multPct > 0 ? ` · +${benFor(cur)!.multPct}% safar tanga` : ""}</span>
        </div>
      </div>

      {/* keyingi darajagacha progress — 0'dan to'ladi */}
      {me.nextLevel ? (
        <div className="tier-next">
          <div className="tier-next-row">
            <span className="muted">Keyingi: {me.nextLevel.emoji} {me.nextLevel.name}</span>
            <span><b>{formatNumber(toNext)}</b> ball qoldi</span>
          </div>
          <div className="tier-bar"><span style={{ width: `${filled ? pct : 0}%`, background: me.level.color }} /></div>
        </div>
      ) : (
        <div className="tier-next"><div className="tier-next-row tac"><b>👑 Eng yuqori darajadasiz!</b></div></div>
      )}

      {/* butun narvon — har daraja foydasi + to'lgan segment */}
      <div className="tier-list">
        {LEVELS.map((l) => {
          const state = l.index < cur ? "done" : l.index === cur ? "now" : "lock";
          const segPct = state === "done" ? 100 : state === "now" ? pct : 0;
          const b = tierOn ? benFor(l.index) : undefined;
          return (
            <div key={l.index} className={"tier-step " + state} style={{ ["--lvl" as string]: l.color }}>
              <span className="tier-step-emoji">{l.emoji}</span>
              <div className="tier-step-mid">
                <b className="tier-step-name">{l.name}{b && b.multPct > 0 && <span className="tier-mult">+{b.multPct}%</span>}</b>
                <small className="tier-step-mean">{meanFor(l)}</small>
                <div className="tier-seg"><span style={{ width: `${filled ? segPct : 0}%`, background: l.color }} /></div>
              </div>
              <div className="tier-step-right">
                {state === "now" ? <span className="tier-pill-now">📍 Siz shu yerda</span>
                  : state === "done" ? <span className="tier-pill-done">✅</span>
                  : <span className="tier-step-xp">{formatNumber(l.minXp)} ball</span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* ball breakdown — flag ON (shaffoflik) */}
      {tierOn && (
        <div className="tier-breakdown">Ball: <b>{formatNumber(ball)}</b> o&apos;yin + <b>{formatNumber(fromRides)}</b> safar + <b>{formatNumber(fromCash)}</b> cashback = <b>{formatNumber(me.xp)}</b> jami</div>
      )}

      {/* 📋 Shartlar — raqamlar jonli knoblardan (single source of truth) */}
      {tierOn && ben && (
        <div className="tier-rules">
          <div className="tier-rules-title">📋 Daraja shartlari</div>
          <div className="tier-rules-row">🎯 Har kuni <b>≥2 vazifa</b> → +{formatNumber(ben.rules.ballHalf)} ball · barchasi → +{formatNumber(ben.rules.ballFull)} ball</div>
          <div className="tier-rules-row">🏅 Daraja oshsa → <b>har safar ko&apos;proq tanga</b></div>
          <div className="tier-rules-row">📉 <b>{ben.rules.decayGraceDays} kun</b> faolsiz → kuniga {ben.rules.decayPct}% ball yechiladi · 1 safar/vazifa to&apos;xtatadi</div>
        </div>
      )}

      {!tierOn && <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>Har safar va faollik ball qo&apos;shadi. Ball ko&apos;paygani sayin darajangiz oshadi 🚀</p>}
    </section>
  );
}

// Ixcham daraja-chizig'i — profil panelida; bosilsa O'yin tabidagi to'liq narvonga olib boradi.
export function TierLadderCompact({ me, onOpen }: { me: MeResponse; onOpen: () => void }) {
  const pct = Math.round((me.progress || 0) * 100);
  return (
    <button className="tier-compact" onClick={() => { haptic(); onOpen(); }} style={{ ["--lvl" as string]: me.level.color }}>
      <span className="tier-compact-emoji">{me.level.emoji}</span>
      <div className="tier-compact-mid">
        <b className="tier-compact-name">{me.level.name}</b>
        <div className="tier-bar sm"><span style={{ width: `${pct}%`, background: me.level.color }} /></div>
      </div>
      <span className="tier-compact-chev">›</span>
    </button>
  );
}

export function AccountCard() {
  const [a, setA] = useState<AccountInfo | null>(null);
  const [editing, setEditing] = useState(false);
  const [nameVal, setNameVal] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    api.account().then(setA).catch(() => undefined);
  }, []);
  const toggle = async () => {
    if (!a) return;
    haptic();
    const r = await api.accountNotify(!a.notifyOff).catch(() => null);
    if (r) setA({ ...a, notifyOff: r.off });
  };
  const startEdit = () => {
    if (!a) return;
    setNameVal(a.name);
    setEditing(true);
  };
  const saveName = async () => {
    if (!a || saving) return;
    const v = nameVal.trim();
    if (v.length < 2 || v.length > 40) {
      setMsg("Ism 2–40 belgi bo'lsin");
      setTimeout(() => setMsg(null), 2500);
      return;
    }
    setSaving(true);
    const r = await api.accountName(v).catch(() => null);
    setSaving(false);
    if (r?.ok) {
      haptic();
      setA({ ...a, name: r.name ?? v });
      setEditing(false);
      setMsg("✅ Ism saqlandi");
      setTimeout(() => setMsg(null), 2000);
    } else {
      setMsg("Saqlanmadi — qayta urinib ko'ring");
      setTimeout(() => setMsg(null), 2500);
    }
  };
  const invite = async () => {
    haptic();
    const r = await api.referral().catch(() => null);
    if (r?.link) shareLink(r.link, inviteText(r.rewardReferee));
  };
  if (!a) return null;
  return (
    <section className="glass pad acct-card">
      {msg && <div className="sheet-ok tac" style={{ marginBottom: 8 }}>{msg}</div>}
      <div className="section-title">⚙️ Hisobim &amp; sozlamalar</div>

      {/* editable name */}
      {editing ? (
        <div className="acct-row" style={{ gap: 8 }}>
          <input className="acct-name-input" value={nameVal} maxLength={40} autoFocus onChange={(e) => setNameVal(e.target.value)} placeholder="Ismingiz" />
          <button className="acct-switch on" disabled={saving} onClick={saveName}>{saving ? "…" : "✅ Saqlash"}</button>
          <button className="acct-switch" onClick={() => setEditing(false)}>✖</button>
        </div>
      ) : (
        <div className="acct-row">
          <span className="muted">👤 Ism</span>
          <span className="acct-name-row"><b>{a.name}</b> <button className="acct-edit" onClick={startEdit}>✏️</button></span>
        </div>
      )}

      <div className="acct-row"><span className="muted">📞 Telefon</span><span>{a.phone} <i className="muted">(1067)</i></span></div>
      {a.joined && <div className="acct-row"><span className="muted">📅 A&apos;zo</span><span>{a.joined}</span></div>}
      <div className="acct-row"><span className="muted">🚕 Safar / 🔥 streak</span><span>{formatNumber(a.trips)} · {a.streak}</span></div>
      <div className="acct-row">
        <span>🔔 Bildirishnomalar</span>
        <button className={"acct-switch" + (a.notifyOff ? "" : " on")} onClick={toggle}>{a.notifyOff ? "🔴 O'chiq" : "🟢 Yoniq"}</button>
      </div>

      {/* one-tap invite a friend */}
      <button className="acct-invite" onClick={invite}>👥 Do&apos;stni taklif qilish — ikkalangizga tanga 🎁</button>

      <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>Ismni o&apos;zingiz tahrirlaysiz. Telefon 1067 tizimida boshqariladi.</p>
    </section>
  );
}
