"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { CalendarCheck, CalendarClock, Loader2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { CustomSlotForm, ReminderOptions, slotDay, slotLabel, useRefreshOnVisible } from "@/components/training/schedule-parts";
import type { TelegramStatus } from "@/lib/telegram/queries";
import { dismissNextAction, scheduleNextAction } from "@/lib/workouts/schedule-actions";
import type { Slot } from "@/lib/workouts/schedule";

export type NextAsk = {
  workoutId: string;
  presets: { tomorrow: Slot; dayAfter: Slot };
  /** Сегодняшняя дата пользователя (YYYY-MM-DD) — нижняя граница поля даты. */
  today: string;
  /** Пояс выбора (как в scheduleNextAction) — для проверки своего времени на клиенте. */
  timeZone: string;
  email: string | null;
  telegram: TelegramStatus;
  /** Нет ни push-подписки, ни Telegram — после выбора времени спросить «Как напомнить?». */
  askReminder: boolean;
};

type Step = { kind: "ask" } | { kind: "how"; slot: Slot } | { kind: "done"; slot: Slot } | { kind: "closed" };

/**
 * Карточка в сводке свежей тренировки: «Когда следующая тренировка?» → запись календаря (флаг next_workout_ask).
 * ask = null — уже ответили: после ответа страница перерисовывается без вопроса, а карточка держит подтверждение.
 */
export function NextWorkoutCard({ ask }: { ask: NextAsk | null }) {
  // Вопрос первого рендера: перерисовка после ответа приходит уже с ask = null
  const [question] = useState(ask);
  const [step, setStep] = useState<Step>({ kind: "ask" });
  const [custom, setCustom] = useState(false);
  const [emailReminder, setEmailReminder] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Ответ уходит на сервер один раз: повторный клик во время ответа игнорируется
  const sent = useRef(false);

  // Подключение Telegram на шаге «Как напомнить?» идёт в другой вкладке
  useRefreshOnVisible(step.kind === "how");

  if (!question || step.kind === "closed" || (!ask && step.kind !== "done")) return null;
  const q = question;

  const save = async (slot: Slot) => {
    if (sent.current) return;
    sent.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await scheduleNextAction({ workoutId: q.workoutId, ...slot, emailReminder });
      if (result.ok) {
        setStep({ kind: "done", slot });
        return;
      }
      setError(result.error);
      setStep({ kind: "ask" });
    } catch {
      setError("Не удалось сохранить, попробуйте позже");
    } finally {
      setBusy(false);
      sent.current = false;
    }
  };

  const choose = (slot: Slot) => {
    if (busy) return;
    if (q.askReminder) setStep({ kind: "how", slot });
    else void save(slot);
  };

  const dismiss = async () => {
    if (sent.current) return;
    sent.current = true;
    setBusy(true);
    try {
      await dismissNextAction(q.workoutId);
    } catch {
      // Не сохранилось — спросим в следующий раз; карточку всё равно убираем
    }
    setStep({ kind: "closed" });
  };

  return (
    <section aria-labelledby="next-workout-title" className="mt-4 rounded-xl border border-primary/40 bg-primary/5 p-4" data-testid="next-workout">
      {step.kind === "done" ? (
        <div className="grid gap-2">
          <h2 id="next-workout-title" className="flex items-center gap-2 font-bold">
            <CalendarCheck className="size-4 text-primary" />
            Запланировано: {slotDay(step.slot.date)}, {step.slot.time}
          </h2>
          <Link href="/calendar" className={buttonVariants({ variant: "outline", className: "justify-self-start" })}>
            Открыть календарь
          </Link>
        </div>
      ) : step.kind === "how" ? (
        <div className="grid gap-3">
          <div>
            <h2 id="next-workout-title" className="font-bold">
              Как напомнить?
            </h2>
            <p className="text-sm text-muted-foreground">{slotLabel(step.slot)}</p>
          </div>
          <ReminderOptions email={q.email} telegram={q.telegram} emailReminder={emailReminder} onEmailReminderChange={setEmailReminder} busy={busy} />
          <Button type="button" className="justify-self-start" disabled={busy} onClick={() => void save(step.slot)}>
            {busy ? <Loader2 className="animate-spin" /> : null}
            Готово
          </Button>
        </div>
      ) : (
        <div className="grid gap-3">
          <div>
            <h2 id="next-workout-title" className="flex items-center gap-2 font-bold">
              <CalendarClock className="size-4 text-primary" />
              Когда следующая тренировка?
            </h2>
            <p className="text-sm text-muted-foreground">Выберите день — напомним, и тренировка появится в календаре.</p>
          </div>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={busy} onClick={() => choose(q.presets.tomorrow)}>
              Завтра
            </Button>
            <Button type="button" variant="outline" disabled={busy} onClick={() => choose(q.presets.dayAfter)}>
              Послезавтра
            </Button>
            {custom ? null : (
              <Button type="button" variant="outline" disabled={busy} onClick={() => setCustom(true)}>
                Выбрать дату и время
              </Button>
            )}
            <Button type="button" variant="ghost" disabled={busy} onClick={() => void dismiss()}>
              Не сейчас
            </Button>
          </div>
          {custom ? (
            <CustomSlotForm
              today={q.today}
              timeZone={q.timeZone}
              defaultDate={q.presets.tomorrow.date}
              defaultTime={q.presets.tomorrow.time}
              busy={busy}
              onPick={choose}
            />
          ) : null}
        </div>
      )}
    </section>
  );
}
