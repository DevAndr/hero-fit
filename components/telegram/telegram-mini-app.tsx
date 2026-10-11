"use client";

import Script from "next/script";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { backTarget, isRootPath } from "@/lib/telegram/back";
import { themeForScheme, toHex } from "@/lib/telegram/theme";
import { tg, tgCall, tgSupports, type WebApp } from "@/lib/telegram/webapp";

const TelegramContext = createContext({ inTelegram: false });

/** Внутри Telegram Mini App (провайдер есть только у сессий из Mini App и SDK нашёл initData). */
export function useTelegram() {
  return useContext(TelegramContext);
}

/** Telegram спрашивает подтверждение перед закрытием, пока active (редактор активной тренировки). */
export function useClosingConfirmation(active: boolean) {
  const { inTelegram } = useTelegram();
  useEffect(() => {
    const app = tg();
    if (!inTelegram || !active || !app) return;
    tgCall(() => app.enableClosingConfirmation?.());
    return () => tgCall(() => app.disableClosingConfirmation?.());
  }, [inTelegram, active]);
}

/** Цвет фона страницы в #rrggbb (токены — oklch, его Telegram не понимает: переводим через canvas). */
function pageBackground(): string | null {
  const color = getComputedStyle(document.body).backgroundColor;
  const hex = toHex(color);
  if (hex) return hex;
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return toHex(`rgb(${r}, ${g}, ${b})`);
}

function applySafeArea(app: WebApp) {
  const safe = app.safeAreaInset;
  const content = app.contentSafeAreaInset;
  const root = document.documentElement.style;
  root.setProperty("--tg-safe-top", `${(safe?.top ?? 0) + (content?.top ?? 0)}px`);
  root.setProperty("--tg-safe-bottom", `${(safe?.bottom ?? 0) + (content?.bottom ?? 0)}px`);
}

/**
 * Кабинет внутри Telegram: SDK, запуск, тема по схеме Telegram (цвета — фирменные), системная «Назад»,
 * безопасные зоны. Подключается только для сессий из Mini App; без initData ничего не делает.
 */
export function TelegramMiniApp({ children }: { children: ReactNode }) {
  const [app, setApp] = useState<WebApp | null>(null);
  const { setTheme, resolvedTheme } = useTheme();
  const pathname = usePathname();
  const router = useRouter();

  const init = useCallback(() => {
    const found = tg();
    if (!found) return;
    tgCall(() => found.ready?.());
    tgCall(() => found.expand?.());
    if (tgSupports(found, "7.7")) tgCall(() => found.disableVerticalSwipes?.());
    setApp(found);
  }, []);

  // Тема — по схеме Telegram, и заново при её смене
  useEffect(() => {
    if (!app) return;
    const sync = () => setTheme(themeForScheme(app.colorScheme));
    sync();
    tgCall(() => app.onEvent?.("themeChanged", sync));
    return () => tgCall(() => app.offEvent?.("themeChanged", sync));
  }, [app, setTheme]);

  // Шапка, фон и нижняя панель Telegram — цветом страницы; класс темы next-themes ставит в своём эффекте позже
  useEffect(() => {
    if (!app) return;
    const frame = requestAnimationFrame(() => {
      const color = pageBackground();
      if (!color) return;
      tgCall(() => app.setHeaderColor?.(color));
      tgCall(() => app.setBackgroundColor?.(color));
      if (tgSupports(app, "7.10")) tgCall(() => app.setBottomBarColor?.(color));
    });
    return () => cancelAnimationFrame(frame);
  }, [app, resolvedTheme]);

  // Безопасные зоны → CSS-переменные для шапки и нижней панели
  useEffect(() => {
    if (!app || !tgSupports(app, "8.0")) return;
    const sync = () => applySafeArea(app);
    sync();
    tgCall(() => app.onEvent?.("safeAreaChanged", sync));
    tgCall(() => app.onEvent?.("contentSafeAreaChanged", sync));
    return () => {
      tgCall(() => app.offEvent?.("safeAreaChanged", sync));
      tgCall(() => app.offEvent?.("contentSafeAreaChanged", sync));
    };
  }, [app]);

  // Глубина истории приложения: переходы вперёд — +1, наш «Назад» — −1; первая страница — 0
  const depth = useRef(0);
  const goingBack = useRef(false);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    depth.current = goingBack.current ? Math.max(0, depth.current - 1) : depth.current + 1;
    goingBack.current = false;
  }, [pathname]);

  useEffect(() => {
    const button = app?.BackButton;
    if (!button) return;
    if (isRootPath(pathname)) {
      tgCall(() => button.hide());
      return;
    }
    const onBack = () => {
      if (depth.current > 0) {
        goingBack.current = true;
        router.back();
      } else router.push(backTarget(pathname) ?? "/dashboard");
    };
    tgCall(() => button.show());
    tgCall(() => button.onClick(onBack));
    return () => tgCall(() => button.offClick(onBack));
  }, [app, pathname, router]);

  return (
    <TelegramContext.Provider value={{ inTelegram: app !== null }}>
      <Script src="https://telegram.org/js/telegram-web-app.js" strategy="afterInteractive" onReady={init} />
      {children}
    </TelegramContext.Provider>
  );
}
