// Minimal typings + bootstrap for the Telegram WebApp runtime.
interface TelegramWebApp {
  initData: string;
  colorScheme: "light" | "dark";
  themeParams: Record<string, string>;
  ready: () => void;
  expand: () => void;
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  openTelegramLink?: (url: string) => void;
  HapticFeedback?: { impactOccurred: (s: string) => void; selectionChanged: () => void; notificationOccurred?: (t: string) => void };
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

export const tg = window.Telegram?.WebApp;

export function initTelegram(): void {
  if (!tg) return;
  tg.ready();
  tg.expand();
  tg.setHeaderColor?.("#0b0f1a");
  tg.setBackgroundColor?.("#0b0f1a");
}

export function haptic(): void {
  tg?.HapticFeedback?.selectionChanged();
}

/** Stronger "you won" feedback — native success notification, falls back to a heavy tap. */
export function hapticSuccess(): void {
  const h = tg?.HapticFeedback;
  if (h?.notificationOccurred) h.notificationOccurred("success");
  else h?.impactOccurred("heavy");
}

// Single lazily-created AudioContext (browsers cap the count). Created on first
// use, which is always right after a user tap, so autoplay policy lets it run.
let _audioCtx: AudioContext | null = null;
function audioCtx(): AudioContext | null {
  try {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    if (!_audioCtx) _audioCtx = new Ctor();
    if (_audioCtx.state === "suspended") void _audioCtx.resume();
    return _audioCtx;
  } catch {
    return null;
  }
}

/**
 * Short celebratory fanfare for a tier-unlock — a rising major arpeggio, fully
 * synthesized (no .ogg asset / CDN dependency, so it ships anywhere). Degrades to
 * silence if Web Audio is blocked or unavailable. ~0.7s, deliberately gentle.
 */
export function playTierFanfare(): void {
  const ctx = audioCtx();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.value = 0.16; // keep it soft — a chime, not a blast
    master.connect(ctx.destination);
    // C5 · E5 · G5 · C6 — a clean major triad resolving up an octave
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, i) => {
      const t = now + i * 0.11;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "triangle"; // soft, bell-like
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(1, t + 0.02); // quick attack
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32); // gentle decay
      osc.connect(g);
      g.connect(master);
      osc.start(t);
      osc.stop(t + 0.34);
    });
  } catch {
    /* audio blocked — ceremony stays visual-only */
  }
}

// 🛠 P-Polish-Repair-1 — short synthesized sounds for the repair-bay flow.
// All reuse the singleton audioCtx (no extra AudioContext allocation). Tap-driven
// (user-initiated → autoplay policy passes). Silent if Web Audio blocked.

/** Repair success: ascending short chirp (~140ms). Used on every successful repairZone. */
export function playRepairChirp(): void {
  const ctx = audioCtx();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.18, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(660, now);
    osc.frequency.exponentialRampToValueAtTime(990, now + 0.12);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.16);
  } catch {
    /* silent */
  }
}

/** Tier-up ring (zone crosses 80 GOOD or 96 MINT): bright two-tone bell (~280ms). */
export function playTierUpRing(): void {
  const ctx = audioCtx();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.value = 0.15;
    master.connect(ctx.destination);
    [880, 1320].forEach((freq, i) => {
      const t = now + i * 0.08;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(1, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      osc.connect(g);
      g.connect(master);
      osc.start(t);
      osc.stop(t + 0.2);
    });
  } catch {
    /* silent */
  }
}

/** Repair failed (low quality / DEFECT): brief sawtooth thunk (~180ms). */
export function playRepairFail(): void {
  const ctx = audioCtx();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.15, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(140, now + 0.16);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.2);
  } catch {
    /* silent */
  }
}

/** Open Telegram's native "share to a chat" dialog with an invite link. */
export function shareLink(url: string, text: string): void {
  const share = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
  if (tg?.openTelegramLink) tg.openTelegramLink(share);
  else window.open(share, "_blank");
}

export async function copyText(s: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(s);
  } catch {
    /* clipboard blocked — no-op */
  }
}
