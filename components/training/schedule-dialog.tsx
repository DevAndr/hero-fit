"use client";

import { useRef, useState } from "react";
import { CalendarClock, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CustomSlotForm, ReminderOptions, slotLabel, useRefreshOnVisible } from "@/components/training/schedule-parts";
import type { TelegramStatus } from "@/lib/telegram/queries";
import { dismissScheduleAction, scheduleDraftAction } from "@/lib/workouts/schedule-actions";
import type { Slot } from "@/lib/workouts/schedule";

export type ScheduleAsk = {
  workoutId: string;
  presets: { evening: Slot | null; tomorrow: Slot };
  /** Сегодняшняя дата пользователя (YYYY-MM-DD) — нижняя граница поля даты. */
  today: string;
  /** Пояс пользователя — для проверки своего времени на клиенте. */
  timeZone: string;
  email: string | null;
  telegram: TelegramStatus;
};

const DEFAULT_TIME = "19:00";

/** Диалог первой тренировки: «Когда тренировка?» → «Как напомнить?». Закрытие шага 1 — «Начинаю сейчас», шага 2 — сохранить выбранное. */
export function ScheduleDialog({ ask }: { ask: ScheduleAsk }) {
  const [open, setOpen] = useState(true);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [custom, setCustom] = useState(false);
  const [emailReminder, setEmailReminder] = useState(false);
  const [busy, setBusy] = useState(false);
  // Действие уходит на сервер один раз: повторный клик или закрытие во время ответа игнорируются
  const sent = useRef(false);

  useRefreshOnVisible();

  const run = async (action: () => Promise<{ ok: true } | { ok: false; error: string } | void>) => {
    if (sent.current) return;
    sent.current = true;
    setBusy(true);
    try {
      const result = await action();
      if (result && !result.ok) toast.error(result.error);
    } catch {
      toast.error("Не удалось сохранить, попробуйте позже");
    } finally {
      setOpen(false);
    }
  };

  const dismiss = () => run(() => dismissScheduleAction(ask.workoutId));
  const save = (chosen: Slot) => run(() => scheduleDraftAction({ workoutId: ask.workoutId, ...chosen, emailReminder }));

  const onOpenChange = (next: boolean) => {
    if (next) return;
    if (slot) void save(slot);
    else void dismiss();
  };

  const choose = (chosen: Slot) => {
    if (!busy) setSlot(chosen);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {slot ? (
          <div className="grid gap-4">
            <DialogHeader>
              <DialogTitle>Как напомнить?</DialogTitle>
              <DialogDescription>{slotLabel(slot)}</DialogDescription>
            </DialogHeader>
            <ReminderOptions
              email={ask.email}
              telegram={ask.telegram}
              emailReminder={emailReminder}
              onEmailReminderChange={setEmailReminder}
              busy={busy}
            />
            <DialogFooter>
              <Button type="button" disabled={busy} onClick={() => void save(slot)}>
                {busy ? <Loader2 className="animate-spin" /> : null}
                Готово
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="grid gap-4">
            <DialogHeader>
              <DialogTitle>Когда тренировка?</DialogTitle>
              <DialogDescription>Назначьте время — напомним, и тренировка появится в календаре.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              <Button type="button" disabled={busy} onClick={() => void dismiss()}>
                {busy ? <Loader2 className="animate-spin" /> : null}
                Начинаю сейчас
              </Button>
              {ask.presets.evening ? (
                <Button type="button" variant="outline" disabled={busy} onClick={() => choose(ask.presets.evening!)}>
                  Сегодня вечером
                </Button>
              ) : null}
              <Button type="button" variant="outline" disabled={busy} onClick={() => choose(ask.presets.tomorrow)}>
                Завтра
              </Button>
              {custom ? (
                <CustomSlotForm
                  today={ask.today}
                  timeZone={ask.timeZone}
                  defaultDate={ask.presets.evening ? ask.today : ask.presets.tomorrow.date}
                  defaultTime={DEFAULT_TIME}
                  busy={busy}
                  onPick={choose}
                />
              ) : (
                <Button type="button" variant="outline" disabled={busy} onClick={() => setCustom(true)}>
                  <CalendarClock />
                  Выбрать дату и время
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
