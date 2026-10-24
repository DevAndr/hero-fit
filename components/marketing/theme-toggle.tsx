"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

const noopSubscribe = () => () => {};

/** Светлая ⇄ тёмная в шапке публичных страниц; выбор — тот же, что в /settings (localStorage, на устройство). */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  // Тема известна только в браузере — до гидрации кнопка без иконки и подписи темы
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const dark = resolvedTheme !== "light";
  const label = !mounted ? "Тема" : dark ? "Включить светлую тему" : "Включить тёмную тему";

  return (
    <Button variant="ghost" size="icon-lg" aria-label={label} title={label} onClick={() => setTheme(dark ? "light" : "dark")} disabled={!mounted}>
      {mounted ? dark ? <Sun aria-hidden /> : <Moon aria-hidden /> : null}
    </Button>
  );
}
