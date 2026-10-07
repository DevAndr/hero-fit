"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ReactNode } from "react";

/**
 * Скрипт next-themes нужен только из серверного HTML. На клиенте React 19 ругается на <script>
 * в компоненте («Encountered a script tag…») — там помечаем его неисполняемым типом
 * (он и так не выполнился бы; расхождение атрибута гасит suppressHydrationWarning у next-themes).
 */
const scriptProps = { type: typeof window === "undefined" ? "text/javascript" : "application/json" };

/** Тема хранится в localStorage (на устройство) и ставится классом на <html> до отрисовки — без вспышки. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      disableTransitionOnChange
      scriptProps={scriptProps}
    >
      {children}
    </NextThemesProvider>
  );
}
