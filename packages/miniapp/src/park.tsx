import { useEffect, useState } from "react";
import { formatNumber, type ParkResponse } from "@t1067/shared";
import { api } from "./api";
import { haptic } from "./telegram";
import { confetti, useCountUp } from "./util";

export function ParkView({ onReward }: { onReward: (msg: string) => void }) {
  const [park, setPark] = useState<ParkResponse | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const accrued = useCountUp(park?.accrued ?? 0, 500);

  const load = () => api.park().then(setPark).catch(() => undefined);
  useEffect(() => {
    load();
    const t = setInterval(load, 20000); // refresh accrual while open
    return () => clearInterval(t);
  }, []);

  const collect = async () => {
    if (busy || !park?.accrued) return;
    setBusy("collect");
    haptic();
    try {
      const r = await api.parkCollect();
      if (r.ok) {
        confetti();
        onReward(`🪙 +${formatNumber(r.collected)} coin yig'ildi!`);
      }
      await load();
    } finally {
      setBusy(null);
    }
  };

  const buy = async (code: string) => {
    if (busy) return;
    setBusy(code);
    haptic();
    try {
      const r = await api.parkBuy(code);
      if (!r.ok && r.reason === "insufficient") onReward("🪙 Coin yetarli emas");
      await load();
    } finally {
      setBusy(null);
    }
  };

  if (!park) return <div className="race-overlay"><div className="spinner" /></div>;

  return (
    <div className="view park-view">
      <section className={"glass pad park-collect" + (park.capped ? " full" : "")}>
        <div className="park-acc-label muted">{park.capped ? "🔴 To'ldi — yig'ing!" : "Yig'iladigan coin"}</div>
        <div className="park-acc">🪙 {formatNumber(accrued)}</div>
        <div className="park-rate muted">
          {formatNumber(park.perHour)}/soat {park.rideBonusActive && <span className="park-bonus">+25% safar bonusi 🚕</span>}
        </div>
        <button className="btn-primary" disabled={busy !== null || park.accrued <= 0} onClick={collect}>
          {busy === "collect" ? "…" : park.accrued > 0 ? `Yig'ish` : "Hozircha bo'sh"}
        </button>
      </section>

      <div className="section-title">🚕 Taksopark — coin ishlab beradi</div>
      {park.cars.map((c) => (
        <div key={c.code} className={"glass park-car" + (c.level > 0 ? " owned" : "")}>
          <div className="park-car-emoji">{c.emoji}</div>
          <div className="park-car-body">
            <div className="park-car-name">
              {c.name} {c.level > 0 && <span className="park-lv">Lv{c.level}</span>}
            </div>
            <div className="muted park-car-out">⚡️ {formatNumber(c.output)} coin/soat</div>
          </div>
          <button className="park-buy" disabled={busy !== null} onClick={() => buy(c.code)}>
            {busy === c.code ? "…" : c.level === 0 ? `🪙 ${formatNumber(c.upgradeCost)}` : `⬆️ ${formatNumber(c.upgradeCost)}`}
          </button>
        </div>
      ))}
      <div className="muted park-foot">Har 8 soatda to'ladi — kuniga bir necha bor kirib yig'ing. Real taksida yursangiz +25%!</div>
    </div>
  );
}
