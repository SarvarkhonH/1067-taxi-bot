import { useEffect, useState } from "react";
import { formatNumber, type MeResponse } from "@t1067/shared";
import { api } from "./api";
import { Spinner } from "./components";
import { useCountUp, confetti } from "./util";
import { hapticSuccess, shareLink, copyText } from "./telegram";

type DriverMission = { id: string; emoji: string; title: string; target: number; reward: number; progress: number; claimable: boolean; claimed: boolean };
type DriverAccount = { linked: boolean; carNumber?: string; balance?: number; debt?: number; ridesToday?: number; fareToday?: number; canPayDebt?: boolean };
type DriverQr = { ok: boolean; link?: string; png?: string; shareText?: string };

type DriverRide = { id: number; addressName: string; status: string; carModel: string; payment: number; cashback: number; at: string };
const RIDE_STATUS: Record<string, { e: string; t: string }> = {
  delivered: { e: "✅", t: "Yakunlandi" },
  cancelled: { e: "❌", t: "Bekor" },
  canceled: { e: "❌", t: "Bekor" },
  new: { e: "🆕", t: "Yangi" },
  take: { e: "🚕", t: "Qabul" },
  in_place: { e: "📍", t: "Joyda" },
};
function rideTime(at: string): string {
  const d = new Date(at);
  if (isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)} · ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Driver earnings hub — tips + transfers in, recent ledger. Tab shows only for drivers. */
export function DriverView({ me }: { me: MeResponse }) {
  const [data, setData] = useState<{ todayIn: number; totalIn: number; txns: { amount: number; kind: string; reason: string; at: string }[] } | null>(null);
  const [rides, setRides] = useState<DriverRide[] | null>(null);
  const [missions, setMissions] = useState<{ missions: DriverMission[]; ridesToday: number } | null>(null);
  const [account, setAccount] = useState<DriverAccount | null>(null);
  const [qr, setQr] = useState<DriverQr | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState(false);
  // money-balance shown live (after a debt payment it drops); seeded from me.coins
  const [coinBal, setCoinBal] = useState(me.coins);
  const [paying, setPaying] = useState(false);
  const [payNonce] = useState(() => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`); // stable per card session
  const coins = useCountUp(coinBal);

  const loadMissions = () => api.driverMissions().then(setMissions).catch(() => setMissions({ missions: [], ridesToday: 0 }));
  const loadAccount = () => api.driverAccount().then(setAccount).catch(() => setAccount({ linked: false }));
  const load = () => {
    setErr(false);
    api.driverEarnings().then(setData).catch(() => setErr(true)); // P1: no permanent spinner on error
    api.driverRides().then((r) => setRides(r.rides)).catch(() => setRides([]));
    loadMissions();
    loadAccount();
    api.driverQr().then(setQr).catch(() => setQr({ ok: false }));
  };

  const payDebt = async (amount: number) => {
    if (paying || amount < 1) return;
    setPaying(true);
    const r = await api.payDriverDebt(amount, payNonce).catch(() => ({ ok: false, message: "Tarmoq xatosi" }));
    setPaying(false);
    setMsg(r.message);
    setTimeout(() => setMsg(null), 4000);
    if (r.ok) {
      hapticSuccess();
      confetti();
      setCoinBal((c) => Math.max(0, c - amount)); // reflect the spend immediately
      void loadAccount(); // refresh debt figure
    }
  };
  const shareQr = () => {
    if (qr?.link) shareLink(qr.link, qr.shareText ?? "1067 Taxi 🚕");
  };
  const copyQr = async () => {
    if (qr?.link) {
      await copyText(qr.link);
      setMsg("📋 Havola nusxalandi");
      setTimeout(() => setMsg(null), 2500);
    }
  };
  const claim = async (id: string) => {
    const r = await api.claimDriverMission(id);
    if (r.ok) {
      hapticSuccess();
      confetti();
      setMsg(`🎁 +${formatNumber(r.reward ?? 0)} tanga!`);
      setTimeout(() => setMsg(null), 3000);
      void loadMissions();
    }
  };
  useEffect(() => {
    load();
  }, []);

  // pay-amount presets: "max you can" + round chunks, each capped at min(debt, coins)
  const debt = account?.debt ?? 0;
  const payable = Math.min(debt, coinBal);
  const payOptions = [...new Set([payable, ...[10_000, 25_000, 50_000].filter((c) => c < payable)])]
    .filter((a) => a >= 1)
    .sort((a, b) => b - a)
    .slice(0, 4);

  return (
    <div className="view">
      {msg && <div className="sheet-ok tac" style={{ marginBottom: 10 }}>{msg}</div>}
      <section className="wallet-hero glass">
        <div className="wh-row">
          <div className="wh-main">
            <div className="wh-label">🚗 Haydovchi hamyoni</div>
            <div className="wh-coins">{Math.round(coins).toLocaleString("ru-RU")}</div>
            <div className="wh-sub muted">tanga · 1 tanga = 1 so'm · Hamyon tabidan so'mga yeching</div>
          </div>
        </div>
        {data && (
          <div className="wh-cashback">
            <span>📈 Bugun tushdi</span>
            <b>+{formatNumber(data.todayIn)} tanga</b>
          </div>
        )}
        {data && (
          <div className="wh-cashback">
            <span>💼 Jami tushum (tip/o'tkazma/bonus)</span>
            <b>{formatNumber(data.totalIn)} tanga</b>
          </div>
        )}
      </section>

      {account?.linked && (
        <section className="glass pad">
          <div className="section-title">🚕 Kas hisobi{account.carNumber ? ` · ${account.carNumber}` : ""}</div>
          <div className="wh-cashback">
            <span>👛 Kas balans</span>
            <b>{formatNumber(account.balance ?? 0)} so'm</b>
          </div>
          <div className="wh-cashback">
            <span>🚕 Bugun</span>
            <b>{formatNumber(account.ridesToday ?? 0)} safar · {formatNumber(account.fareToday ?? 0)} so'm</b>
          </div>
          {debt > 0 && (
            <div className="wh-cashback" style={{ color: "var(--warn, #f5a623)" }}>
              <span>⚠️ Qarz</span>
              <b>{formatNumber(debt)} so'm</b>
            </div>
          )}
          {account.canPayDebt && debt > 0 && (
            <div style={{ marginTop: 10 }}>
              {payOptions.length === 0 ? (
                <p className="muted" style={{ fontSize: 13 }}>Qarzni to'lash uchun tanga yetarli emas — safar qilib tanga to'plang.</p>
              ) : (
                <>
                  <p className="muted" style={{ fontSize: 13, marginBottom: 6 }}>Qarzni tanga bilan to'lang (1 tanga = 1 so'm):</p>
                  <div className="amt-row">
                    {payOptions.map((amt) => (
                      <button key={amt} className="amt-chip active" disabled={paying} onClick={() => payDebt(amt)}>
                        {amt === payable ? `💸 ${formatNumber(amt)}` : formatNumber(amt)}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </section>
      )}

      <section className="glass pad">
        <div className="section-title">🎯 Bugungi topshiriqlar{missions ? ` · 🚕 ${missions.ridesToday}` : ""}</div>
        {missions === null ? (
          <Spinner />
        ) : missions.missions.length === 0 ? (
          <div className="muted txn-empty">Hozircha topshiriq yo'q.</div>
        ) : (
          <div className="txn-list">
            {missions.missions.map((m) => (
              <div key={m.id} className="txn">
                <span className="txn-emoji">{m.emoji}</span>
                <span className="txn-reason">
                  <b>{m.title}</b>
                  <br />
                  <span className="muted" style={{ fontSize: 12 }}>{m.progress}/{m.target} safar · +{formatNumber(m.reward)} tanga</span>
                </span>
                {m.claimed ? (
                  <span className="txn-amt">✅</span>
                ) : m.claimable ? (
                  <button className="amt-chip active" onClick={() => claim(m.id)}>🎁 Olish</button>
                ) : (
                  <span className="txn-amt">{m.progress}/{m.target}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="glass pad">
        <div className="section-title">🚕 Safarlarim {rides && rides.length > 0 ? `(${rides.length})` : ""}</div>
        {rides === null ? (
          <Spinner />
        ) : rides.length === 0 ? (
          <div className="muted txn-empty">Hali safar yo'q — mashina raqamingiz bo'yicha topilmadi.</div>
        ) : (
          <div className="txn-list">
            {rides.map((r) => {
              const s = RIDE_STATUS[r.status] ?? { e: "🚗", t: r.status };
              return (
                <div key={r.id} className="txn">
                  <span className="txn-emoji">{s.e}</span>
                  <span className="txn-reason">
                    {r.addressName || "—"}
                    <br />
                    <span className="muted" style={{ fontSize: 12 }}>{rideTime(r.at)} · {r.carModel} · {s.t}</span>
                  </span>
                  {r.payment > 0 && <span className="txn-amt">{formatNumber(r.payment)}</span>}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {qr?.ok && qr.png && (
        <section className="glass pad">
          <div className="section-title">📷 Mening QR kodim</div>
          <p className="muted mk-sub">Mijozga ko'rsating — skanerlab birinchi safarini qilsa, sizga tanga tushadi.</p>
          <div style={{ display: "flex", justifyContent: "center", padding: "10px 0" }}>
            <img src={qr.png} alt="QR" width={200} height={200} style={{ borderRadius: 12, background: "#fff", padding: 8 }} />
          </div>
          <div className="amt-row">
            <button className="amt-chip active" onClick={shareQr} style={{ flex: 1 }}>📤 Ulashish</button>
            <button className="amt-chip" onClick={copyQr} style={{ flex: 1 }}>📋 Havola</button>
          </div>
        </section>
      )}

      <section className="glass pad">
        <div className="section-title">🙏 Daromad manbalari</div>
        <p className="muted mk-sub">Har yakunlangan safar uchun avtomatik bonus · mijozlar safardan keyin tanga bilan rahmat aytadi · istalgan a'zo sizga o'tkazma yubora oladi.</p>
      </section>

      <section className="glass pad">
        <div className="section-title">📜 Oxirgi amallar</div>
        {err && !data ? (
          <div className="txn-empty muted">📡 Yuklanmadi · <button className="d-link" onClick={load}>qayta urinish</button></div>
        ) : !data ? (
          <Spinner />
        ) : data.txns.length === 0 ? (
          <div className="muted txn-empty">Hali tushum yo'q — safarlar boshlanishi bilan ko'rinadi.</div>
        ) : (
          <div className="txn-list">
            {data.txns.map((t, i) => (
              <div key={i} className="txn">
                <span className="txn-emoji">{t.kind === "tip_in" ? "🙏" : t.kind === "driver_bonus" ? "🚗" : t.amount > 0 ? "📥" : "📤"}</span>
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
    </div>
  );
}
