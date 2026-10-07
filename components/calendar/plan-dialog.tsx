"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { CalendarEvent } from "@/components/calendar/calendar-view";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createPlanAction, updatePlanAction } from "@/lib/plans/actions";
import type { PlanScope } from "@/lib/plans/edit";
import { weekdayOf } from "@/lib/plans/expand";
import { PLAN_DURATIONS } from "@/lib/plans/schema";
import { WEEKDAYS_SHORT } from "@/lib/plans/view";
import { cn } from "@/lib/utils";

export type TemplateOption = { id: string; name: string };
export type PlanDialogState = { mode: "create"; date: string; time: string } | { mode: "edit"; event: CalendarEvent };

const selectClass =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

/** Форма «Новая тренировка» / «Изменить тренировку». Ключ по состоянию — поля сбрасываются при каждом открытии. */
export function PlanDialog({
  state,
  templates,
  onClose,
}: {
  state: PlanDialogState | null;
  templates: { mine: TemplateOption[]; programs: TemplateOption[] };
  onClose: () => void;
}) {
  // Пока идёт анимация закрытия, показываем прежнее содержимое — без «пустого» окна
  const [shown, setShown] = useState(state);
  if (state && state !== shown) setShown(state);
  return (
    <Dialog open={state !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        {shown ? <PlanForm key={shown.mode === "edit" ? shown.event.key : `${shown.date}T${shown.time}`} state={shown} templates={templates} onClose={onClose} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function PlanForm({
  state,
  templates,
  onClose,
}: {
  state: PlanDialogState;
  templates: { mine: TemplateOption[]; programs: TemplateOption[] };
  onClose: () => void;
}) {
  const initial =
    state.mode === "edit"
      ? state.event
      : { title: "", date: state.date, time: state.time, durationMin: 60, templateId: null as string | null, recurring: false };
  const all = [...templates.mine, ...templates.programs];
  const [templateId, setTemplateId] = useState(initial.templateId ?? "");
  const [title, setTitle] = useState(initial.templateId ? "" : initial.title);
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const [durationMin, setDurationMin] = useState(initial.durationMin);
  const [repeat, setRepeat] = useState(false);
  const [days, setDays] = useState<number[]>([weekdayOf(initial.date)]);
  const [askScope, setAskScope] = useState(false);
  const [pending, startTransition] = useTransition();

  const chosen = all.find((t) => t.id === templateId);
  const finalTitle = chosen?.name ?? title.trim();

  const done = (result: { ok: true } | { ok: false; error: string }) => {
    if (result.ok) onClose();
    else toast.error(result.error);
  };
  const update = (scope: PlanScope) =>
    startTransition(async () => {
      if (state.mode !== "edit") return;
      done(await updatePlanAction(state.event.key, scope, { templateId: templateId || null, title: finalTitle, date, time, durationMin }));
    });
  const submit = () => {
    if (!finalTitle) return toast.error("Выберите шаблон или введите название");
    if (state.mode === "edit") {
      if (state.event.recurring) setAskScope(true);
      else update("one");
      return;
    }
    startTransition(async () =>
      done(await createPlanAction({ templateId: templateId || null, title: finalTitle, date, time, durationMin, repeatWeekdays: repeat ? days : [] })),
    );
  };

  if (askScope) {
    return <ScopeChoice pending={pending} onChoose={update} onCancel={() => setAskScope(false)} />;
  }

  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <DialogHeader>
        <DialogTitle>{state.mode === "edit" ? "Изменить тренировку" : "Новая тренировка"}</DialogTitle>
      </DialogHeader>
      <div className="grid gap-1.5">
        <Label htmlFor="plan-template">Шаблон</Label>
        <select id="plan-template" className={selectClass} value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
          <option value="">Без шаблона</option>
          {templates.mine.length ? (
            <optgroup label="Мои шаблоны">
              {templates.mine.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </optgroup>
          ) : null}
          <optgroup label="Готовые программы">
            {templates.programs.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </optgroup>
        </select>
      </div>
      {templateId ? null : (
        <div className="grid gap-1.5">
          <Label htmlFor="plan-title">Название</Label>
          <Input id="plan-title" value={title} maxLength={80} placeholder="Например, Кардио" onChange={(e) => setTitle(e.target.value)} />
        </div>
      )}
      <div className="grid grid-cols-3 gap-2">
        <div className="col-span-3 grid gap-1.5 sm:col-span-1">
          <Label htmlFor="plan-date">Дата</Label>
          <Input id="plan-date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="grid gap-1.5 max-sm:col-span-1">
          <Label htmlFor="plan-time">Начало</Label>
          <Input id="plan-time" type="time" required step={900} value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
        <div className="grid gap-1.5 max-sm:col-span-2">
          <Label htmlFor="plan-duration">Длительность</Label>
          <select id="plan-duration" className={selectClass} value={durationMin} onChange={(e) => setDurationMin(Number(e.target.value))}>
            {[...new Set([...PLAN_DURATIONS, initial.durationMin])].sort((a, b) => a - b).map((m) => (
              <option key={m} value={m}>
                {m < 60 ? `${m} мин` : `${Math.floor(m / 60)} ч${m % 60 ? ` ${m % 60} мин` : ""}`}
              </option>
            ))}
          </select>
        </div>
      </div>
      {state.mode === "create" ? (
        <div className="grid gap-2">
          <Label className="flex items-center gap-2 font-normal">
            <Checkbox checked={repeat} onCheckedChange={(v) => setRepeat(v === true)} />
            Повторять каждую неделю
          </Label>
          {repeat ? (
            <div className="flex gap-1" role="group" aria-label="Дни недели">
              {WEEKDAYS_SHORT.map((w, i) => {
                const on = days.includes(i);
                return (
                  <button
                    key={w}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setDays(on ? days.filter((d) => d !== i) : [...days, i].sort())}
                    className={cn(
                      "size-9 rounded-full text-xs font-semibold",
                      on ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {w}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
          Отмена
        </Button>
        <Button type="submit" disabled={pending || (repeat && !days.length)}>
          {pending ? <Loader2 className="animate-spin" /> : null}
          Сохранить
        </Button>
      </DialogFooter>
    </form>
  );
}

/** «Повторяющаяся тренировка»: применить к одной или к этой и следующим. */
export function ScopeChoice({
  pending,
  onChoose,
  onCancel,
  verb = "Изменить",
}: {
  pending: boolean;
  onChoose: (scope: PlanScope) => void;
  onCancel: () => void;
  verb?: string;
}) {
  return (
    <div className="grid gap-4" role="group" aria-label="Повторяющаяся тренировка">
      <DialogHeader>
        <DialogTitle>Повторяющаяся тренировка</DialogTitle>
      </DialogHeader>
      <p className="text-sm text-muted-foreground">{verb} только эту тренировку или эту и все следующие?</p>
      <div className="grid gap-2">
        <Button disabled={pending} onClick={() => onChoose("one")}>
          Только эту
        </Button>
        <Button variant="outline" disabled={pending} onClick={() => onChoose("following")}>
          Эту и следующие
        </Button>
        <Button variant="ghost" disabled={pending} onClick={onCancel}>
          Отмена
        </Button>
      </div>
    </div>
  );
}
