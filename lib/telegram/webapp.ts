/** Используемая часть Telegram Web Apps SDK (telegram-web-app.js). */
export type Insets = { top: number; bottom: number; left: number; right: number };

export type WebApp = {
  initData: string;
  version?: string;
  colorScheme?: "light" | "dark";
  isVersionAtLeast?: (version: string) => boolean;
  ready?: () => void;
  expand?: () => void;
  disableVerticalSwipes?: () => void;
  enableClosingConfirmation?: () => void;
  disableClosingConfirmation?: () => void;
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  setBottomBarColor?: (color: string) => void;
  onEvent?: (event: string, cb: () => void) => void;
  offEvent?: (event: string, cb: () => void) => void;
  safeAreaInset?: Insets;
  contentSafeAreaInset?: Insets;
  BackButton?: { show(): void; hide(): void; onClick(cb: () => void): void; offClick(cb: () => void): void };
  HapticFeedback?: {
    impactOccurred(style: "light" | "medium" | "heavy" | "rigid" | "soft"): void;
    notificationOccurred(type: "error" | "success" | "warning"): void;
  };
};

/** SDK внутри Telegram; на сервере, без SDK или без initData (обычный браузер) — null. */
export function tg(): WebApp | null {
  if (typeof window === "undefined") return null;
  const app = (window as unknown as { Telegram?: { WebApp?: WebApp } }).Telegram?.WebApp;
  return app?.initData ? app : null;
}

/** Вызов SDK, который на старом клиенте может бросить, — ошибка не роняет приложение. */
export function tgCall(fn: () => void) {
  try {
    fn();
  } catch {
    /* метод недоступен в этой версии Telegram */
  }
}

export function tgSupports(app: WebApp, version: string) {
  try {
    return app.isVersionAtLeast?.(version) ?? false;
  } catch {
    return false;
  }
}

/** Вибрация Telegram; вне Telegram — ничего (прежняя navigator.vibrate остаётся у вызывающего). */
export function haptic(kind: "light" | "success" | "warning") {
  const feedback = tg()?.HapticFeedback;
  if (!feedback) return;
  tgCall(() => (kind === "light" ? feedback.impactOccurred("light") : feedback.notificationOccurred(kind)));
}
