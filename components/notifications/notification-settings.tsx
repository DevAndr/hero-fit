"use client";

import { useState, useTransition } from "react";
import { BellOff, BellRing, Loader2, Send, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { useFlag } from "@/components/flags/flags-provider";
import { usePush } from "@/components/notifications/push-provider";
import { sendTestPushAction, updateNotificationSettingsAction } from "@/lib/notifications/actions";
import { PLAN_REMINDER_LEADS } from "@/lib/plans/reminders";

type Prefs = {
  notifyRest: boolean;
  notifyStreak: boolean;
  notifyAchievements: boolean;
  notifySocial: boolean;
  notifyPlan: boolean;
  notifyRecap: boolean;
  notifyCoachRecap: boolean;
  notifyGoal: boolean;
  notifyComeback: boolean;
  planReminderMin: number;
};
type Toggle = Exclude<keyof Prefs, "planReminderMin">;

const PREFS: { key: Toggle; label: string; description: string; coachOnly?: boolean; flag?: "campaigns" }[] = [
  { key: "notifyRest", label: "Таймер отдыха", description: "Сигнал об окончании отдыха, даже при заблокированном экране" },
  { key: "notifyStreak", label: "Не потеряй streak", description: "Когда тренировок не хватает, чтобы засчитать неделю (с пятницы)" },
  { key: "notifyPlan", label: "Тренировка по плану", description: "Напоминание перед тренировкой из календаря" },
  { key: "notifyRecap", label: "Итоги недели — в понедельник утром", description: "Место в лиге, прирост и лучший подход за прошлую неделю" },
  { key: "notifyCoachRecap", label: "Итоги недели клиентов — в понедельник утром", description: "Сводка по всем клиентам за прошлую неделю", coachOnly: true },
  { key: "notifyGoal", label: "Цели — выполнение и сроки", description: "Цель достигнута, неделя до срока, срок вышел" },
  { key: "notifyAchievements", label: "Новые ачивки", description: "Push, когда получена ачивка" },
  { key: "notifySocial", label: "Друзья", description: "Заявки в друзья и их принятие" },
  { key: "notifyComeback", label: "Напоминания вернуться", description: "Если давно не заходили или не тренировались", flag: "campaigns" },
];

/** Почему не удалось подписаться — самые частые причины. */
export function subscribeError() {
  return Notification.permission === "denied"
    ? "Разрешение на уведомления не выдано — включите его в настройках сайта"
    : "Не удалось включить push. В режиме инкогнито браузеры его не поддерживают.";
}

export function PushDeviceCard({ devices }: { devices: number }) {
  const push = usePush();
  const [testing, startTest] = useTransition();

  let status: string;
  if (!push?.supported)
    status =
      "Этот браузер не поддерживает push. На iPhone откройте приложение через «Поделиться → На экран «Домой»» — тогда push заработает.";
  else if (!push.available) status = "Push не настроен на сервере (нет VAPID-ключей).";
  else if (push.permission === "denied") status = "Уведомления запрещены в настройках браузера для этого сайта.";
  else if (push.subscribed) status = "Push включён на этом устройстве.";
  else status = "Push на этом устройстве выключен.";

  return (
    <section aria-label="Push на этом устройстве" className="space-y-3 rounded-xl border bg-card p-4">
      <h2 className="flex items-center gap-2 font-bold">
        <Smartphone className="size-4 text-primary" />
        Push на этом устройстве
      </h2>
      <p className="text-sm text-muted-foreground" data-testid="push-status">
        {status}
      </p>
      <p className="text-xs text-muted-foreground">Устройств с push на аккаунте: {devices}</p>
      {push?.supported && push.available ? (
        <div className="flex flex-wrap gap-2">
          {push.subscribed ? (
            <Button variant="outline" disabled={push.busy} onClick={() => push.unsubscribe()}>
              <BellOff />
              Выключить на этом устройстве
            </Button>
          ) : (
            <Button
              disabled={push.busy || !push.ready || push.permission === "denied"}
              onClick={async () => {
                if (await push.subscribe()) toast.success("Push включён");
                else toast.error(subscribeError());
              }}
            >
              {push.busy ? <Loader2 className="animate-spin" /> : <BellRing />}
              Включить push
            </Button>
          )}
          <Button
            variant="ghost"
            disabled={testing || !push.subscribed}
            onClick={() =>
              startTest(async () => {
                const result = await sendTestPushAction();
                if (result.ok) toast.success("Тестовое уведомление отправлено");
                else toast.error(result.error);
              })
            }
          >
            <Send />
            Отправить тестовое
          </Button>
        </div>
      ) : null}
    </section>
  );
}

export function NotificationPrefs({ initial, isCoach }: { initial: Prefs; isCoach: boolean }) {
  const campaigns = useFlag("campaigns");
  const [prefs, setPrefs] = useState(initial);
  const [, startTransition] = useTransition();

  const save = <K extends keyof Prefs>(key: K, value: Prefs[K]) => {
    const previous = prefs[key];
    setPrefs((p) => ({ ...p, [key]: value }));
    startTransition(async () => {
      try {
        await updateNotificationSettingsAction({ [key]: value });
      } catch {
        setPrefs((p) => ({ ...p, [key]: previous }));
        toast.error("Не удалось сохранить настройку");
      }
    });
  };

  return (
    <section aria-label="Что присылать" className="space-y-4 rounded-xl border bg-card p-4">
      <h2 className="font-bold">Что присылать</h2>
      {PREFS.filter((p) => (isCoach || !p.coachOnly) && (!p.flag || campaigns)).map(({ key, label, description }) => (
        <Field key={key} orientation="horizontal">
          <FieldContent>
            <FieldLabel htmlFor={`pref-${key}`}>{label}</FieldLabel>
            <FieldDescription>{description}</FieldDescription>
          </FieldContent>
          <Switch id={`pref-${key}`} checked={prefs[key]} onCheckedChange={(v) => save(key, v)} />
        </Field>
      ))}
      {prefs.notifyPlan ? (
        <Field orientation="horizontal">
          <FieldContent>
            <FieldLabel htmlFor="pref-plan-lead">Напоминать за</FieldLabel>
            <FieldDescription>Сколько минут до начала тренировки по плану</FieldDescription>
          </FieldContent>
          <select
            id="pref-plan-lead"
            value={prefs.planReminderMin}
            onChange={(e) => save("planReminderMin", Number(e.target.value))}
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
          >
            {PLAN_REMINDER_LEADS.map((m) => (
              <option key={m} value={m}>
                {m < 60 ? `${m} мин` : `${m / 60} ч`}
              </option>
            ))}
          </select>
        </Field>
      ) : null}
    </section>
  );
}
