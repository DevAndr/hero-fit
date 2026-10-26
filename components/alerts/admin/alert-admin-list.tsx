"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { deleteAlertAction, toggleAlertAction } from "@/lib/alerts/admin-actions";
import type { AlertAudience, AlertDismiss, AlertKind, AlertTone } from "@/lib/alerts/rules";
import { cn } from "@/lib/utils";
import { TONE_ICON, TONE_TEXT } from "../alert-style";
import { AlertEditor, emptyDraft, toLocalInput, type AlertDraft } from "./alert-editor";

/** Строка списка: поля оповещения и готовое окно показа в поясе админа (считает сервер). */
export type AlertAdminItem = {
  id: string;
  kind: AlertKind;
  tone: AlertTone;
  title: string | null;
  body: string;
  ctaLabel: string | null;
  ctaHref: string | null;
  dismiss: AlertDismiss;
  audience: AlertAudience;
  startsAt: Date;
  endsAt: Date | null;
  enabled: boolean;
  window: string;
  dismissals: number;
};

const KIND_LABEL: Record<AlertKind, string> = { BANNER: "Строка", POPUP: "Попап" };
const TONE_LABEL: Record<AlertTone, string> = { INFO: "Инфо", WARNING: "Важно", CRITICAL: "Критично" };
/** «Всем» не подписываем — так было до выбора аудитории. */
const AUDIENCE_LABEL: Record<AlertAudience, string | null> = { ALL: null, USERS: "обычным пользователям", COACHES: "тренерам" };
const DISMISS_LABEL: Record<AlertDismiss, string> = { NEVER: "нельзя закрыть", SESSION: "закрывается до следующего захода", FOREVER: "закрывается навсегда" };

function draftOf(a: AlertAdminItem): AlertDraft {
  return {
    kind: a.kind,
    tone: a.tone,
    title: a.title ?? "",
    body: a.body,
    ctaLabel: a.ctaLabel ?? "",
    ctaHref: a.ctaHref ?? "",
    dismiss: a.dismiss,
    audience: a.audience,
    startsAt: toLocalInput(a.startsAt),
    endsAt: a.endsAt ? toLocalInput(a.endsAt) : "",
  };
}

/** Кнопка «Новое оповещение»; форма монтируется заново при каждом открытии — свежие поля и «сейчас». */
export function NewAlertButton() {
  const [open, setOpen] = useState(false);
  const [round, setRound] = useState(0);
  return (
    <>
      <Button
        onClick={() => {
          setRound((r) => r + 1);
          setOpen(true);
        }}
      >
        <Plus />
        Новое оповещение
      </Button>
      {open ? <AlertEditor key={round} id={null} initial={emptyDraft()} open onOpenChange={setOpen} /> : null}
    </>
  );
}

function AlertItem({ alert }: { alert: AlertAdminItem }) {
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const Icon = TONE_ICON[alert.tone];
  const run = (action: () => Promise<{ ok: true } | { ok: false; error: string }>) =>
    startTransition(async () => {
      const r = await action();
      if (!r.ok) toast.error(r.error);
    });
  const label = alert.title ?? alert.body;

  return (
    <li>
      <article aria-label={label} className="space-y-2 rounded-xl border bg-card p-4">
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Icon className={cn("size-3.5", TONE_TEXT[alert.tone])} aria-hidden />
              {KIND_LABEL[alert.kind]} · {TONE_LABEL[alert.tone]} · {DISMISS_LABEL[alert.dismiss]}
              {AUDIENCE_LABEL[alert.audience] ? ` · ${AUDIENCE_LABEL[alert.audience]}` : ""}
            </p>
            {alert.title ? <h3 className="font-bold">{alert.title}</h3> : null}
            <p className="text-sm break-words whitespace-pre-line">{alert.body}</p>
          </div>
          <label className="flex shrink-0 items-center gap-2 text-sm font-medium">
            Включено
            <Switch aria-label="Включено" checked={alert.enabled} disabled={pending} onCheckedChange={(v) => run(() => toggleAlertAction(alert.id, v))} />
          </label>
        </header>
        <footer className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>
            {alert.window} · Закрыли: {alert.dismissals}
          </span>
          <span className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              Изменить
            </Button>
            <AlertDialog>
              <AlertDialogTrigger render={<Button size="sm" variant="outline" disabled={pending} />}>Удалить</AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Удалить оповещение?</AlertDialogTitle>
                  <AlertDialogDescription>Оно пропадёт у всех, отметки «закрыто» тоже удалятся.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={pending}>Отмена</AlertDialogCancel>
                  <AlertDialogAction variant="destructive" disabled={pending} onClick={() => run(() => deleteAlertAction(alert.id))}>
                    Удалить
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </span>
        </footer>
      </article>
      {editing ? <AlertEditor id={alert.id} initial={draftOf(alert)} open onOpenChange={setEditing} /> : null}
    </li>
  );
}

export function AlertGroup({ title, alerts }: { title: string; alerts: AlertAdminItem[] }) {
  return (
    <section aria-label={title} className="space-y-2">
      <h2 className="font-bold">{title}</h2>
      {alerts.length ? (
        <ul className="space-y-2">
          {alerts.map((a) => (
            <AlertItem key={a.id} alert={a} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Нет</p>
      )}
    </section>
  );
}
