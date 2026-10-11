import type { Page } from "@playwright/test";
import { signInitData } from "../lib/telegram/init-data";

/** Токен бота e2e-сервера (playwright.config.ts) — им подписан initData заглушки. */
export const E2E_BOT_TOKEN = "e2e-token";

export function e2eInitData({ id, firstName, startParam }: { id: string; firstName: string; startParam?: string }) {
  return signInitData(
    {
      auth_date: String(Math.floor(Date.now() / 1000)),
      query_id: "e2e",
      user: JSON.stringify({ id: Number(id), first_name: firstName, username: `u${id}` }),
      ...(startParam ? { start_param: startParam } : {}),
    },
    E2E_BOT_TOKEN,
  );
}

/**
 * Подменяет telegram-web-app.js: window.Telegram.WebApp с initData, подписанным e2e-токеном.
 * Без опций — пустой скрипт (как /tg в обычном браузере); tamper — испорченная подпись.
 */
export async function mockTelegram(
  page: Page,
  opts?: {
    id: string;
    firstName: string;
    startParam?: string;
    tamper?: boolean;
    colorScheme?: "light" | "dark";
    version?: string;
    /** Нижняя безопасная зона Telegram (полоска «домой» на iPhone), px. */
    safeBottom?: number;
  },
) {
  let initData = opts ? e2eInitData(opts) : "";
  if (opts?.tamper) initData = initData.replace(/hash=[0-9a-f]{4}/, "hash=0000");
  const body = opts
    ? `(${stubWebApp.toString()})(${JSON.stringify({ initData, colorScheme: opts.colorScheme ?? "dark", version: opts.version ?? "8.0", safeBottom: opts.safeBottom ?? 0 })});`
    : "";
  await page.route("https://telegram.org/js/telegram-web-app.js*", (route) =>
    route.fulfill({ contentType: "application/javascript", body }),
  );
}

type Stub = { __tgCalls: unknown[][]; __tgEmit: (event: string, patch?: object) => void; __tgBack: () => void };

/** Заглушка SDK в браузере: каждый вызов — в window.__tgCalls, события и «Назад» — через __tgEmit/__tgBack. */
function stubWebApp({ initData, colorScheme, version, safeBottom }: { initData: string; colorScheme: string; version: string; safeBottom: number }) {
  const w = window as unknown as Stub & { Telegram: unknown };
  const calls: unknown[][] = (w.__tgCalls = []);
  const handlers: Record<string, Array<() => void>> = {};
  let back: Array<() => void> = [];
  const log =
    (name: string) =>
    (...args: unknown[]) => {
      calls.push([name, ...args]);
    };
  const num = (v: string) => v.split(".").map(Number);
  const app = {
    initData,
    version,
    colorScheme,
    safeAreaInset: { top: 0, bottom: safeBottom, left: 0, right: 0 },
    contentSafeAreaInset: { top: 0, bottom: 0, left: 0, right: 0 },
    isVersionAtLeast(v: string) {
      const [a, b] = num(version);
      const [c, d] = num(v);
      return a > c || (a === c && (b ?? 0) >= (d ?? 0));
    },
    ready: log("ready"),
    expand: log("expand"),
    requestWriteAccess(cb?: (ok: boolean) => void) {
      if (cb) cb(true);
    },
    disableVerticalSwipes: log("disableVerticalSwipes"),
    enableClosingConfirmation: log("enableClosingConfirmation"),
    disableClosingConfirmation: log("disableClosingConfirmation"),
    setHeaderColor: log("setHeaderColor"),
    setBackgroundColor: log("setBackgroundColor"),
    setBottomBarColor: log("setBottomBarColor"),
    onEvent(event: string, cb: () => void) {
      (handlers[event] ??= []).push(cb);
    },
    offEvent(event: string, cb: () => void) {
      handlers[event] = (handlers[event] ?? []).filter((h) => h !== cb);
    },
    BackButton: {
      show: log("BackButton.show"),
      hide: log("BackButton.hide"),
      onClick(cb: () => void) {
        back.push(cb);
      },
      offClick(cb: () => void) {
        back = back.filter((h) => h !== cb);
      },
    },
    HapticFeedback: { impactOccurred: log("impactOccurred"), notificationOccurred: log("notificationOccurred") },
  };
  w.Telegram = { WebApp: app };
  w.__tgEmit = (event, patch) => {
    Object.assign(app, patch);
    for (const h of handlers[event] ?? []) h();
  };
  w.__tgBack = () => {
    for (const h of back) h();
  };
}

/** Вызовы SDK на текущей странице: [метод, ...аргументы]. */
export const tgCalls = (page: Page) => page.evaluate(() => (window as unknown as Stub).__tgCalls ?? []);
export const tgEmit = (page: Page, event: string, patch?: object) =>
  page.evaluate(([e, p]) => (window as unknown as Stub).__tgEmit(e as string, p as object | undefined), [event, patch] as const);
export const tgBack = (page: Page) => page.evaluate(() => (window as unknown as Stub).__tgBack());
