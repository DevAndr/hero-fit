"use client";

import { useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePush } from "@/components/notifications/push-provider";
import { createTelegramLinkAction } from "@/lib/telegram/actions";
import type { TelegramStatus } from "@/lib/telegram/queries";
import { slotError, type Slot } from "@/lib/workouts/schedule";
import { readNotificationPermission, subscribeErrorText } from "@/lib/notifications/subscribe-error";

/**
 * Общие части выбора времени тренировки: диалог «Когда тренировка?» (first_workout_reminder) и карточка
 * «Когда следующая тренировка?» в сводке (next_workout_ask).
 */

/** «вторник, 10 ноября» — день слота (дата без пояса: полдень не сдвигается ни в одном поясе браузера). */
export function slotDay(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" });
}

/** «вторник, 10 ноября в 19:00» для строки выбранного времени. */
export function slotLabel({ date, time }: Slot): string {
  return `${slotDay(date)} в ${time}`;
}

/** Привязка Telegram завершается в другой вкладке — при возврате подтягиваем статус. */
export function useRefreshOnVisible(enabled = true) {
  const router = useRouter();
  useEffect(() => {
    if (!enabled) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [router, enabled]);
}

/** Шаг «Как напомнить?»: push, Telegram и галочка «на почту» (→ PlanEntry.emailReminder). */
export function ReminderOptions({
  email,
  telegram: tg,
  emailReminder,
  onEmailReminderChange,
  busy,
}: {
  email: string | null;
  telegram: TelegramStatus;
  emailReminder: boolean;
  onEmailReminderChange: (on: boolean) => void;
  busy: boolean;
}) {
  const push = usePush();
  const [linking, setLinking] = useState(false);

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

  return (
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
          tg.notify ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Send className="size-4 text-primary" />
              Напомним в Telegram
            </p>
          ) : null
        ) : (
          <Button type="button" variant="outline" disabled={busy || linking} onClick={connectTelegram}>
            {linking ? <Loader2 className="animate-spin" /> : <Send />}
            Подключить Telegram
          </Button>
        )
      ) : null}
      {email ? (
        <Label className="flex items-center gap-2 font-normal">
          <Checkbox checked={emailReminder} disabled={busy} onCheckedChange={(v) => onEmailReminderChange(v === true)} />
          Напомнить на почту ({email})
        </Label>
      ) : null}
    </div>
  );
}

/** Своё время: поля даты и времени с проверкой слота (в будущем, не дальше 30 дней) в поясе пользователя. */
export function CustomSlotForm({
  today,
  timeZone,
  defaultDate,
  defaultTime,
  busy,
  onPick,
}: {
  /** Сегодняшняя дата пользователя (YYYY-MM-DD) — нижняя граница поля даты. */
  today: string;
  timeZone: string;
  defaultDate: string;
  defaultTime: string;
  busy: boolean;
  onPick: (slot: Slot) => void;
}) {
  const id = useId();
  const [date, setDate] = useState(defaultDate);
  const [time, setTime] = useState(defaultTime);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="grid gap-2 rounded-lg border p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!date || !time) return;
        const found = slotError({ date, time }, new Date(), timeZone);
        setError(found);
        if (!found) onPick({ date, time });
      }}
    >
      <div className="grid grid-cols-2 gap-2">
        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-date`}>Дата</Label>
          <Input id={`${id}-date`} type="date" required min={today} value={date} onChange={(e) => { setDate(e.target.value); setError(null); }} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-time`}>Начало</Label>
          <Input id={`${id}-time`} type="time" required step={900} value={time} onChange={(e) => { setTime(e.target.value); setError(null); }} />
        </div>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={busy || !date || !time}>
        Дальше
      </Button>
    </form>
  );
}
