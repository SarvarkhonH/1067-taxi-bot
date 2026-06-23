import { useEffect, useState } from "react";
import { formatNumber, type MeResponse } from "@t1067/shared";
import { api } from "./api";
import { Spinner } from "./components";
import { useCountUp, confetti } from "./util";
import { hapticSuccess, shareLink, copyText } from "./telegram";

type DriverMission = { id: string; emoji: string; title: string; target: number; reward: number; progress: number; claimable: boolean; claimed: boolean };
type HotZone = { name: string; count: number };
type DriverAccount = {
  linked: boolean; carNumber?: string; balance?: number; debt?: number; ridesToday?: number; fareToday?: number; canPayDebt?: boolean;
  rating?: number; takeCount?: number; cancelCount?: number; blocked?: boolean; dispatcherPhones?: string[]; hotZones?: HotZone[];
};
type DriverQr = { ok: boolean; link?: string; png?: string; shareText?: string };

type DriverRide = { id: number; addressName: string; status: string; carModel: string; payment: number; cashback: number; at: string };
const RIDE_STATUS: Record<string, { e: string; t: string }> = {
  delivered: { e: "✅", t: "Yakunlandi" },
  cancelled: { e: "✖️", t: "Bekor" },
  canceled: { e: "✖️", t: "Bekor" },
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

/** Driver hub — kas account at a glance (rides/earnings/balance/debt), debt-pay with tanga,
 *  missions, ride history, in-car QR. Tab shows only for drivers. */
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

      {/* ── BLOKLANGAN HOLAT ─────────────────────────────────────────────── */}
      {account?.blocked && (
        <div className="drv-blocked">
          <span className="drv-blocked-ico">⛔</span>
          <div>
            <b>Hisobingiz bloklangan</b>
            <span>Buyurtma olish vaqtincha to'xtatilgan. Dispetcherga murojaat qiling 👇</span>
          </div>
        </div>
      )}

      {/* ── HERO: tanga wallet ─────────────────────────────────────────── */}
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

      {/* ── KAS HISOBI: stat grid + debt-pay ───────────────────────────── */}
      {account === null ? (
        <section className="glass pad"><Spinner /></section>
      ) : account.linked ? (
        <section className="glass pad">
          <div className="section-title">🚕 Kas hisobi{account.carNumber ? ` · ${account.carNumber}` : ""}</div>
          <div className="drv-grid">
            <div className="drv-stat">
              <div className="drv-stat-top"><span className="drv-stat-ico">🚕</span><span className="drv-stat-lbl">Bugun safar</span></div>
              <div className="drv-stat-val">{formatNumber(account.ridesToday ?? 0)}</div>
            </div>
            <div className="drv-stat gold">
              <div className="drv-stat-top"><span className="drv-stat-ico">💰</span><span className="drv-stat-lbl">Bugun daromad</span></div>
              <div className="drv-stat-val">{formatNumber(account.fareToday ?? 0)} <small>so'm</small></div>
            </div>
            <div className="drv-stat">
              <div className="drv-stat-top"><span className="drv-stat-ico">👛</span><span className="drv-stat-lbl">Kas balans</span></div>
              <div className="drv-stat-val">{formatNumber(account.balance ?? 0)} <small>so'm</small></div>
            </div>
            <div className={"drv-stat " + (debt > 0 ? "warn" : "ok")}>
              <div className="drv-stat-top"><span className="drv-stat-ico">{debt > 0 ? "⚠️" : "✅"}</span><span className="drv-stat-lbl">Qarz</span></div>
              <div className="drv-stat-val">{debt > 0 ? <>{formatNumber(debt)} <small>so'm</small></> : "yo'q"}</div>
            </div>
          </div>

          {/* debt-pay: only when qarz feature on + there IS debt */}
          {account.canPayDebt && debt > 0 && (
            <div className="drv-debt">
              {payOptions.length === 0 ? (
                <>
                  <div className="drv-debt-h">💸 Qarzni tanga bilan to'lash</div>
                  <div className="drv-debt-warn">Tanga yetarli emas — safar qilib tanga to'plang, keyin shu yerdan to'lang.</div>
                </>
              ) : (
                <>
                  <div className="drv-debt-h">💸 Qarzni tanga bilan to'lang</div>
                  <div className="drv-debt-sub">1 tanga = 1 so'm · darhol kas hisobingizga o'tadi</div>
                  <div className="drv-debt-chips">
                    {payOptions.map((amt) => (
                      <button key={amt} className={"drv-debt-chip" + (amt === payable ? " full" : "")} disabled={paying} onClick={() => payDebt(amt)}>
                        {amt === payable ? `Hammasi · ${formatNumber(amt)}` : formatNumber(amt)}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* rating + take/cancel */}
          {(account.rating != null || account.takeCount != null) && (
            <div className="drv-meta-row">
              {account.rating != null && (
                <div className="drv-meta"><span className="star">⭐</span> <b>{account.rating.toFixed(1)}</b> reyting</div>
              )}
              {account.takeCount != null && (
                <div className="drv-meta">🚕 <b>{formatNumber(account.takeCount)}</b> / {formatNumber(account.cancelCount ?? 0)} bekor</div>
              )}
            </div>
          )}

          {/* hot zones — where this driver gets the most rides */}
          {account.hotZones && account.hotZones.length > 0 && (
            <>
              <p className="muted" style={{ fontSize: 12, margin: "12px 0 0" }}>🔥 Eng ko'p safar joylaringiz:</p>
              <div className="drv-zones">
                {account.hotZones.map((z) => (
                  <span key={z.name} className="drv-zone">{z.name} <small>{z.count}</small></span>
                ))}
              </div>
            </>
          )}
        </section>
      ) : null}

      {/* ── DISPETCHER HOTLINE'LAR ─────────────────────────────────────── */}
      {account?.dispatcherPhones && account.dispatcherPhones.length > 0 && (
        <section className="glass pad">
          <div className="section-title">📞 Dispetcher</div>
          <p className="muted mk-sub">Yordam kerakmi? Bir bosishda qo'ng'iroq qiling.</p>
          <div className="drv-calls">
            {account.dispatcherPhones.map((phone, i) => (
              <a key={phone} className="drv-call" href={`tel:${phone.replace(/[^\d+]/g, "")}`}>
                <span className="drv-call-ico">📞</span>
                <span className="drv-call-meta">
                  <b>{phone}</b>
                  <span>{i === 0 ? "Asosiy dispetcher" : `Dispetcher ${i + 1}`}</span>
                </span>
                <span className="drv-call-go">›</span>
              </a>
            ))}
          </div>
        </section>
      )}

      {/* ── TOPSHIRIQLAR ───────────────────────────────────────────────── */}
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

      {/* ── SAFARLARIM ─────────────────────────────────────────────────── */}
      <section className="glass pad">
        <div className="section-title">🚕 Safarlarim{rides && rides.length > 0 ? ` · ${rides.length}` : ""}</div>
        {rides === null ? (
          <Spinner />
        ) : rides.length === 0 ? (
          <div className="muted txn-empty">Hali safar yo'q — mashina raqamingiz bo'yicha topilmadi.</div>
        ) : (
          <div>
            {rides.map((r) => {
              const s = RIDE_STATUS[r.status] ?? { e: "🚗", t: r.status };
              return (
                <div key={r.id} className="drv-ride">
                  <span className="drv-ride-ico">{s.e}</span>
                  <span className="drv-ride-meta">
                    <div className="drv-ride-addr">{r.addressName || "—"}</div>
                    <div className="drv-ride-sub">{rideTime(r.at)} · {r.carModel || "—"} · {s.t}</div>
                  </span>
                  {r.payment > 0 && <span className="drv-ride-amt">{formatNumber(r.payment)}</span>}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── MENING QR ──────────────────────────────────────────────────── */}
      {qr?.ok && qr.png && (
        <section className="glass pad">
          <div className="section-title">📷 Mening QR kodim</div>
          <p className="muted mk-sub">Mijozga ko'rsating — skanerlab birinchi safarini qilsa, sizga tanga tushadi.</p>
          <div className="drv-qr-wrap">
            <img className="drv-qr" src={qr.png} alt="QR" width={196} height={196} />
          </div>
          <div className="drv-share">
            <button className="primary" onClick={shareQr}>📤 Ulashish</button>
            <button onClick={copyQr}>📋 Havola</button>
          </div>
        </section>
      )}

      {/* ── OXIRGI AMALLAR (tanga ledger) ──────────────────────────────── */}
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
                <span className="txn-emoji">{t.kind === "tip_in" ? "🙏" : t.kind === "driver_bonus" ? "🚗" : t.kind === "debt_pay" ? "💸" : t.amount > 0 ? "📥" : "📤"}</span>
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
