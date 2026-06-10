import { useEffect, useState } from "react";
import { DUEL_STAKES, formatNumber, type DuelListResponse } from "@t1067/shared";
import { api } from "./api";
import { haptic } from "./telegram";
import { confetti } from "./util";
import { RaceCanvasGame, type RunPayload } from "./race";

type Play = { duelId: string; seed: number; token: string; stake: number; role: "challenger" | "opponent" };

export function DuelView({ onReward }: { onReward: (msg: string) => void }) {
  const [list, setList] = useState<DuelListResponse | null>(null);
  const [play, setPlay] = useState<Play | null>(null);
  const [resultMsg, setResultMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => api.duelList().then(setList).catch(() => undefined);
  useEffect(() => {
    load();
  }, []);

  const create = async (stake: number) => {
    if (busy) return;
    setBusy(true);
    haptic();
    try {
      const r = await api.duelCreate(stake);
      if (!r.ok) {
        onReward(r.reason === "insufficient" ? "🪙 Coin yetarli emas" : "Xatolik");
        return;
      }
      setPlay({ duelId: r.duelId!, seed: r.seed!, token: r.token!, stake, role: "challenger" });
    } finally {
      setBusy(false);
    }
  };

  const accept = async (duelId: string) => {
    if (busy) return;
    setBusy(true);
    haptic();
    try {
      const r = await api.duelAccept(duelId);
      if (!r.ok) {
        onReward(r.reason === "insufficient" ? "🪙 Coin yetarli emas" : "Duel band bo'lib qoldi");
        await load();
        return;
      }
      setPlay({ duelId, seed: r.seed!, token: r.token!, stake: r.stake, role: "opponent" });
    } finally {
      setBusy(false);
    }
  };

  const onDone = async (run: RunPayload) => {
    if (!play) return;
    try {
      const r = await api.duelRun({ duelId: play.duelId, token: play.token, ...run });
      if (!r.ok) {
        setResultMsg(`Xatolik: ${r.reason ?? ""}`);
      } else if (!r.settled) {
        setResultMsg(`🏁 Ballingiz: ${formatNumber(r.myScore)}\n⏳ Raqib kutilmoqda — natija push bilan keladi!`);
      } else if (r.tie) {
        setResultMsg(`🤝 Durang! ${formatNumber(r.myScore)} vs ${formatNumber(r.theirScore ?? 0)} — garovlar qaytdi`);
      } else if (r.won) {
        confetti();
        setResultMsg(`🏆 G'ALABA! ${formatNumber(r.myScore)} vs ${formatNumber(r.theirScore ?? 0)}\n🪙 +${formatNumber(r.pot)} coin!`);
      } else {
        setResultMsg(`😔 Yutqazdingiz: ${formatNumber(r.myScore)} vs ${formatNumber(r.theirScore ?? 0)}`);
      }
    } catch {
      setResultMsg("Natijani yuborib bo'lmadi");
    }
  };

  if (play) {
    if (resultMsg) {
      return (
        <div className="race-overlay">
          <div className="race-result">
            <div className="race-result-emoji">⚔️</div>
            <div className="race-msg" style={{ whiteSpace: "pre-line" }}>{resultMsg}</div>
            <button
              className="btn-primary"
              onClick={() => {
                setPlay(null);
                setResultMsg(null);
                load();
              }}
            >
              Davom etish
            </button>
          </div>
        </div>
      );
    }
    return (
      <div className="race-overlay">
        <RaceCanvasGame
          seed={play.seed}
          ghostInputs={null}
          topLeft={play.role === "challenger" ? "⚔️ Chaqiriq — ballingizni qo'ying" : "⚔️ Duel — raqibdan o'ting!"}
          topRight={`Garov: 🪙 ${formatNumber(play.stake)}`}
          onDone={onDone}
        />
      </div>
    );
  }

  return (
    <div className="view">
      <section className="glass pad stake-game" style={{ ["--g" as string]: "#a855f7" }}>
        <div className="stake-head">
          <div className="stake-emoji">⚔️</div>
          <div>
            <div className="stake-name">Chaqiriq tashlash</div>
            <div className="muted stake-desc">Garov tiking, yuring — kim qabul qilsa, bir xil trassada bellashadi. G'olib 2x oladi</div>
          </div>
        </div>
        <div className="stake-chips">
          {DUEL_STAKES.map((s) => (
            <button key={s} className="stake-chip" disabled={busy} onClick={() => create(s)}>
              🪙 {formatNumber(s)}
            </button>
          ))}
        </div>
      </section>

      <div className="section-title">🔥 Ochiq chaqiriqlar</div>
      {!list ? (
        <div className="muted weekly-empty">Yuklanmoqda…</div>
      ) : list.open.length === 0 ? (
        <div className="muted weekly-empty">Hozircha ochiq duel yo'q — birinchi bo'lib chaqiriq tashlang!</div>
      ) : (
        list.open.map((d) => (
          <div key={d.duelId} className="glass duel-row">
            <div className="duel-row-body">
              <div className="duel-name">⚔️ {d.challengerName}</div>
              <div className="muted duel-sub">{d.ageMin} daqiqa oldin · ball yashirin</div>
            </div>
            <button className="btn-violet sm" disabled={busy} onClick={() => accept(d.duelId)}>
              🪙 {formatNumber(d.stake)} — qabul
            </button>
          </div>
        ))
      )}

      {list && list.mine.length > 0 && (
        <>
          <div className="section-title">📜 Mening duellarim</div>
          {list.mine.map((d) => (
            <div key={d.duelId} className="glass duel-row">
              <div className="duel-row-body">
                <div className="duel-name">
                  {d.won === true ? "🏆" : d.won === false ? "😔" : d.status === "open" ? "⏳" : "🤝"} vs {d.opponentName ?? "kutilmoqda"}
                </div>
                <div className="muted duel-sub">
                  {d.status === "open"
                    ? "Raqib kutilmoqda"
                    : d.status === "settled"
                      ? `${formatNumber(d.myScore ?? 0)} vs ${formatNumber(d.theirScore ?? 0)}${d.won ? ` · +${formatNumber(d.pot)}` : d.won === null ? " · durang" : ""}`
                      : d.status === "refunded"
                        ? "Bekor — garov qaytdi"
                        : "Jarayonda"}
                </div>
              </div>
              <div className="duel-stake muted">🪙 {formatNumber(d.stake)}</div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
