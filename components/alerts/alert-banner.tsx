"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AlertView } from "@/lib/alerts/rules";
import { cn } from "@/lib/utils";
import { AlertCta, TONE_BANNER, TONE_ICON } from "./alert-style";

/** Ширина текста одной строкой (у строчного элемента scrollWidth нет — меряем Range). */
function textWidth(el: HTMLElement): number {
  const range = document.createRange();
  range.selectNodeContents(el);
  return range.getBoundingClientRect().width;
}

/**
 * Бегущая строка над шапкой. Короткий текст стоит; не влезающий — прокручивается (пауза при наведении и фокусе,
 * при «уменьшить движение» — многоточие), нажатие раскрывает целиком. Без onDismiss — превью: кнопки ничего не делают.
 */
export function AlertBanner({ alert, onDismiss }: { alert: AlertView; onDismiss?: () => void }) {
  const Icon = TONE_ICON[alert.tone];
  const host = useRef<HTMLDivElement>(null);
  const copy = useRef<HTMLSpanElement>(null);
  const [overflow, setOverflow] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useLayoutEffect(() => {
    const h = host.current;
    if (!h) return;
    const measure = () => {
      if (copy.current) setOverflow(textWidth(copy.current) > h.clientWidth + 1);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(h);
    return () => ro.disconnect();
  }, [alert.body]);

  // Медленно: ~8 символов в секунду, но не быстрее 12 с на круг
  const duration = `${Math.max(12, Math.round(alert.body.length / 8))}s`;
  const dismissable = alert.dismiss !== "NEVER";

  return (
    <div role="region" aria-label="Оповещение" className={cn("flex items-center gap-2 border-b px-4 py-1.5 text-sm", TONE_BANNER[alert.tone])}>
      <Icon data-icon className="size-4 shrink-0" aria-hidden />
      <div ref={host} className="alert-marquee-host min-w-0 flex-1 overflow-hidden">
        {expanded ? (
          <button type="button" aria-expanded className="w-full text-left whitespace-pre-line" onClick={() => setExpanded(false)}>
            {alert.body}
          </button>
        ) : overflow ? (
          <button
            type="button"
            aria-expanded={false}
            className="block w-full overflow-hidden text-left whitespace-nowrap"
            style={{ "--alert-marquee-duration": duration } as React.CSSProperties}
            onClick={() => setExpanded(true)}
          >
            <span className="alert-marquee">
              <span ref={copy}>{alert.body}</span>
              <span data-copy aria-hidden>
                {alert.body}
              </span>
            </span>
          </button>
        ) : (
          <span ref={copy} className="whitespace-nowrap">
            {alert.body}
          </span>
        )}
      </div>
      <AlertCta alert={alert} onClick={dismissable ? onDismiss : undefined} />
      {dismissable ? (
        <Button variant="ghost" size="icon-xs" aria-label="Закрыть оповещение" onClick={onDismiss}>
          <X />
        </Button>
      ) : null}
    </div>
  );
}
