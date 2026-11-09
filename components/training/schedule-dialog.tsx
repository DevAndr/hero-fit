"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, CalendarClock, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePush } from "@/components/notifications/push-provider";
import { createTelegramLinkAction } from "@/lib/telegram/actions";
import type { TelegramStatus } from "@/lib/telegram/queries";
import { dismissScheduleAction, scheduleDraftAction } from "@/lib/workouts/schedule-actions";
import { slotError, type Slot } from "@/lib/workouts/schedule";
import { readNotificationPermission, subscribeErrorText } from "@/lib/notifications/subscribe-error";

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

/** «вторник, 10 ноября в 19:00» для строки выбранного времени. */
function slotLabel({ date, time }: Slot): string {
  const day = new Date(`${date}T12:00:00`).toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" });
  return `${day} в ${time}`;
}

/** Диалог первой тренировки: «Когда тренировка?» → «Как напомнить?». Закрытие шага 1 — «Начинаю сейчас», шага 2 — сохранить выбранное. */
export function ScheduleDialog({ ask }: { ask: ScheduleAsk }) {
  const router = useRouter();
  const push = usePush();
  const [open, setOpen] = useState(true);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [custom, setCustom] = useState(false);
  const [date, setDate] = useState(ask.presets.evening ? ask.today : ask.presets.tomorrow.date);
  const [customError, setCustomError] = useState<string | null>(null);
  const [time, setTime] = useState(DEFAULT_TIME);
  const [emailReminder, setEmailReminder] = useState(false);
  const [busy, setBusy] = useState(false);
  const [linking, setLinking] = useState(false);
  // Действие уходит на сервер один раз: повторный клик или закрытие во время ответа игнорируются
  const sent = useRef(false);

  // Привязка Telegram завершается в другой вкладке — при возврате подтягиваем статус
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [router]);

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

  const connectTelegram = () => {
    // Окно открываем сразу по клику — после await браузер счёл бы его всплывающим без действия пользователя
    const tab = window.open("", "_blank");
    setLinking(true);
    void (async () => {
      try {
        const result = await createTelegramLinkAction();
        if ("error" in result) {
          tab?.close();
          toast.error(result.error);
          return;
        }
        if (tab) tab.location.href = result.url;
        else window.location.href = result.url;
      } finally {
        setLinking(false);
      }
    })();
  };

  const enablePush = async () => {
    if (!push) return;
    if (await push.subscribe()) return;
    toast.error(subscribeErrorText({ native: push.native, nativeReason: push.nativeReason, permission: readNotificationPermission() }));
  };

  const showPushButton = Boolean(push?.supported && push.available && !push.subscribed);
  const tg = ask.telegram;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {slot ? (
          <div className="grid gap-4">
            <DialogHeader>
              <DialogTitle>Как напомнить?</DialogTitle>
              <DialogDescription>{slotLabel(slot)}</DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              {push?.subscribed ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Bell className="size-4 text-primary" />
                  Напомним push-уведомлением
                </p>
              ) : push?.supported && push.permission === "denied" ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Bell className="size-4" />
                  Push запрещён в настройках браузера
                </p>
              ) : showPushButton ? (
                <Button type="button" variant="outline" disabled={busy || push?.busy} onClick={() => void enablePush()}>
                  {push?.busy ? <Loader2 className="animate-spin" /> : <Bell />}
                  Включить push
                </Button>
              ) : null}
              {tg.enabled ? (
                tg.linked ? (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Send className="size-4 text-primary" />
                    Напомним в Telegram
                  </p>
                ) : (
                  <Button type="button" variant="outline" disabled={busy || linking} onClick={connectTelegram}>
                    {linking ? <Loader2 className="animate-spin" /> : <Send />}
                    Подключить Telegram
                  </Button>
                )
              ) : null}
              {ask.email ? (
                <Label className="flex items-center gap-2 font-normal">
                  <Checkbox checked={emailReminder} disabled={busy} onCheckedChange={(v) => setEmailReminder(v === true)} />
                  Напомнить на почту ({ask.email})
                </Label>
              ) : null}
            </div>
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
                <form
                  className="grid gap-2 rounded-lg border p-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!date || !time) return;
                    const error = slotError({ date, time }, new Date(), ask.timeZone);
                    setCustomError(error);
                    if (!error) choose({ date, time });
                  }}
                >
                  <div className="grid grid-cols-2 gap-2">
                    <div className="grid gap-1.5">
                      <Label htmlFor="schedule-date">Дата</Label>
                      <Input id="schedule-date" type="date" required min={ask.today} value={date} onChange={(e) => { setDate(e.target.value); setCustomError(null); }} />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor="schedule-time">Начало</Label>
                      <Input id="schedule-time" type="time" required step={900} value={time} onChange={(e) => { setTime(e.target.value); setCustomError(null); }} />
                    </div>
                  </div>
                  {customError ? (
                    <p role="alert" className="text-sm text-destructive">
                      {customError}
                    </p>
                  ) : null}
                  <Button type="submit" disabled={busy || !date || !time}>
                    Дальше
                  </Button>
                </form>
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
