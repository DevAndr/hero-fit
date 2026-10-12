"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { ClubTaskMode, ClubTaskType } from "@/generated/prisma/enums";
import { cancelClubTaskAction, createClubTaskAction, taskMinimumAction } from "@/lib/club/task-actions";

const dateFormat = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" });

const TYPES: { value: ClubTaskType; label: string; unit: string }[] = [
  { value: "WORKOUTS", label: "Тренировки", unit: "тренировок" },
  { value: "VOLUME", label: "Объём", unit: "кг" },
  { value: "REPS", label: "Повторы в упражнении", unit: "повторов" },
  { value: "HOURS", label: "Часы в зале", unit: "часов" },
];
const MODES: { value: ClubTaskMode; label: string; hint: string }[] = [
  { value: "CLUB", label: "Всем клубом", hint: "общий счётчик, сундук — всем с заметным вкладом" },
  { value: "EACH", label: "Каждому", hint: "личная цель у каждого участника" },
];

type Task = { id: string; title: string; startsAt: string; endsAt: string; started: boolean };

function Choice<T extends string>({ name, items, value, onChange }: { name: string; items: { value: T; label: string; hint?: string }[]; value: T | null; onChange: (v: T) => void }) {
  return (
    <RadioGroup aria-label={name} value={value ?? undefined} onValueChange={(v) => onChange(v as T)} className="gap-1.5">
      {items.map((i) => (
        <label key={i.value} className="flex cursor-pointer items-start gap-2 text-sm">
          <RadioGroupItem value={i.value} aria-label={i.label} className="mt-0.5" />
          <span>
            {i.label}
            {i.hint ? <span className="block text-xs text-muted-foreground">{i.hint}</span> : null}
          </span>
        </label>
      ))}
    </RadioGroup>
  );
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** «Новое задание»: тип → режим и упражнение → цель и срок; подсказка минимума — с сервера. */
function NewTaskDialog({ clubId, exercises }: { clubId: string; exercises: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<ClubTaskType | null>(null);
  const [mode, setMode] = useState<ClubTaskMode | null>(null);
  const [exerciseId, setExerciseId] = useState("");
  const [days, setDays] = useState("14");
  const [startDay, setStartDay] = useState(today);
  const [target, setTarget] = useState("");
  const [min, setMin] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    const n = Number(days);
    if (!open || !type || !mode || !Number.isInteger(n) || n < 7 || n > 31) return;
    let alive = true;
    taskMinimumAction(clubId, type, mode, n).then((m) => alive && setMin(m), () => {});
    return () => {
      alive = false;
    };
  }, [open, clubId, type, mode, days]);

  const hours = type === "HOURS";
  const shownMin = min === null ? null : hours ? min / 60 : min;
  const reset = () => {
    setType(null);
    setMode(null);
    setExerciseId("");
    setDays("14");
    setStartDay(today());
    setTarget("");
    setMin(null);
    setError(null);
  };

  return (
    <>
      <Button
        size="sm"
        onClick={() => {
          reset();
          setOpen(true);
        }}
      >
        <Plus />
        Новое задание
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Новое задание</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!type || !mode) return setError("Выберите тип и режим");
              const n = Number(target);
              start(async () => {
                const r = await createClubTaskAction(clubId, {
                  type,
                  mode,
                  exerciseId: type === "REPS" ? exerciseId || undefined : undefined,
                  target: hours ? Math.round(n * 60) : n,
                  startDay,
                  days: Number(days),
                });
                if (!r.ok) return setError(r.error);
                toast.success("Задание создано");
                setOpen(false);
              });
            }}
          >
            <fieldset className="space-y-2">
              <legend className="text-sm font-semibold">1. Что считаем</legend>
              <Choice name="Тип задания" items={TYPES} value={type} onChange={setType} />
            </fieldset>
            <fieldset className="space-y-2">
              <legend className="text-sm font-semibold">2. Как</legend>
              <Choice name="Режим" items={MODES} value={mode} onChange={setMode} />
              {type === "REPS" ? (
                <div className="space-y-1.5">
                  <Label htmlFor="task-exercise">Упражнение</Label>
                  <select
                    id="task-exercise"
                    value={exerciseId}
                    onChange={(e) => setExerciseId(e.target.value)}
                    className="h-9 w-full rounded-lg border border-input bg-transparent px-2 text-sm"
                  >
                    <option value="">Выберите упражнение</option>
                    {exercises.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
            </fieldset>
            <fieldset className="grid grid-cols-2 gap-3">
              <legend className="mb-2 text-sm font-semibold">3. Цель и срок</legend>
              <div className="space-y-1.5">
                <Label htmlFor="task-start">Старт</Label>
                <Input id="task-start" type="date" value={startDay} onChange={(e) => setStartDay(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="task-days">Длительность, дней</Label>
                <Input id="task-days" type="number" min={7} max={31} value={days} onChange={(e) => setDays(e.target.value)} />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="task-target">Цель</Label>
                <Input id="task-target" type="number" min={1} step={hours ? 0.5 : 1} value={target} onChange={(e) => setTarget(e.target.value)} />
                <p className="text-xs text-muted-foreground">
                  {type ? TYPES.find((t) => t.value === type)?.unit : "выберите тип"}
                  {shownMin !== null ? ` · Минимум: ${shownMin.toLocaleString("ru-RU")}` : ""}
                </p>
              </div>
            </fieldset>
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <DialogFooter>
              <Button type="submit" disabled={pending}>
                {pending ? <Loader2 className="animate-spin" /> : null}
                Создать
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Раздел «Задания» в управлении клубом: активные с «Отменить» и «Новое задание». */
export function ManageTasks({ clubId, tasks, exercises }: { clubId: string; tasks: Task[]; exercises: { id: string; name: string }[] }) {
  const [cancel, setCancel] = useState<Task | null>(null);
  const [pending, start] = useTransition();
  return (
    <section aria-label="Задания клуба" className="space-y-3 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-bold">Задания</h2>
        <NewTaskDialog clubId={clubId} exercises={exercises} />
      </div>
      <p className="text-sm text-muted-foreground">До 3 активных заданий. Цель и срок после создания не меняются — задание можно только отменить.</p>
      {tasks.length ? (
        <ul className="divide-y">
          {tasks.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="break-words">{t.title}</p>
                <p className="text-xs text-muted-foreground">
                  {!t.started ? `стартует ${dateFormat.format(new Date(t.startsAt))}` : `до ${dateFormat.format(new Date(new Date(t.endsAt).getTime() - 1))}`}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setCancel(t)}>
                Отменить
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Активных заданий нет.</p>
      )}
      <AlertDialog open={cancel !== null} onOpenChange={(v) => !v && setCancel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Отменить «{cancel?.title}»?</AlertDialogTitle>
            <AlertDialogDescription>Вклад больше не будет считаться. Уже полученные сундуки останутся у участников.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Не отменять</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={pending}
              onClick={() =>
                cancel &&
                start(async () => {
                  const r = await cancelClubTaskAction(cancel.id);
                  if (r.ok) toast.success("Задание отменено");
                  else toast.error(r.error);
                  setCancel(null);
                })
              }
            >
              Отменить задание
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
