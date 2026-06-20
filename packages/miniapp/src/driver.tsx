import { useEffect, useState } from "react";
import { formatNumber, type MeResponse } from "@t1067/shared";
import { api } from "./api";
import { Spinner } from "./components";
import { useCountUp, confetti } from "./util";
import { hapticSuccess } from "./telegram";

type DriverMission = { id: string; emoji: string; title: string; target: number; reward: number; progress: number; claimable: boolean; claimed: boolean };

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
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState(false);
  const coins = useCountUp(me.coins);

  const loadMissions = () => api.driverMissions().then(setMissions).catch(() => setMissions({ missions: [], ridesToday: 0 }));
  const load = () => {
    setErr(false);
    api.driverEarnings().then(setData).catch(() => setErr(true)); // P1: no permanent spinner on error
    api.driverRides().then((r) => setRides(r.rides)).catch(() => setRides([]));
    loadMissions();
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

  return (
    <div className="view">
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

      <section className="glass pad">
        <div className="section-title">🎯 Bugungi topshiriqlar{missions ? ` · 🚕 ${missions.ridesToday}` : ""}</div>
        {msg && <div className="sheet-ok tac">{msg}</div>}
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
