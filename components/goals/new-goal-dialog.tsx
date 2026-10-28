"use client";

import { useMemo, useState, useTransition } from "react";
import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";
import { CalendarCheck, Clock, Dumbbell, Flame, Loader2, PersonStanding, Plus, Repeat, Ruler, Scale, Sparkles, Target } from "lucide-react";
import { toast } from "sonner";
import { DeadlinePicker } from "@/components/goals/deadline-picker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatClock, plural } from "@/lib/format";
import { createGoalAction } from "@/lib/goals/actions";
import type { GoalFormData } from "@/lib/goals/queries";
import { GOALS_ACTIVE_MAX, isStretchGoal, type GoalInput, type GoalSuggestion, type StrengthMetric } from "@/lib/goals/rules";
import { CUSTOM_SKILL_MEASURE, isSkillKey, STRETCH_SKILL_KEYS, STRETCH_SKILLS } from "@/lib/stretching/skills";
import { WEEKLY_WEEKS_MAX, WEEKLY_WEEKS_MIN } from "@/lib/goals/stretch-weekly";
import { cn } from "@/lib/utils";

const TYPES: { type: GoalInput["type"]; label: string; icon: typeof Dumbbell; hint: string }[] = [
  { type: "STRENGTH", label: "Сила", icon: Dumbbell, hint: "Вес, 1ПМ или повторы в упражнении" },
  { type: "WORKOUTS", label: "Тренировки", icon: CalendarCheck, hint: "Сколько тренировок провести" },
  { type: "STREAK", label: "Серия", icon: Flame, hint: "Недель подряд с 3+ тренировками" },
  { type: "HOURS", label: "Часы в зале", icon: Clock, hint: "Сколько часов натренировать" },
  { type: "BODY_WEIGHT", label: "Вес тела", icon: Scale, hint: "Сбросить или набрать" },
];

/** Группа «Растяжка» — только при флаге `stretching`. */
const STRETCH_TYPES: typeof TYPES = [
  { type: "STRETCH_WEEKLY", label: "Регулярность", icon: Repeat, hint: "Растяжка каждую неделю: сессии или минуты (заминка тоже считается)" },
  { type: "STRETCH_HOLD", label: "Удержание", icon: PersonStanding, hint: "Сколько секунд держать позу" },
  { type: "STRETCH_SKILL", label: "Навык", icon: Ruler, hint: "Шпагат, наклон, мостик: замеряйте расстояние до цели, пока оно не станет 0" },
];

type StretchUnit = "SESSIONS" | "MINUTES";
const UNITS: { unit: StretchUnit; label: string }[] = [
  { unit: "SESSIONS", label: "Сессии" },
  { unit: "MINUTES", label: "Минуты" },
];

const METRICS: { metric: StrengthMetric; label: string }[] = [
  { metric: "MAX_WEIGHT", label: "Рабочий вес" },
  { metric: "ONE_RM", label: "1ПМ" },
  { metric: "MAX_REPS", label: "Повторы" },
];

const kg = (n: number) => `${String(Math.round(n * 10) / 10).replace(".", ",")} кг`;
const num = (s: string) => Number(s.trim().replace(",", "."));
/** Время удержания: «90» или «1:30» → секунды. */
const seconds = (s: string) => {
  const m = /^(\d+):([0-5]?\d)$/.exec(s.trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : num(s);
};

function targetLabel(type: GoalInput["type"], metric: StrengthMetric | null, unit: StretchUnit | null) {
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
    case "STRETCH_HOLD":
      return "Цель, секунд (или м:сс)";
    case "STRETCH_WEEKLY":
      return unit === "MINUTES" ? "Минут в неделю" : "Сессий в неделю";
    case "STRETCH_SKILL":
      return "Цель, см";
  }
}

type Draft = {
  type: GoalInput["type"] | null;
  exerciseId: string | null;
  metric: StrengthMetric | null;
  target: string;
  deadline: string | null;
  currentWeight: string;
  /** Регулярность: что считаем и сколько недель. */
  stretchUnit: StretchUnit;
  weeks: string;
  /** Навык: ключ из списка или «custom» (своё название), стартовый замер в см. */
  skill: string | null;
  skillTitle: string;
  startCm: string;
};
const emptyDraft: Draft = { type: null, exerciseId: null, metric: null, target: "", deadline: null, currentWeight: "", stretchUnit: "SESSIONS", weeks: "4", skill: null, skillTitle: "", startCm: "" };

function draftOf(g: Partial<GoalInput>): Draft {
  return {
    type: g.type ?? null,
    exerciseId: g.exerciseId ?? null,
    metric: g.metric ?? null,
    target: g.target !== undefined ? String(g.target).replace(".", ",") : "",
    deadline: g.deadline ?? null,
    currentWeight: "",
    stretchUnit: g.stretchUnit ?? "SESSIONS",
    weeks: g.weeks !== undefined ? String(g.weeks) : "4",
    skill: g.stretchSkill ?? (g.skillTitle ? "custom" : null),
    skillTitle: g.skillTitle ?? "",
    startCm: g.startCm !== undefined ? String(g.startCm).replace(".", ",") : "",
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
 * `initialGroup="stretch"` — кнопка «Поставить цель» сразу с типами растяжки (страница /stretching).
 */
export function NewGoal({
  form,
  activeCount,
  suggestions,
  again,
  initialGroup,
}: {
  form: GoalFormData;
  activeCount: number;
  suggestions: GoalSuggestion[];
  again: Partial<GoalInput> | null;
  initialGroup?: "stretch";
}) {
  const [group, setGroup] = useState<"main" | "stretch">(initialGroup ?? (again?.type && isStretchGoal(again.type) ? "stretch" : "main"));
  const [open, setOpen] = useState(again !== null);
  const [draft, setDraft] = useState<Draft>(again ? draftOf({ ...again, deadline: null }) : emptyDraft);
  const [query, setQuery] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const full = activeCount >= GOALS_ACTIVE_MAX;

  const pool = draft.type === "STRETCH_HOLD" ? form.stretchExercises : form.exercises;
  const exercise = pool.find((e) => e.id === draft.exerciseId) ?? null;
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? pool.filter((e) => e.name.toLowerCase().includes(q)) : pool;
    const top = list.slice(0, 8);
    return exercise && !top.some((e) => e.id === exercise.id) ? [exercise, ...top.slice(0, 7)] : top;
  }, [query, pool, exercise]);

  const set = (patch: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setErrors({});
  };

  const start = (d: Draft) => {
    setDraft(d);
    setQuery(d.exerciseId ? ([...form.exercises, ...form.stretchExercises].find((e) => e.id === d.exerciseId)?.name ?? "") : "");
    setErrors({});
    setOpen(true);
  };

  const current: number | null = (() => {
    switch (draft.type) {
      case "STRENGTH":
        return exercise && draft.metric ? (exercise.records[draft.metric] ?? 0) : null;
      case "STRETCH_HOLD":
        return exercise ? (exercise.records.MAX_DURATION ?? 0) : null;
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
      : draft.type === "STRETCH_HOLD"
        ? formatClock(current)
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
      const skill = draft.type === "STRETCH_SKILL";
      const input: GoalInput = {
        type: draft.type,
        target: skill ? 0 : draft.type === "STRETCH_HOLD" ? seconds(draft.target) : num(draft.target),
        ...(skill
          ? {
              ...(isSkillKey(draft.skill) ? { stretchSkill: draft.skill } : draft.skill === "custom" ? { skillTitle: draft.skillTitle } : {}),
              startCm: num(draft.startCm),
            }
          : {}),
        deadline: draft.deadline,
        ...(draft.type === "STRETCH_HOLD" ? { exerciseId: draft.exerciseId ?? undefined } : {}),
        ...(draft.type === "STRETCH_WEEKLY" ? { stretchUnit: draft.stretchUnit, weeks: num(draft.weeks), deadline: null } : {}),
        ...(draft.type === "STRENGTH" ? { exerciseId: draft.exerciseId ?? undefined, metric: draft.metric ?? undefined } : {}),
        ...(draft.type === "BODY_WEIGHT" && form.weight === null ? { currentWeight: num(draft.currentWeight) } : {}),
      };
      if (skill && (!draft.startCm.trim() || !Number.isFinite(input.startCm))) {
        setErrors({ startCm: "Укажи замер" });
        return;
      }
      if (!skill && (!draft.target.trim() || !Number.isFinite(input.target))) {
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

  const types = group === "stretch" ? STRETCH_TYPES : TYPES;
  const meta = [...TYPES, ...STRETCH_TYPES].find((t) => t.type === draft.type);

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <Button size="lg" disabled={full} onClick={() => start(emptyDraft)}>
          {initialGroup ? <Target /> : <Plus />}
          {initialGroup ? "Поставить цель" : "Новая цель"}
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
              {types.map(({ type, label, icon: Icon }) => (
                <Button key={type} type="button" variant="outline" className="h-16 flex-col gap-1" onClick={() => set({ type, metric: null, exerciseId: null, target: "", stretchUnit: "SESSIONS", weeks: "4", skill: null, skillTitle: "", startCm: "" })}>
                  <Icon className="size-5 text-primary" />
                  {label}
                </Button>
              ))}
              {form.stretch && !initialGroup ? (
                <Button type="button" variant="ghost" className="col-span-2" onClick={() => setGroup(group === "stretch" ? "main" : "stretch")}>
                  {group === "stretch" ? "Другие цели" : "Растяжка"}
                </Button>
              ) : null}
            </div>
          ) : (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
            >
              {draft.type === "STRENGTH" || draft.type === "STRETCH_HOLD" ? (
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
                        const ex = pool.find((e) => e.id === v);
                        set({ exerciseId: v as string, metric: draft.type === "STRENGTH" && ex?.isBodyweight ? "MAX_REPS" : draft.metric, target: "" });
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
                  {exercise && draft.type === "STRENGTH" ? (
                    <div className="space-y-1.5">
                      <p className="text-sm font-medium">Что улучшаем</p>
                      <RadioGroup
                        aria-label="Что улучшаем"
                        aria-invalid={errors.metric ? true : undefined}
                        aria-describedby={errors.metric ? "goal-metric-error" : undefined}
                        value={draft.metric ?? ""} onValueChange={(v) => set({ metric: v as StrengthMetric, target: "" })} className="flex flex-wrap gap-2">
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

              {draft.type === "STRETCH_WEEKLY" ? (
                <div className="space-y-1.5">
                  <p className="text-sm font-medium">Что считаем</p>
                  <RadioGroup
                    aria-label="Что считаем"
                    aria-invalid={errors.stretchUnit ? true : undefined}
                    aria-describedby={errors.stretchUnit ? "goal-unit-error" : undefined}
                    value={draft.stretchUnit}
                    onValueChange={(v) => set({ stretchUnit: v as StretchUnit, target: "" })}
                    className="flex flex-wrap gap-2"
                  >
                    {UNITS.map((u) => (
                      <Radio.Root
                        key={u.unit}
                        value={u.unit}
                        aria-label={u.label}
                        className={cn(
                          "rounded-lg border px-3 py-1.5 text-sm transition-colors outline-none",
                          "hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
                          "data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground",
                        )}
                      >
                        {u.label}
                      </Radio.Root>
                    ))}
                  </RadioGroup>
                  <p className="text-xs text-muted-foreground">
                    {draft.stretchUnit === "SESSIONS" ? "Сессия — тренировка с растяжкой, заминка в силовой тоже считается" : "Сумма времени удержаний за неделю"}
                  </p>
                  <FieldError id="goal-unit-error" text={errors.stretchUnit} />
                </div>
              ) : null}

              {draft.type === "STRETCH_SKILL" ? (
                <>
                  <div className="space-y-1.5">
                    <p className="text-sm font-medium">Навык</p>
                    <RadioGroup
                      aria-label="Навык"
                      aria-invalid={errors.stretchSkill ? true : undefined}
                      aria-describedby={errors.stretchSkill ? "goal-skill-error" : undefined}
                      value={draft.skill ?? ""}
                      onValueChange={(v) => set({ skill: v as string })}
                      className="flex flex-col gap-1"
                    >
                      {[...STRETCH_SKILL_KEYS.map((k) => ({ key: k as string, label: STRETCH_SKILLS[k].title })), { key: "custom", label: "Свой навык" }].map((s) => (
                        <Radio.Root
                          key={s.key}
                          value={s.key}
                          aria-label={s.label}
                          className={cn(
                            "rounded-lg border px-3 py-2 text-left text-sm transition-colors outline-none",
                            "hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
                            "data-checked:border-primary data-checked:bg-primary/10",
                          )}
                        >
                          {s.label}
                        </Radio.Root>
                      ))}
                    </RadioGroup>
                    <FieldError id="goal-skill-error" text={errors.stretchSkill} />
                  </div>
                  {draft.skill === "custom" ? (
                    <div className="space-y-1.5">
                      <Label htmlFor="goal-skill-title">Название навыка</Label>
                      <Input id="goal-skill-title" maxLength={60} value={draft.skillTitle} aria-invalid={errors.skillTitle ? true : undefined} onChange={(e) => set({ skillTitle: e.target.value })} />
                      <FieldError id="goal-skill-title-error" text={errors.skillTitle} />
                    </div>
                  ) : null}
                  <div className="space-y-1.5">
                    <Label htmlFor="goal-start-cm">Замер сейчас, см</Label>
                    <p className="text-xs text-muted-foreground">
                      Мерка: {isSkillKey(draft.skill) ? STRETCH_SKILLS[draft.skill].measure : CUSTOM_SKILL_MEASURE}. Цель — 0 см
                    </p>
                    <Input
                      id="goal-start-cm"
                      inputMode="decimal"
                      className="max-w-32"
                      value={draft.startCm}
                      aria-invalid={errors.startCm ? true : undefined}
                      aria-describedby={errors.startCm ? "goal-start-cm-error" : undefined}
                      onChange={(e) => set({ startCm: e.target.value })}
                    />
                    <FieldError id="goal-start-cm-error" text={errors.startCm} />
                  </div>
                </>
              ) : null}

              {draft.type !== "STRETCH_SKILL" && (draft.type !== "STRENGTH" || draft.metric) ? (
                <div className="space-y-1.5">
                  <Label htmlFor="goal-target">{targetLabel(draft.type, draft.metric, draft.stretchUnit)}</Label>
                  {currentText ? <p className="text-sm text-muted-foreground">Сейчас: {currentText}</p> : null}
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      id="goal-target"
                      inputMode={draft.type === "STRETCH_HOLD" ? "text" : "decimal"}
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

              {draft.type === "STRETCH_WEEKLY" ? (
                <div className="space-y-1.5">
                  <Label htmlFor="goal-weeks">Сколько недель</Label>
                  <Input
                    id="goal-weeks"
                    inputMode="numeric"
                    className="max-w-32"
                    value={draft.weeks}
                    aria-invalid={errors.weeks ? true : undefined}
                    aria-describedby={errors.weeks ? "goal-weeks-error" : "goal-weeks-hint"}
                    onChange={(e) => set({ weeks: e.target.value })}
                  />
                  <p id="goal-weeks-hint" className="text-xs text-muted-foreground">
                    От {WEEKLY_WEEKS_MIN} до {WEEKLY_WEEKS_MAX}. Неделя — с понедельника; поставленная в пятницу или выходные цель начнётся со следующей
                  </p>
                  <FieldError id="goal-weeks-error" text={errors.weeks} />
                </div>
              ) : (
                <DeadlinePicker value={draft.deadline} onChange={(v) => set({ deadline: v })} today={form.today} error={errors.deadline} />
              )}
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
