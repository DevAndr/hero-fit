"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CalendarClock, Check, ListChecks, Pencil, Play, Repeat, Trash2, UserRound } from "lucide-react";
import { SkipPlanButton } from "@/components/calendar/skip-plan-button";
import { toast } from "sonner";
import type { CalendarEvent } from "@/components/calendar/calendar-view";
import { ScopeChoice } from "@/components/calendar/plan-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { deletePlanAction } from "@/lib/plans/actions";
import type { PlanScope } from "@/lib/plans/edit";
import { weekdayOf } from "@/lib/plans/expand";
import { dayLabel, endTime, STATUS_LABEL, WEEKDAYS_SHORT } from "@/lib/plans/view";
import { createWorkoutAction } from "@/lib/workouts/actions";

/** Карточка события: план — «Начать / Изменить / Удалить», выполненная — «Открыть сводку». */
export function EventCard({
  event,
  activePlanKey,
  onClose,
  onEdit,
}: {
  event: CalendarEvent | null;
  activePlanKey: string | null;
  onClose: () => void;
  onEdit: (event: CalendarEvent) => void;
}) {
  // Пока идёт анимация закрытия, показываем прежнее содержимое — без «пустого» окна
  const [shown, setShown] = useState(event);
  if (event && event !== shown) setShown(event);
  return (
    <Dialog open={event !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        {shown ? <CardBody key={shown.key} event={shown} activePlanKey={activePlanKey} onClose={onClose} onEdit={onEdit} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function CardBody({
  event,
  activePlanKey,
  onClose,
  onEdit,
}: {
  event: CalendarEvent;
  activePlanKey: string | null;
  onClose: () => void;
  onEdit: (event: CalendarEvent) => void;
}) {
  const [askScope, setAskScope] = useState(false);
  const [pending, startTransition] = useTransition();
  const plan = event.kind === "plan";
  // Повтор серии — по исходной дате вхождения (ключ s:<id>:<дата>), а не по перенесённой
  const seriesDay = event.key.startsWith("s:") ? WEEKDAYS_SHORT[weekdayOf(event.key.slice(-10))].toLowerCase() : null;

  const remove = (scope: PlanScope) =>
    startTransition(async () => {
      const result = await deletePlanAction(event.key, scope);
      if (result.ok) onClose();
      else toast.error(result.error);
    });

  if (askScope) return <ScopeChoice verb="Удалить" pending={pending} onChoose={remove} onCancel={() => setAskScope(false)} />;

  return (
    <div className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{event.title}</DialogTitle>
        <DialogDescription>
          {dayLabel(event.date)}, {event.time}–{endTime(event.time, event.durationMin)}
        </DialogDescription>
      </DialogHeader>
      <ul className="grid gap-1.5 text-sm">
        {seriesDay ? (
          <li className="flex items-center gap-2">
            <Repeat className="size-4 text-muted-foreground" />
            Каждую неделю: {seriesDay}
          </li>
        ) : null}
        {event.exercises ? (
          <li className="flex items-center gap-2">
            <CalendarClock className="size-4 text-muted-foreground" />
            {event.exercises} упр. в шаблоне
          </li>
        ) : null}
        {event.coachName ? (
          <li className="flex items-center gap-2">
            <UserRound className="size-4 text-muted-foreground" />
            {`от тренера · ${event.coachName}${event.program ? ` · ${event.program}` : ""}`}
          </li>
        ) : event.program ? (
          // Программа из каталога: «программа «Сила» (неделя 3/8)»
          <li className="flex items-center gap-2">
            <ListChecks className="size-4 text-muted-foreground" />
            {event.program}
          </li>
        ) : null}
        <li className="flex items-center gap-2">
          <Check className="size-4 text-muted-foreground" />
          {plan ? `Статус: ${STATUS_LABEL[event.status]}` : "Тренировка вне плана"}
        </li>
      </ul>
      <div className="flex flex-wrap gap-2">
        {event.workoutId ? (
          <Link href={`/workouts/${event.workoutId}`} className={buttonVariants()}>
            Открыть сводку
          </Link>
        ) : activePlanKey === event.key ? (
          <Link href="/training" className={buttonVariants()}>
            <Play />
            Продолжить
          </Link>
        ) : (
          <form action={createWorkoutAction}>
            <input type="hidden" name="source" value={`plan:${event.key}`} />
            <Button type="submit">
              <Play />
              Начать
            </Button>
          </form>
        )}
        {plan && event.status !== "done" && event.coachName ? (
          <>
            {activePlanKey === event.key ? null : <SkipPlanButton planKey={event.key} title={event.title} />}
            <p className="w-full text-sm text-muted-foreground">Назначено тренером</p>
          </>
        ) : plan && event.status !== "done" ? (
          <>
            <Button variant="outline" onClick={() => onEdit(event)}>
              <Pencil />
              Изменить
            </Button>
            <Button variant="outline" disabled={pending} onClick={() => (event.recurring ? setAskScope(true) : remove("one"))}>
              <Trash2 />
              Удалить
            </Button>
          </>
        ) : null}
      </div>
    </div>
  );
}
