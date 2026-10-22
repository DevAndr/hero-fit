"use client";

import { useActionState, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { selectOnFocus } from "@/components/ui/select-on-focus";
import { saveCampaignAction, type SaveState } from "@/lib/campaigns/admin-actions";
import { BODY_MAX, NAME_MAX, TITLE_MAX } from "@/lib/campaigns/schema";

export type CampaignDraft = {
  id: string | null;
  name: string;
  condition: "INACTIVE" | "NO_WORKOUT" | "NEVER_TRAINED" | "STREAK_LOST";
  days: number | null;
  title: string;
  body: string;
  url: string;
  push: boolean;
  telegram: boolean;
  hour: number;
};

export const EMPTY_DRAFT: CampaignDraft = {
  id: null,
  name: "",
  condition: "INACTIVE",
  days: 3,
  title: "",
  body: "",
  url: "/training",
  push: true,
  telegram: true,
  hour: 18,
};

const CONDITIONS: { value: CampaignDraft["condition"]; label: string; daysLabel: string | null }[] = [
  { value: "INACTIVE", label: "Не заходил", daysLabel: "Дней без захода" },
  { value: "NO_WORKOUT", label: "Не тренировался", daysLabel: "Дней без тренировки" },
  { value: "NEVER_TRAINED", label: "Зарегистрировался и не тренировался", daysLabel: "Дней с регистрации" },
  { value: "STREAK_LOST", label: "Серия сгорела", daysLabel: null },
];

function Err({ text }: { text?: string }) {
  return text ? (
    <p role="alert" className="text-sm text-destructive">
      {text}
    </p>
  ) : null;
}

/** Форма рассылки и предпросмотр карточки уведомления. */
export function CampaignForm({ initial }: { initial: CampaignDraft }) {
  const [state, formAction] = useActionState<SaveState, FormData>(saveCampaignAction, null);
  const [pending, startTransition] = useTransition();
  const [d, setD] = useState(initial);
  const set = <K extends keyof CampaignDraft>(key: K, value: CampaignDraft[K]) => setD((v) => ({ ...v, [key]: value }));
  const daysLabel = CONDITIONS.find((c) => c.value === d.condition)?.daysLabel ?? null;
  const fe = state?.fieldErrors ?? {};

  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_18rem]">
      <form
        className="space-y-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          // Без автосброса формы: после ошибки введённое остаётся
          startTransition(() => formAction(data));
        }}
      >
        {d.id ? <input type="hidden" name="id" value={d.id} /> : null}
        <div className="space-y-1.5">
          <Label htmlFor="c-name">Название</Label>
          <Input id="c-name" name="name" maxLength={NAME_MAX} value={d.name} onChange={(e) => set("name", e.target.value)} aria-invalid={!!fe.name} />
          <Err text={fe.name} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="c-condition">Условие</Label>
            <select
              id="c-condition"
              name="condition"
              value={d.condition}
              onChange={(e) => set("condition", e.target.value as CampaignDraft["condition"])}
              className="h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
            >
              {CONDITIONS.map((c) => (
                <option key={c.value} value={c.value} className="bg-popover text-popover-foreground">
                  {c.label}
                </option>
              ))}
            </select>
            <Err text={fe.condition} />
          </div>
          {daysLabel ? (
            <div className="space-y-1.5">
              <Label htmlFor="c-days">{daysLabel}</Label>
              <Input
                id="c-days"
                name="days"
                type="number"
                inputMode="numeric"
                min={1}
                max={90}
                value={d.days ?? ""}
                onChange={(e) => set("days", e.target.value === "" ? null : Number(e.target.value))}
                aria-invalid={!!fe.days}
                {...selectOnFocus}
              />
              <Err text={fe.days} />
            </div>
          ) : null}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="c-title">Заголовок</Label>
          <Input id="c-title" name="title" maxLength={TITLE_MAX} value={d.title} onChange={(e) => set("title", e.target.value)} aria-invalid={!!fe.title} />
          <Err text={fe.title} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="c-body">Текст</Label>
          <Textarea id="c-body" name="body" rows={3} maxLength={BODY_MAX} value={d.body} onChange={(e) => set("body", e.target.value)} aria-invalid={!!fe.body} />
          <Err text={fe.body} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="c-url">Ссылка</Label>
            <Input id="c-url" name="url" value={d.url} onChange={(e) => set("url", e.target.value)} aria-invalid={!!fe.url} />
            <Err text={fe.url} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="c-hour">Час отправки</Label>
            <Input
              id="c-hour"
              name="hour"
              type="number"
              inputMode="numeric"
              min={8}
              max={21}
              value={d.hour}
              onChange={(e) => set("hour", Number(e.target.value))}
              aria-invalid={!!fe.hour}
              {...selectOnFocus}
            />
            <Err text={fe.hour} />
          </div>
        </div>
        <fieldset className="space-y-1.5">
          <legend className="text-sm font-medium">Каналы</legend>
          <div className="flex flex-wrap gap-x-5 gap-y-1.5">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" name="push" checked={d.push} onChange={(e) => set("push", e.target.checked)} className="size-4 accent-primary" />
              Push
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" name="telegram" checked={d.telegram} onChange={(e) => set("telegram", e.target.checked)} className="size-4 accent-primary" />
              Telegram
            </label>
          </div>
          <Err text={fe.push ?? fe.telegram} />
        </fieldset>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : null}
            Сохранить
          </Button>
          {state?.ok ? (
            <p role="status" className="text-sm text-muted-foreground">
              Сохранено
            </p>
          ) : null}
          {state && !state.ok && state.error ? (
            <p role="alert" className="text-sm text-destructive">
              {state.error}
            </p>
          ) : null}
        </div>
      </form>
      <aside aria-label="Предпросмотр" className="space-y-1.5">
        <p className="text-sm font-medium">Предпросмотр</p>
        <div className="rounded-xl border bg-card p-3 text-card-foreground shadow-sm">
          <p className="text-sm font-semibold break-words">{d.title || "Заголовок"}</p>
          <p className="mt-0.5 text-sm break-words whitespace-pre-line text-muted-foreground">{d.body || "Текст уведомления"}</p>
          <p className="mt-2 truncate text-xs text-muted-foreground">{d.url}</p>
        </div>
      </aside>
    </div>
  );
}
