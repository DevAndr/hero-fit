"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ScopeChoice } from "@/components/calendar/plan-dialog";
import { ClientPicker } from "@/components/coach/client-picker";
import type { CoachGroupView } from "@/lib/coach/groups";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { assignManyText } from "@/lib/coach/assign";
import { assignManyAction, assignWorkoutAction, updateAssignmentAction } from "@/lib/coach/plan-actions";
import type { PlanScope } from "@/lib/plans/edit";
import { addDays, weekdayOf } from "@/lib/plans/expand";
import { PLAN_DURATIONS } from "@/lib/plans/schema";
import { WEEKDAYS_SHORT } from "@/lib/plans/view";
import { cn } from "@/lib/utils";

export type AssignTemplate = { id: string; name: string };
export type AssignEditItem = { key: string; templateId: string | null; date: string; time: string; durationMin: number; recurring: boolean };
export type AssignClient = { id: string; name: string };
/** create/edit — одному клиенту (вкладка «План»), many — нескольким (список /coach). */
export type AssignDialogState = { mode: "create"; date: string } | { mode: "edit"; item: AssignEditItem } | { mode: "many"; date: string };

const durationLabel = (m: number) => (m < 60 ? `${m} мин` : `${Math.floor(m / 60)} ч${m % 60 ? ` ${m % 60} мин` : ""}`);
/** «До» по умолчанию — 8 недель. */
const WEEKS = 8;

/** «Назначить тренировку» / «Изменить назначение» / «Назначить нескольким» — даты в поясе каждого клиента. */
export function AssignDialog({
  clientId,
  clients = [],
  groups = [],
  state,
  templates,
  onClose,
}: {
  /** Клиент вкладки «План»; в режиме many — null. */
  clientId: string | null;
  /** Режим many: из кого выбирать. */
  clients?: AssignClient[];
  /** Режим many: кнопки групп над списком. */
  groups?: CoachGroupView[];
  state: AssignDialogState | null;
  templates: AssignTemplate[];
  onClose: () => void;
}) {
  const [shown, setShown] = useState(state);
  if (state && state !== shown) setShown(state);
  return (
    <Dialog open={state !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        {shown ? (
          <AssignForm
            key={shown.mode === "edit" ? shown.item.key : shown.date}
            clientId={clientId}
            clients={clients}
            groups={groups}
            state={shown}
            templates={templates}
            onClose={onClose}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function AssignForm({
  clientId,
  clients,
  groups,
  state,
  templates,
  onClose,
}: {
  clientId: string | null;
  clients: AssignClient[];
  groups: CoachGroupView[];
  state: AssignDialogState;
  templates: AssignTemplate[];
  onClose: () => void;
}) {
  const initial = state.mode === "edit" ? state.item : { templateId: templates[0]?.id ?? null, date: state.date, time: "19:00", durationMin: 60, recurring: false };
  const [templateId, setTemplateId] = useState(initial.templateId ?? "");
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const [durationMin, setDurationMin] = useState(initial.durationMin);
  const [repeat, setRepeat] = useState(false);
  const [days, setDays] = useState<number[]>([weekdayOf(initial.date)]);
  const [until, setUntil] = useState(addDays(initial.date, WEEKS * 7 - 1));
  const [askScope, setAskScope] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const many = state.mode === "many";
  const [pending, startTransition] = useTransition();
  const durations = [...new Set([...PLAN_DURATIONS, initial.durationMin])].sort((a, b) => a - b);

  const done = (result: { ok: true } | { ok: false; error: string }) => {
    if (result.ok) onClose();
    else toast.error(result.error);
  };
  const update = (scope: PlanScope) =>
    startTransition(async () => {
      if (state.mode !== "edit" || !clientId) return;
      done(await updateAssignmentAction(clientId, state.item.key, scope, { templateId, date, time, durationMin }));
    });
  const submit = () => {
    if (!templateId) return toast.error("Выберите шаблон");
    if (state.mode === "edit") {
      if (state.item.recurring) setAskScope(true);
      else update("one");
      return;
    }
    const input = { templateId, date, time, durationMin, repeatWeekdays: repeat ? days : [], endDate: repeat ? until : null };
    if (many) {
      startTransition(async () => {
        const result = await assignManyAction(picked, input);
        if (!result.ok) return void toast.error(result.error);
        toast.success(assignManyText(result.assigned, result.skipped));
        onClose();
      });
      return;
    }
    if (!clientId) return;
    startTransition(async () => done(await assignWorkoutAction(clientId, input)));
  };

  if (askScope) return <ScopeChoice pending={pending} onChoose={update} onCancel={() => setAskScope(false)} />;

  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <DialogHeader>
        <DialogTitle>{state.mode === "edit" ? "Изменить назначение" : many ? "Назначить нескольким" : "Назначить тренировку"}</DialogTitle>
      </DialogHeader>
      {many ? <ClientPicker clients={clients} groups={groups} picked={picked} onChange={setPicked} /> : null}
      {templates.length ? (
        <div className="grid gap-1.5">
          <Label htmlFor="assign-template">Шаблон</Label>
          <Select
            items={templates.map((t) => ({ value: t.id, label: t.name }))}
            value={templateId || null}
            onValueChange={(v: string | null) => setTemplateId(v ?? "")}
          >
            <SelectTrigger id="assign-template" aria-label="Шаблон" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {templates.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Сначала создайте шаблон тренировки в разделе «Шаблоны».</p>
      )}
      <div className="grid grid-cols-3 gap-2">
        <div className="col-span-3 grid gap-1.5 sm:col-span-1">
          <Label htmlFor="assign-date">Дата</Label>
          <Input id="assign-date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="grid gap-1.5 max-sm:col-span-1">
          <Label htmlFor="assign-time">Начало</Label>
          <Input id="assign-time" type="time" required step={900} value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
        <div className="grid gap-1.5 max-sm:col-span-2">
          <Label htmlFor="assign-duration">Длительность</Label>
          <Select
            items={durations.map((m) => ({ value: m, label: durationLabel(m) }))}
            value={durationMin}
            onValueChange={(v: number | null) => v !== null && setDurationMin(v)}
          >
            <SelectTrigger id="assign-duration" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {durations.map((m) => (
                <SelectItem key={m} value={m}>
                  {durationLabel(m)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {state.mode !== "edit" ? (
        <div className="grid gap-2">
          <Label className="flex items-center gap-2 font-normal">
            <Checkbox
              checked={repeat}
              onCheckedChange={(v) => {
                setRepeat(v === true);
                // Отмечаем день выбранной даты (не той, с которой открыт диалог)
                if (v === true) setDays([weekdayOf(date)]);
              }}
            />
            Повторять каждую неделю
          </Label>
          {repeat ? (
            <>
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
              <div className="grid gap-1.5 sm:w-1/2">
                <Label htmlFor="assign-until">До</Label>
                <Input id="assign-until" type="date" required min={date} value={until} onChange={(e) => setUntil(e.target.value)} />
              </div>
            </>
          ) : null}
        </div>
      ) : null}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
          Отмена
        </Button>
        <Button type="submit" disabled={pending || !templates.length || (repeat && !days.length) || (many && !picked.length)}>
          {pending ? <Loader2 className="animate-spin" /> : null}
          {state.mode === "edit" ? "Сохранить" : "Назначить"}
        </Button>
      </DialogFooter>
    </form>
  );
}
