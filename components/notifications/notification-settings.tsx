"use client";

import { useState, useTransition } from "react";
import { BellOff, BellRing, Loader2, Send, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { usePush } from "@/components/notifications/push-provider";
import { sendTestPushAction, updateNotificationSettingsAction } from "@/lib/notifications/actions";

type Prefs = { notifyRest: boolean; notifyStreak: boolean; notifyAchievements: boolean; notifySocial: boolean };

const PREFS: { key: keyof Prefs; label: string; description: string }[] = [
  { key: "notifyRest", label: "Таймер отдыха", description: "Сигнал об окончании отдыха, даже при заблокированном экране" },
  { key: "notifyStreak", label: "Не потеряй streak", description: "Напоминание, когда до конца серии остаётся 3 часа" },
  { key: "notifyAchievements", label: "Новые ачивки", description: "Push, когда получена ачивка" },
  { key: "notifySocial", label: "Друзья", description: "Заявки в друзья и их принятие" },
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

export function NotificationPrefs({ initial }: { initial: Prefs }) {
  const [prefs, setPrefs] = useState(initial);
  const [, startTransition] = useTransition();

  const toggle = (key: keyof Prefs, value: boolean) => {
    setPrefs((p) => ({ ...p, [key]: value }));
    startTransition(async () => {
      try {
        await updateNotificationSettingsAction({ [key]: value });
      } catch {
        setPrefs((p) => ({ ...p, [key]: !value }));
        toast.error("Не удалось сохранить настройку");
      }
    });
  };

  return (
    <section aria-label="Что присылать" className="space-y-4 rounded-xl border bg-card p-4">
      <h2 className="font-bold">Что присылать</h2>
      {PREFS.map(({ key, label, description }) => (
        <Field key={key} orientation="horizontal">
          <FieldContent>
            <FieldLabel htmlFor={`pref-${key}`}>{label}</FieldLabel>
            <FieldDescription>{description}</FieldDescription>
          </FieldContent>
          <Switch id={`pref-${key}`} checked={prefs[key]} onCheckedChange={(v) => toggle(key, v)} />
        </Field>
      ))}
    </section>
  );
}
