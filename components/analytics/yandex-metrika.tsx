"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { GOAL_COOKIE, parseGoals } from "@/lib/analytics/goals";

type Ym = ((...args: unknown[]) => void) & { a?: unknown[][]; l?: number };

declare global {
  interface Window {
    ym?: Ym;
  }
}

function readCookie(name: string) {
  return document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

/**
 * Яндекс.Метрика. Хиты — вручную на каждый переход (SPA), init с defer.
 * Вебвизор маскирует текст кабинета (`ym-hide-content` в AppShell): веса и ники не записываются.
 */
export function YandexMetrika({ id }: { id: number }) {
  const pathname = usePathname();
  const referer = useRef<string | null>(null);

  useEffect(() => {
    if (window.ym) return;
    const stub: Ym = (...args) => {
      (stub.a ||= []).push(args);
    };
    stub.l = Date.now();
    window.ym = stub;
    const script = document.createElement("script");
    script.async = true;
    script.src = `https://mc.yandex.ru/metrika/tag.js?id=${id}`;
    document.head.appendChild(script);
    window.ym(id, "init", { defer: true, clickmap: true, trackLinks: true, accurateTrackBounce: true, webvisor: true });
  }, [id]);

  useEffect(() => {
    const url = location.href;
    window.ym?.(id, "hit", url, referer.current ? { referer: referer.current } : undefined);
    referer.current = url;
    // Цели, поставленные сервером (регистрация, тренировка) — отправить и забыть
    const goals = parseGoals(readCookie(GOAL_COOKIE));
    if (goals.length) {
      for (const goal of goals) window.ym?.(id, "reachGoal", goal);
      document.cookie = `${GOAL_COOKIE}=; Max-Age=0; path=/; SameSite=Lax`;
    }
  }, [id, pathname]);

  return <CookieNotice />;
}

const NOTICE_KEY = "hf:cookies-ok";

function CookieNotice() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // localStorage есть только в браузере — решение после гидрации
    let ok = false;
    try {
      ok = localStorage.getItem(NOTICE_KEY) === "1";
    } catch {
      // приватный режим — покажем
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!ok) setShow(true);
  }, []);

  if (!show) return null;

  function accept() {
    try {
      localStorage.setItem(NOTICE_KEY, "1");
    } catch {
      // не сохранилось — покажется в следующий раз
    }
    setShow(false);
  }

  return (
    <div
      role="region"
      aria-label="Уведомление о cookies"
      className="fixed inset-x-4 bottom-20 z-50 lg:bottom-4 mx-auto flex max-w-xl flex-col gap-3 rounded-2xl border bg-card p-4 text-sm shadow-lg sm:flex-row sm:items-center"
    >
      <p className="text-muted-foreground">
        Мы используем cookies и Яндекс.Метрику, чтобы понимать, что улучшить в сервисе. Подробнее —{" "}
        <Link href="/privacy" className="text-foreground underline underline-offset-4">
          в политике конфиденциальности
        </Link>
        .
      </p>
      <Button size="sm" className="shrink-0" onClick={accept}>
        Понятно
      </Button>
    </div>
  );
}
