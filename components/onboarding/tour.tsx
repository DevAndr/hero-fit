"use client";

import { useCallback, useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FirstWorkout } from "@/components/onboarding/first-workout";
import { completeOnboardingAction } from "@/lib/onboarding/actions";
import type { OnboardingProgram } from "@/lib/onboarding/queries";
import { nextStep, prevStep, stepNumber, TOUR_STEPS, type TourStep, type TourTarget } from "@/lib/onboarding/tour";

const PAD = 8;
const GAP = 12;
const CARD_W = 360;
/** Ниже этой ширины карточка — снизу экрана, как bottom sheet. */
const SHEET_MAX = 640;
const HEADER = 72;
const SHADE = "color-mix(in oklch, var(--background) 75%, transparent)";

type Rect = { top: number; left: number; width: number; height: number };

/** Видимый элемент шага: у меню два варианта (ПК и телефон), берётся тот, что отрисован. */
function findTarget(target: TourTarget): HTMLElement | null {
  const els = Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="${target}"]`));
  return els.find((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }) ?? null;
}

const available = (s: TourStep) => !s.target || findTarget(s.target) !== null;

function reducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Прокрутить к элементу: на ПК — в центр, на телефоне — в верхнюю половину (карточка снизу). */
function scrollToTarget(el: HTMLElement) {
  if (getComputedStyle(el).position === "fixed") return;
  const r = el.getBoundingClientRect();
  const sheet = innerWidth < SHEET_MAX;
  const top = sheet ? scrollY + r.top - HEADER : scrollY + r.top - (innerHeight - r.height) / 2;
  window.scrollTo({ top: Math.max(0, top), behavior: reducedMotion() ? "auto" : "smooth" });
}

/** Положение карточки на ПК: под элементом, над ним или справа (высокое меню). */
function cardPosition(rect: Rect): React.CSSProperties {
  const left = Math.min(Math.max(rect.left, 16), innerWidth - CARD_W - 16);
  if (rect.height > innerHeight * 0.6) return { top: HEADER + 8, left: Math.min(rect.left + rect.width + GAP, innerWidth - CARD_W - 16) };
  const below = innerHeight - (rect.top + rect.height + PAD);
  if (below >= 260) return { top: rect.top + rect.height + PAD + GAP, left };
  return { bottom: innerHeight - rect.top + PAD + GAP, left };
}

/**
 * Экскурсия по дашборду (спека docs/superpowers/specs/2026-10-09-onboarding-tour-design.md).
 * Подсветка — «окно» с огромной тенью; клики по странице перехватывает прозрачный слой, прокрутка не блокируется.
 */
export function OnboardingTour({ programs }: { programs: OnboardingProgram[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [sheet, setSheet] = useState(false);
  const [closing, startTransition] = useTransition();
  const cardRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const textId = useId();

  const step = TOUR_STEPS[index];
  const last = index === TOUR_STEPS.length - 1;

  // Закрываемся только после ответа сервера: иначе быстрая перезагрузка обрывает запрос и экскурсия вернётся
  const finish = useCallback((reason: "done" | "skip", then?: () => void) => {
    startTransition(async () => {
      await completeOnboardingAction(reason);
      setOpen(false);
      then?.();
    });
  }, []);

  const goNext = useCallback(() => setIndex((i) => nextStep(i, available)), []);
  const goPrev = useCallback(() => setIndex((i) => prevStep(i, available)), []);

  // Элементы страницы есть только в браузере — экскурсия показывается после гидрации
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  // Шаг сменился: прокрутить к элементу и следить за ним при прокрутке и смене размера окна
  useEffect(() => {
    if (!open || !mounted) return;
    const el = step.target ? findTarget(step.target) : null;
    if (el) scrollToTarget(el);
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        setSheet(innerWidth < SHEET_MAX);
        const r = el?.getBoundingClientRect();
        setRect(r ? { top: r.top, left: r.left, width: r.width, height: r.height } : null);
      });
    };
    measure();
    addEventListener("scroll", measure, { passive: true });
    addEventListener("resize", measure);
    cardRef.current?.focus();
    return () => {
      cancelAnimationFrame(frame);
      removeEventListener("scroll", measure);
      removeEventListener("resize", measure);
    };
  }, [open, mounted, step]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (!closing) finish(last ? "done" : "skip");
      } else if (e.key === "ArrowRight" && !last) goNext();
      else if (e.key === "ArrowLeft") goPrev();
      else if (e.key === "Tab") {
        // Фокус не уходит из карточки
        const items = cardRef.current?.querySelectorAll<HTMLElement>("button:not([disabled]), a[href]");
        if (!items?.length) return;
        const first = items[0];
        const lastItem = items[items.length - 1];
        if (e.shiftKey && (document.activeElement === first || document.activeElement === cardRef.current)) {
          e.preventDefault();
          lastItem.focus();
        } else if (!e.shiftKey && document.activeElement === lastItem) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, last, closing, finish, goNext, goPrev]);

  if (!open || !mounted) return null;

  const { current, total } = stepNumber(index, available);
  const centered = !step.target || !rect;
  const cardStyle: React.CSSProperties | undefined = centered || sheet ? undefined : cardPosition(rect);

  return (
    <div className="fixed inset-0 z-[60]">
      {/* Слой-перехватчик кликов; без подсветки он же затемняет страницу */}
      <div className="absolute inset-0" style={centered ? { background: SHADE } : undefined} aria-hidden />
      {!centered ? (
        <div
          aria-hidden
          className="pointer-events-none fixed rounded-xl ring-2 ring-primary motion-safe:transition-all motion-safe:duration-200"
          style={{
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
            boxShadow: `0 0 0 9999px ${SHADE}`,
          }}
        />
      ) : null}

      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={textId}
        tabIndex={-1}
        style={cardStyle}
        className={
          centered
            ? "fixed inset-x-4 top-1/2 mx-auto max-w-md -translate-y-1/2 rounded-2xl border bg-card p-5 shadow-xl outline-none"
            : sheet
              ? "fixed inset-x-4 bottom-20 rounded-2xl border bg-card p-4 shadow-xl outline-none"
              : "fixed w-[360px] rounded-2xl border bg-card p-4 shadow-xl outline-none"
        }
      >
        <p className="text-xs font-semibold text-primary tabular-nums">
          {current} / {total}
        </p>
        <h2 id={titleId} className="mt-1 font-display text-lg font-extrabold">
          {step.title}
        </h2>
        <p id={textId} className="mt-1 text-sm text-muted-foreground">
          {step.text}
        </p>

        {last ? (
          <div className="mt-4">
            <FirstWorkout
              programs={programs}
              onLater={() => finish("done")}
              disabled={closing}
              onSelf={() => finish("done", () => router.push("/training"))}
            />
            <Button type="button" variant="link" className="mt-1 h-auto px-0 text-muted-foreground" onClick={goPrev}>
              Назад
            </Button>
          </div>
        ) : (
          <div className="mt-4 flex items-center justify-between gap-2">
            <Button type="button" variant="ghost" size="sm" disabled={closing} onClick={() => finish("skip")}>
              Пропустить
            </Button>
            <div className="flex gap-2">
              {index > 0 ? (
                <Button type="button" variant="outline" size="sm" onClick={goPrev}>
                  Назад
                </Button>
              ) : null}
              <Button type="button" size="sm" onClick={goNext}>
                {index === 0 ? "Поехали" : "Далее"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
