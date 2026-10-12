"use client";

import { useMemo, useState, useTransition } from "react";
import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";
import { CalendarCheck, Clock, Dumbbell, Flame, Loader2, Plus, Scale, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { DeadlinePicker } from "@/components/goals/deadline-picker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { GoalType, RecordType } from "@/generated/prisma/enums";
import { plural } from "@/lib/format";
import { createGoalAction } from "@/lib/goals/actions";
import type { GoalFormData } from "@/lib/goals/queries";
import { GOALS_ACTIVE_MAX, type GoalInput, type GoalSuggestion } from "@/lib/goals/rules";
import { cn } from "@/lib/utils";

const TYPES: { type: GoalType; label: string; icon: typeof Dumbbell; hint: string }[] = [
  { type: "STRENGTH", label: "Сила", icon: Dumbbell, hint: "Вес, 1ПМ или повторы в упражнении" },
  { type: "WORKOUTS", label: "Тренировки", icon: CalendarCheck, hint: "Сколько тренировок провести" },
  { type: "STREAK", label: "Серия", icon: Flame, hint: "Недель подряд с 3+ тренировками" },
  { type: "HOURS", label: "Часы в зале", icon: Clock, hint: "Сколько часов натренировать" },
  { type: "BODY_WEIGHT", label: "Вес тела", icon: Scale, hint: "Сбросить или набрать" },
];

const METRICS: { metric: RecordType; label: string }[] = [
  { metric: "MAX_WEIGHT", label: "Рабочий вес" },
  { metric: "ONE_RM", label: "1ПМ" },
  { metric: "MAX_REPS", label: "Повторы" },
];

const kg = (n: number) => `${String(Math.round(n * 10) / 10).replace(".", ",")} кг`;
const num = (s: string) => Number(s.trim().replace(",", "."));

function targetLabel(type: GoalType, metric: RecordType | null) {
  switch (type) {
    case "STRENGTH":
      return metric === "MAX_REPS" ? "Цель, повторов" : "Цель, кг";
    case "WORKOUTS":
      return "Цель, тренировок";
    case "STREAK":
      return "Цель, недель";
    case "HOURS":
      return "Цель, часов";
    case "BODY_WEIGHT":
      return "Цель, кг";
  }
}

type Draft = { type: GoalType | null; exerciseId: string | null; metric: RecordType | null; target: string; deadline: string | null; currentWeight: string };
const emptyDraft: Draft = { type: null, exerciseId: null, metric: null, target: "", deadline: null, currentWeight: "" };

function draftOf(g: Partial<GoalInput>): Draft {
  return {
    type: g.type ?? null,
    exerciseId: g.exerciseId ?? null,
    metric: g.metric ?? null,
    target: g.target !== undefined ? String(g.target).replace(".", ",") : "",
    deadline: g.deadline ?? null,
    currentWeight: "",
  };
}

function FieldError({ id, text }: { id: string; text?: string }) {
  return text ? (
    <p id={id} role="alert" className="text-sm text-destructive">
      {text}
    </p>
  ) : null;
}

/**
 * Кнопка «Новая цель», подсказки для пустой страницы и диалог постановки (два шага: тип → параметры).
 * `again` — параметры проваленной цели («Поставить снова»): диалог открывается сразу.
 */
export function NewGoal({
  form,
  activeCount,
  suggestions,
  again,
}: {
  form: GoalFormData;
  activeCount: number;
  suggestions: GoalSuggestion[];
  again: Partial<GoalInput> | null;
}) {
  const [open, setOpen] = useState(again !== null);
  const [draft, setDraft] = useState<Draft>(again ? draftOf({ ...again, deadline: null }) : emptyDraft);
  const [query, setQuery] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const full = activeCount >= GOALS_ACTIVE_MAX;

  const exercise = form.exercises.find((e) => e.id === draft.exerciseId) ?? null;
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? form.exercises.filter((e) => e.name.toLowerCase().includes(q)) : form.exercises;
    const top = list.slice(0, 8);
    return exercise && !top.some((e) => e.id === exercise.id) ? [exercise, ...top.slice(0, 7)] : top;
  }, [query, form.exercises, exercise]);

  const set = (patch: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setErrors({});
  };

  const start = (d: Draft) => {
    setDraft(d);
    setQuery(d.exerciseId ? (form.exercises.find((e) => e.id === d.exerciseId)?.name ?? "") : "");
    setErrors({});
    setOpen(true);
  };

  const current: number | null = (() => {
    switch (draft.type) {
      case "STRENGTH":
        return exercise && draft.metric ? (exercise.records[draft.metric] ?? 0) : null;
      case "STREAK":
        return form.streak;
      case "BODY_WEIGHT":
        return form.weight;
      default:
        return null;
    }
  })();
  const currentText =
    current === null
      ? null
      : draft.type === "STREAK"
        ? `${current} ${plural(current, "неделя", "недели", "недель")}`
        : draft.metric === "MAX_REPS" && draft.type === "STRENGTH"
          ? `${current} ${plural(current, "повтор", "повтора", "повторов")}`
          : kg(current);

  const bump = (pct: number) => {
    if (!current) return;
    const raw = current * (1 + pct / 100);
    const v = draft.metric === "MAX_REPS" ? Math.ceil(raw) : Math.ceil(raw / 2.5) * 2.5;
    set({ target: String(v).replace(".", ",") });
  };

  const submit = () =>
    startTransition(async () => {
      if (!draft.type) return;
      const input: GoalInput = {
        type: draft.type,
        target: num(draft.target),
        deadline: draft.deadline,
        ...(draft.type === "STRENGTH" ? { exerciseId: draft.exerciseId ?? undefined, metric: draft.metric ?? undefined } : {}),
        ...(draft.type === "BODY_WEIGHT" && form.weight === null ? { currentWeight: num(draft.currentWeight) } : {}),
      };
      if (!draft.target.trim() || !Number.isFinite(input.target)) {
        setErrors({ target: "Укажи цель" });
        return;
      }
      let res;
      try {
        res = await createGoalAction(input);
      } catch {
        toast.error("Не удалось сохранить — проверьте связь");
        return;
      }
      if (!res.ok) {
        setErrors({ [res.field ?? "form"]: res.error });
        return;
      }
      setOpen(false);
      setDraft(emptyDraft);
      toast.success("Цель поставлена");
    });

  const meta = TYPES.find((t) => t.type === draft.type);

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <Button size="lg" disabled={full} onClick={() => start(emptyDraft)}>
          <Plus />
          Новая цель
        </Button>
        {full ? <span className="text-sm text-muted-foreground">Максимум {GOALS_ACTIVE_MAX} активных целей</span> : null}
      </div>

      {suggestions.length ? (
        <section aria-label="Идеи для целей" className="space-y-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
            <Sparkles className="size-4" />
            Можно начать с этого
          </h2>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <Button key={s.title} variant="outline" onClick={() => start(draftOf(s))}>
                {s.title}
              </Button>
            ))}
          </div>
        </section>
      ) : null}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Новая цель</DialogTitle>
            <DialogDescription>{meta ? meta.hint : "Что хочешь улучшить?"}</DialogDescription>
          </DialogHeader>

          {!draft.type ? (
            <div className="grid grid-cols-2 gap-2">
              {TYPES.map(({ type, label, icon: Icon }) => (
                <Button key={type} type="button" variant="outline" className="h-16 flex-col gap-1" onClick={() => set({ type, metric: null, exerciseId: null, target: "" })}>
                  <Icon className="size-5 text-primary" />
                  {label}
                </Button>
              ))}
            </div>
          ) : (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
            >
              {draft.type === "STRENGTH" ? (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="goal-exercise-search">Поиск упражнения</Label>
                    <Input id="goal-exercise-search" value={query} placeholder="Например, жим" onChange={(e) => setQuery(e.target.value)} />
                    <RadioGroup
                      aria-label="Упражнение"
                      aria-invalid={errors.exerciseId ? true : undefined}
                      aria-describedby={errors.exerciseId ? "goal-exercise-error" : undefined}
                      value={draft.exerciseId ?? ""}
                      onValueChange={(v) => {
                        const ex = form.exercises.find((e) => e.id === v);
                        set({ exerciseId: v as string, metric: ex?.isBodyweight ? "MAX_REPS" : draft.metric, target: "" });
                      }}
                      className="flex flex-col gap-1"
                    >
                      {shown.map((e) => (
                        <Radio.Root
                          key={e.id}
                          value={e.id}
                          aria-label={e.name}
                          className={cn(
                            "rounded-lg border px-3 py-2 text-left text-sm transition-colors outline-none",
                            "hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
                            "data-checked:border-primary data-checked:bg-primary/10",
                          )}
                        >
                          {e.name}
                        </Radio.Root>
                      ))}
                      {shown.length === 0 ? <p className="text-sm text-muted-foreground">Ничего не нашлось</p> : null}
                    </RadioGroup>
                    <FieldError id="goal-exercise-error" text={errors.exerciseId} />
                  </div>
                  {exercise ? (
                    <div className="space-y-1.5">
                      <p className="text-sm font-medium">Что улучшаем</p>
                      <RadioGroup
                        aria-label="Что улучшаем"
                        aria-invalid={errors.metric ? true : undefined}
                        aria-describedby={errors.metric ? "goal-metric-error" : undefined}
                        value={draft.metric ?? ""} onValueChange={(v) => set({ metric: v as RecordType, target: "" })} className="flex flex-wrap gap-2">
                        {METRICS.filter((m) => !exercise.isBodyweight || m.metric === "MAX_REPS").map((m) => (
                          <Radio.Root
                            key={m.metric}
                            value={m.metric}
                            aria-label={m.label}
                            className={cn(
                              "rounded-lg border px-3 py-1.5 text-sm transition-colors outline-none",
                              "hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
                              "data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground",
                            )}
                          >
                            {m.label}
                          </Radio.Root>
                        ))}
                      </RadioGroup>
                      <FieldError id="goal-metric-error" text={errors.metric} />
                    </div>
                  ) : null}
                </>
              ) : null}

              {draft.type === "BODY_WEIGHT" && form.weight === null ? (
                <div className="space-y-1.5">
                  <Label htmlFor="goal-current-weight">Текущий вес, кг</Label>
                  <Input
                    id="goal-current-weight"
                    inputMode="decimal"
                    className="max-w-32"
                    value={draft.currentWeight}
                    onChange={(e) => set({ currentWeight: e.target.value })}
                  />
                  <FieldError id="goal-current-weight-error" text={errors.currentWeight} />
                </div>
              ) : null}

              {draft.type !== "STRENGTH" || draft.metric ? (
                <div className="space-y-1.5">
                  <Label htmlFor="goal-target">{targetLabel(draft.type, draft.metric)}</Label>
                  {currentText ? <p className="text-sm text-muted-foreground">Сейчас: {currentText}</p> : null}
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      id="goal-target"
                      inputMode="decimal"
                      className="max-w-32"
                      value={draft.target}
                      aria-invalid={errors.target ? true : undefined}
                      aria-describedby={errors.target ? "goal-target-error" : undefined}
                      onChange={(e) => set({ target: e.target.value })}
                    />
                    {draft.type === "STRENGTH" && current
                      ? [5, 10, 20].map((p) => (
                          <Button key={p} type="button" size="sm" variant="outline" onClick={() => bump(p)}>
                            +{p} %
                          </Button>
                        ))
                      : null}
                  </div>
                  <FieldError id="goal-target-error" text={errors.target} />
                </div>
              ) : null}

              <DeadlinePicker value={draft.deadline} onChange={(v) => set({ deadline: v })} today={form.today} error={errors.deadline} />
              <FieldError id="goal-form-error" text={errors.form} />

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => set({ type: null })}>
                  Назад
                </Button>
                <Button type="submit" disabled={pending}>
                  {pending ? <Loader2 className="animate-spin" /> : null}
                  Создать
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
