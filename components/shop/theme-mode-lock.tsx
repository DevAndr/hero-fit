"use client";

import { useLayoutEffect } from "react";
import { useTheme } from "next-themes";

type Mode = "dark" | "light";

function apply(mode: Mode) {
  const root = document.documentElement;
  if (!root.classList.contains(mode) || root.classList.contains(mode === "dark" ? "light" : "dark")) {
    root.classList.remove("light", "dark");
    root.classList.add(mode);
  }
  if (root.style.colorScheme !== mode) root.style.colorScheme = mode;
}

/**
 * Режим надетого скина на <html>, пока скин надет: next-themes возвращает класс по выбору пользователя (смена системной
 * темы, схема Telegram) — ставим режим скина обратно. Выбор пользователя (localStorage) не трогаем: снял скин или ушёл
 * из кабинета — класс по resolvedTheme. Цвета скина верны и до эффекта (themeStyle пишет палитру в оба селектора).
 */
export function ThemeModeLock({ mode }: { mode: Mode }) {
  const { resolvedTheme } = useTheme();

  useLayoutEffect(() => {
    apply(mode);
    const observer = new MutationObserver(() => apply(mode));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style"] });
    return () => observer.disconnect();
  }, [mode]);

  // Отдельно от замка: при смене resolvedTheme замок не пересоздаётся, а при снятии — возвращаем режим пользователя
  useLayoutEffect(() => {
    return () => {
      const own: Mode = resolvedTheme === "light" ? "light" : "dark";
      const root = document.documentElement;
      root.classList.remove("light", "dark");
      root.classList.add(own);
      root.style.colorScheme = own;
    };
  }, [resolvedTheme]);

  return null;
}
