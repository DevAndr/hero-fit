"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { navigationTarget } from "@/lib/navigation/progress";

/** Дольше перехода не бывает: полоска не должна висеть, если навигацию что-то отменило. */
const GIVE_UP_MS = 15_000;

/**
 * Тонкая полоска сверху, пока сервер готовит следующую страницу: клик по ссылке откликается сразу.
 * Ловит клики по любым внутренним ссылкам (фаза захвата — до того, как Link отменит переход браузера),
 * гаснет при смене адреса. Появляется с задержкой, чтобы быстрые переходы не мигали.
 */
export function NavigationProgress() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const here = search ? `${pathname}?${search}` : pathname;
  // Откуда ушли: полоска видна, пока адрес тот же (сменился — переход состоялся или редирект увёл в другое место)
  const [pending, setPending] = useState<string | null>(null);
  const hereRef = useRef(here);
  useEffect(() => {
    hereRef.current = here;
  }, [here]);
  // Ушли с адреса клика — забываем его, чтобы возврат «назад» не зажёг полоску снова
  if (pending !== null && pending !== here) setPending(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const anchor = e.target instanceof Element ? e.target.closest("a[href]") : null;
      if (!(anchor instanceof HTMLAnchorElement)) return;
      const to = navigationTarget(
        { href: anchor.href, target: anchor.target, download: anchor.hasAttribute("download") },
        e,
        new URL(window.location.href),
      );
      if (to) setPending(hereRef.current);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(() => setPending(null), GIVE_UP_MS);
    return () => clearTimeout(timer);
  }, [pending]);

  if (pending !== here) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5" aria-hidden data-testid="nav-progress">
      <div className="nav-progress h-full bg-primary" />
    </div>
  );
}
