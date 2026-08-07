// T1 demo-sahifa (storybook-lite). FAQAT #demo hash bilan, lazy-yuklanadi.
// HECH QANDAY real API chaqirig'i yo'q — sof ko'rinish.
import { useState } from "react";
import type { MeResponse, MissionsResponse } from "@t1067/shared";
import { Button, Card, Chip, CoinCounter, EmptyState, LoadSection, ProgressBar, Sheet, Skeleton, StreakFlame, TierBadge } from "./components";
import { RouletteWheel } from "./RouletteWheel";
import { BonusCenterView } from "../rewards";
import { BugunStripView } from "../wallet";
import { confetti } from "../util";

// Action-first home fixture (streak for the Bugun strip).
const demoMeHome = { streak: { current: 12, longest: 30, checkedToday: true } } as unknown as MeResponse;

// T6 render-proof fixtures (pure view, no API).
const demoMeActive = { streak: { current: 12, longest: 30, checkedToday: false } } as unknown as MeResponse;
const demoMeFull = { streak: { current: 30, longest: 30, checkedToday: true } } as unknown as MeResponse;
const m = (code: string, progress: number, claimable: boolean, claimed: boolean): MissionsResponse["daily"][number] =>
  ({ code, title: code, emoji: "🎯", period: "daily", target: 1, reward: 50, progress, claimable, claimed });
const demoMissionsPartial: MissionsResponse = {
  daily: [m("daily_ride", 1, false, true), m("daily_spin", 0, false, false), m("daily_checkin", 1, true, false)],
  weekly: [{ ...m("weekly_rides", 5, true, false), period: "weekly", target: 5, reward: 700 }],
};
const demoMissionsFull: MissionsResponse = {
  daily: [m("daily_ride", 1, false, true), m("daily_spin", 1, false, true)],
  weekly: [],
};

const DEMO_PRIZES = [
  { label: "40", emoji: "🪙", color: "#243049" },
  { label: "50", emoji: "💰", color: "#1e2638" },
  { label: "100", emoji: "✨", color: "#243049" },
  { label: "200", emoji: "🎁", color: "#1e2638" },
  { label: "500", emoji: "💎", color: "#243049" },
  { label: "🎟", emoji: "🎟", color: "#1e2638" },
];

export default function DesignDemo() {
  const [coins, setCoins] = useState(17450);
  const [sheet, setSheet] = useState(false);
  const [spinId, setSpinId] = useState(0);
  const [target, setTarget] = useState<number | null>(null);
  const [busy, setBusy] = useState(true);
  const [loadState, setLoadState] = useState<"loading" | "error" | "ready">("error");

  return (
    <div className="app">
      <div className="aurora" />
      <main className="content">
        <div className="view">
          <div className="section-title">🎨 T1 dizayn-demo (#demo)</div>

          <div className="section-title">🏠 Action-first home (hero + bugun strip)</div>
          <button className="book-cta book-cta-hero" onClick={() => confetti()}>
            <span className="book-cta-main">🚖 Taxi chaqirish</span>
            <span className="book-cta-sub">jonli xarita · ETA · cashback</span>
          </button>
          <BugunStripView me={demoMeHome} ready={2} onNav={() => undefined} />
          <div className="mt8" />
          <BugunStripView me={demoMeHome} ready={0} onNav={() => undefined} />


          <div className="section-title">🎁 T6 Bonus-markaz (faol holat)</div>
          <BonusCenterView me={demoMeActive} missions={demoMissionsPartial} err={false} checking={false} onCheckin={() => confetti()} onRetry={() => undefined} />
          <div className="section-title mt8">🎁 T6 Bonus-markaz (kombo 3/3)</div>
          <BonusCenterView me={demoMeFull} missions={demoMissionsFull} err={false} checking={false} onCheckin={() => undefined} onRetry={() => undefined} />

          <Card>
            <div className="between">
              <span className="dim">CoinCounter + bounce</span>
              <span className="fs22"><span className="d-coin-bounce">🪙</span> <CoinCounter value={coins} /></span>
            </div>
            <Button className="mt8" onClick={() => setCoins((c) => c + 350)}>+350 tanga (countup)</Button>
          </Card>

          <Card>
            <div className="row g8 wrap">
              <Button sm>brand</Button>
              <Button sm variant="ghost">ghost</Button>
              <Button sm variant="danger">danger</Button>
              <Button sm disabled={busy} pulseWhenEnabled>pulse-enable</Button>
              <Button sm variant="ghost" onClick={() => setBusy((b) => !b)}>{busy ? "yoq" : "o'chir"}</Button>
            </div>
            <div className="row g8 mt8 wrap">
              <Chip on>tanlangan</Chip>
              <Chip>chip</Chip>
              <TierBadge tier="Bronza" />
              <TierBadge tier="Kumush" />
              <TierBadge tier="Oltin" />
              <TierBadge tier="Olmos" />
              <StreakFlame days={7} lit />
            </div>
          </Card>

          <Card>
            <span className="dim fs13">ProgressBar (100% = oltin)</span>
            <ProgressBar className="mt6" value={64} />
            <ProgressBar className="mt6" value={100} />
            <div className="mt8"><Skeleton w="70%" /></div>
            <div className="mt6"><Skeleton w="45%" /></div>
          </Card>

          <Card sheen>
            <b>💎 Nodir buyum kartasi</b>
            <p className="dim fs13">sheen yorug'ligi o'tib turadi (WOW-4)</p>
          </Card>

          <Card>
            <LoadSection state={loadState} onRetry={() => setLoadState("ready")}>
              <p>✅ Ma'lumot yuklandi (LoadSection "ready")</p>
            </LoadSection>
            <div className="row g8 mt8">
              <Button sm variant="ghost" onClick={() => setLoadState("loading")}>loading</Button>
              <Button sm variant="ghost" onClick={() => setLoadState("error")}>error</Button>
            </div>
          </Card>

          <Card>
            <RouletteWheel prizes={DEMO_PRIZES} targetIndex={target} spinId={spinId} onDone={() => confetti()} />
            <Button onClick={() => { setTarget(Math.floor(Math.random() * DEMO_PRIZES.length)); setSpinId((n) => n + 1); }}>
              🎡 Demo-spin (bezier + tik-tik)
            </Button>
          </Card>

          <Card>
            <Button variant="ghost" onClick={() => setSheet(true)}>Sheet ochish (sudrab yoping)</Button>
          </Card>
          <EmptyState icon="🗂" text="EmptyState namunasi" action="Harakat" onAction={() => undefined} />
        </div>
      </main>
      <Sheet open={sheet} onClose={() => setSheet(false)}>
        <h3>Demo Sheet</h3>
        <p className="dim">Grip'dan pastga 80px suring — yopiladi. Fon blur (WOW-5).</p>
        <Button onClick={() => setSheet(false)}>Yopish</Button>
      </Sheet>
    </div>
  );
}
