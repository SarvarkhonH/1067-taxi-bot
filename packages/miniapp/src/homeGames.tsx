// 🎡🔥 O'yin tabidagi "Omad g'ildiragi" + strik-kartani ikkala uy ekraniga ham (Uy va LivingHome)
// pastga skrol qilib ochiladigan qilib qo'shamiz — odamlar tab almashtirmasdan o'ynasin.
// Lazy: uy tabi yengil qolishi uchun rewards.tsx bundle'i faqat shu qismga yetganda yuklanadi
// (O'yin tabidagi kabi Suspense+Spinner).
import { lazy, Suspense, useRef, useState } from "react";
import type { MeResponse } from "@t1067/shared";
import { Spinner } from "./components";

const SpinWheelGame = lazy(() => import("./rewards").then((m) => ({ default: m.SpinWheelGame })));
const BonusCenter = lazy(() => import("./rewards").then((m) => ({ default: m.BonusCenter })));
const WinBurst = lazy(() => import("./rewards").then((m) => ({ default: m.WinBurst })));

export function HomeGames({ me, onBanner }: { me: MeResponse; onBanner?: (msg: string) => void }) {
  const [win, setWin] = useState<{ amount: number; emoji: string; label?: string; key: number } | null>(null);
  const winKeyRef = useRef(0);
  const celebrate = (amount: number, emoji: string, label?: string) => {
    if (amount <= 0) {
      onBanner?.(`${emoji} ${label ?? ""}`.trim());
      return;
    }
    winKeyRef.current += 1;
    setWin({ amount, emoji, label, key: winKeyRef.current });
  };

  return (
    <>
      <Suspense fallback={<Spinner />}>
        <BonusCenter me={me} onReward={(msg) => onBanner?.(msg)} celebrate={celebrate} />
        <SpinWheelGame me={me} onReward={(msg) => onBanner?.(msg)} celebrate={celebrate} />
      </Suspense>
      {win ? (
        <Suspense fallback={null}>
          <WinBurst key={win.key} amount={win.amount} emoji={win.emoji} label={win.label} onDone={() => setWin(null)} />
        </Suspense>
      ) : null}
    </>
  );
}
