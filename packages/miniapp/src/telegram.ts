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
