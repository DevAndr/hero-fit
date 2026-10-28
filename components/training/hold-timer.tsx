"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createTicker, signalTimerEnd } from "@/components/training/rest-timer";
import { holdState, type HoldRun } from "@/lib/stretching/hold";
import { formatClock } from "@/lib/workouts/kinds";
import { haptic } from "@/lib/telegram/webapp";

const SIDE_LABELS = { first: "Первая сторона", second: "Вторая сторона" } as const;

/**
 * Плашка отсчёта «Держать» под подходом растяжки. Отсчёт — только текст (без анимаций),
 * экранному диктору — раз в 5 с и на смене стороны. Конец — сигнал таймера отдыха и `onDone`.
 */
export function HoldTimer({
  run,
  title,
  onDone,
  onStop,
  onCancel,
}: {
  run: HoldRun;
  /** Название упражнения — для подписи и уведомления в фоне. */
  title: string;
  onDone: () => void;
  onStop: () => void;
  onCancel: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const state = holdState(run, now);
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  });

  useEffect(() => createTicker(() => setNow(Date.now())), []);

  useEffect(() => {
    if (!state.pausing) return;
    haptic("light");
    toast("Другая сторона", { id: "hold-side" });
  }, [state.pausing]);

  useEffect(() => {
    if (!state.done) return;
    signalTimerEnd("Растяжка: готово 🧘", title, "hero-fit-hold");
    onDoneRef.current();
  }, [state.done, title]);

  const side = run.phases[state.phase]?.side;
  const sideLabel = state.pausing ? "Пауза · дальше другая сторона" : side ? SIDE_LABELS[side] : "Держи";
  // Диктору — шагом 5 с, чтобы не тараторил каждую секунду
  const live = state.done ? "" : state.pausing ? "Другая сторона" : `${side ? `${SIDE_LABELS[side]}: ` : ""}осталось ${Math.ceil(state.leftSec / 5) * 5} с`;

  return (
    <div role="timer" aria-label={`Удержание: ${title}`} className="mx-2 my-1 flex items-center gap-3 rounded-xl border bg-popover p-3" data-testid="hold-timer">
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{sideLabel}</p>
        <p className="text-3xl font-black tabular-nums" data-testid="hold-remaining">
          {formatClock(state.leftSec)}
        </p>
        <p className="sr-only" aria-live="polite">
          {live}
        </p>
      </div>
      <Button size="sm" onClick={onStop}>
        Стоп
      </Button>
      <Button size="sm" variant="outline" onClick={onCancel}>
        Отмена
      </Button>
    </div>
  );
}
