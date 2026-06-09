// Minimal typings + bootstrap for the Telegram WebApp runtime.
interface TelegramWebApp {
  initData: string;
  colorScheme: "light" | "dark";
  themeParams: Record<string, string>;
  ready: () => void;
  expand: () => void;
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  HapticFeedback?: { impactOccurred: (s: string) => void; selectionChanged: () => void };
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
