import { useEffect, useState } from "react";
import { formatNumber, type MeResponse } from "@t1067/shared";
import { api } from "./api";
import { Spinner } from "./components";
import { useCountUp } from "./util";

/** Driver earnings hub — tips + transfers in, recent ledger. Tab shows only for drivers. */
export function DriverView({ me }: { me: MeResponse }) {
  const [data, setData] = useState<{ todayIn: number; totalIn: number; txns: { amount: number; kind: string; reason: string; at: string }[] } | null>(null);
  const [err, setErr] = useState(false);
  const coins = useCountUp(me.coins);

  const load = () => {
    setErr(false);
    api.driverEarnings().then(setData).catch(() => setErr(true)); // P1: no permanent spinner on error
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
