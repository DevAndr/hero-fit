import { z } from "zod";
import type { GoalStatus, GoalType, RecordType, StretchUnit } from "@/generated/prisma/enums";
import { addDays } from "@/lib/dates";
import { formatClock, plural } from "@/lib/format";
import { localMidnight } from "@/lib/progress/weekly-streak";
import { isSkillKey, skillName, STRETCH_SKILL_KEYS } from "@/lib/stretching/skills";
import { goalStretchWeeks, WEEKLY_WEEKS_MAX, WEEKLY_WEEKS_MIN } from "@/lib/goals/stretch-weekly";

/** Личные цели — чистые правила (спека docs/superpowers/specs/2026-10-11-goals-design.md). */

export const GOALS_ACTIVE_MAX = 5;
export const GOAL_CHEST_XP = 100;

export type GoalRow = {
  id: string;
  type: GoalType;
  exerciseId: string | null;
  metric: RecordType | null;
  target: number;
  startValue: number;
  deadline: string | null;
  status: GoalStatus;
  /** Только STRETCH_WEEKLY: норма — сессии или минуты. */
  stretchUnit: StretchUnit | null;
  /** Только STRETCH_SKILL: ключ навыка или null у своего (тогда `skillTitle`). */
  stretchSkill?: string | null;
  skillTitle?: string | null;
  createdAt: Date;
  achievedAt: Date | null;
  chestOpenedAt: Date | null;
};

type Shape = { type: GoalType; startValue: number; target: number };

const onStep = (step: number) => (v: number) => Math.abs(v / step - Math.round(v / step)) < 1e-9;

/** Типы, которые принимает форма постановки. */
const INPUT_TYPES = ["STRENGTH", "WORKOUTS", "STREAK", "HOURS", "BODY_WEIGHT", "STRETCH_WEEKLY", "STRETCH_HOLD", "STRETCH_SKILL"] as const;
export const isInputGoalType = (t: GoalType): t is GoalInput["type"] => (INPUT_TYPES as readonly string[]).includes(t);

/** Цели группы «Растяжка» (под флагом `stretching`). */
export const isStretchGoal = (t: GoalType) => t === "STRETCH_WEEKLY" || t === "STRETCH_HOLD" || t === "STRETCH_SKILL";

/** Рекорд, по которому считается цель: силовая — выбранная метрика, удержание — MAX_DURATION. */
export function goalRecordType(g: { type: GoalType; metric: RecordType | null }): RecordType | null {
  if (g.type === "STRETCH_HOLD") return "MAX_DURATION";
  return g.type === "STRENGTH" ? g.metric : null;
}

export const goalSchema = z
  .object({
    type: z.enum(INPUT_TYPES),
    exerciseId: z.string().min(1).optional(),
    metric: z.enum(["ONE_RM", "MAX_WEIGHT", "MAX_REPS"]).optional(),
    target: z.number().finite(),
    deadline: z.string().nullable(),
    /** Только STRETCH_WEEKLY: что считаем и сколько недель (срок вычисляет сервер — воскресенье последней недели). */
    stretchUnit: z.enum(["SESSIONS", "MINUTES"]).optional(),
    weeks: z.number({ error: `От ${WEEKLY_WEEKS_MIN} до ${WEEKLY_WEEKS_MAX} недель` }).optional(),
    /** Только STRETCH_SKILL: навык из списка или своё название, стартовый замер (см до цели; цель — 0). */
    stretchSkill: z.enum(STRETCH_SKILL_KEYS as [string, ...string[]]).optional(),
    skillTitle: z.string().trim().min(1, "Назови навык").max(60, "Не длиннее 60 символов").optional(),
    startCm: z.number({ error: "Замер — от 0,5 до 200 см" }).optional(),
    /** Только BODY_WEIGHT без взвешиваний: текущий вес пишется вместе с целью. */
    currentWeight: z.number({ error: "Вес — от 30 до 300 кг" }).min(30, "Вес — от 30 до 300 кг").max(300, "Вес — от 30 до 300 кг").optional(),
  })
  .superRefine((g, ctx) => {
    const bad = (message: string, path = "target") => ctx.addIssue({ code: "custom", message, path: [path] });
    const within = (min: number, max: number, step: number) => {
      if (g.target < min || g.target > max || !onStep(step)(g.target)) bad(`От ${fmt(min)} до ${fmt(max)}`);
    };
    switch (g.type) {
      case "STRENGTH":
        if (!g.exerciseId) bad("Выбери упражнение", "exerciseId");
        if (!g.metric) bad("Выбери, что улучшаем", "metric");
        if (g.metric === "MAX_REPS") within(1, 500, 1);
        else within(1, 500, 0.5);
        break;
      case "STRETCH_HOLD":
        if (!g.exerciseId) bad("Выбери упражнение", "exerciseId");
        within(10, 600, 1);
        break;
      case "STRETCH_SKILL":
        if (!g.stretchSkill && !g.skillTitle) bad("Выбери навык или назови свой", "stretchSkill");
        if (g.target !== 0) bad("Цель — 0 см");
        if (g.startCm === undefined || g.startCm < 0.5 || g.startCm > 200 || !onStep(0.5)(g.startCm)) bad("Замер — от 0,5 до 200 см, шаг 0,5", "startCm");
        break;
      case "STRETCH_WEEKLY":
        if (!g.stretchUnit) bad("Выбери, что считаем", "stretchUnit");
        else if (g.stretchUnit === "SESSIONS") within(1, 7, 1);
        else within(5, 300, 1);
        if (g.weeks === undefined || !Number.isInteger(g.weeks) || g.weeks < WEEKLY_WEEKS_MIN || g.weeks > WEEKLY_WEEKS_MAX) {
          bad(`От ${WEEKLY_WEEKS_MIN} до ${WEEKLY_WEEKS_MAX} недель`, "weeks");
        }
        break;
      case "WORKOUTS":
        within(1, 1000, 1);
        break;
      case "STREAK":
        within(1, 104, 1);
        break;
      case "HOURS":
        within(1, 2000, 1);
        break;
      case "BODY_WEIGHT":
        within(30, 300, 0.1);
        break;
    }
  });

export type GoalInput = z.infer<typeof goalSchema>;

/** Метрики силовых целей (рекорды кардио и упражнений на время в целях не участвуют). */
export type StrengthMetric = "ONE_RM" | "MAX_WEIGHT" | "MAX_REPS";
export const isStrengthMetric = (m: string | null | undefined): m is StrengthMetric => m === "ONE_RM" || m === "MAX_WEIGHT" || m === "MAX_REPS";


function addMonths(day: string, n: number) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
}

/** Срок: местная дата, не раньше завтра и не позже чем через 2 года от `today`. */
export function deadlineSchema(today: string) {
  const min = addDays(today, 1);
  const max = addMonths(today, 24);
  return z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Неверная дата")
    .refine((d) => d >= min, "Срок — не раньше завтра")
    .refine((d) => d <= max, "Срок — не дальше 2 лет")
    .nullable();
}

/** «Поставить снова» для навыка: стартовый замер — последний замер прежней цели (если не 0), иначе её старт. */
export function againSkillStartCm(startValue: number, lastCm: number | null): number | undefined {
  if (lastCm !== null && lastCm > 0) return lastCm;
  return startValue > 0 ? startValue : undefined;
}

/** «Ниже — лучше»: снижение веса (старт выше цели) и навык (см до цели, цель — 0). */
const losing = (g: Shape) => (g.type === "BODY_WEIGHT" && g.startValue > g.target) || g.type === "STRETCH_SKILL";

/** У регулярности значение — доля засчитанных недель (0…1), норма недели — в `target`. */
export function isAchieved(goal: Shape, current: number): boolean {
  if (goal.type === "STRETCH_WEEKLY") return current >= 1;
  return losing(goal) ? current <= goal.target : current >= goal.target;
}

/** Доля пути от старта к цели, 0…1. */
export function goalProgress(goal: Shape, current: number): number {
  if (isAchieved(goal, current)) return 1;
  if (goal.type === "STRETCH_WEEKLY") return Math.max(0, current);
  const span = goal.target - goal.startValue;
  if (span === 0) return 0;
  return Math.min(1, Math.max(0, (current - goal.startValue) / span));
}

/** Конец срока — начало дня после `deadline` в поясе пользователя. */
export function deadlineEnd(deadline: string, tz: string): Date {
  return localMidnight(addDays(deadline, 1), tz);
}

/** Срок цели ещё не вышел в момент `at` (финиш тренировки, взвешивание, перенос срока). */
export function goalOpenAt(goal: { deadline: string | null }, at: Date, tz: string): boolean {
  return !goal.deadline || at < deadlineEnd(goal.deadline, tz);
}

/** Темп — линейный; у регулярности прогресс ступенчатый (недели), её темп — строка «эта неделя», поэтому null. */
export function paceStatus(
  goal: { type?: GoalType; createdAt: Date; deadline: string | null },
  progress: number,
  now: Date,
  tz: string,
): "ahead" | "behind" | null {
  if (!goal.deadline || goal.type === "STRETCH_WEEKLY") return null;
  const start = goal.createdAt.getTime();
  const total = deadlineEnd(goal.deadline, tz).getTime() - start;
  if (total <= 0) return null;
  const expected = Math.min(1, Math.max(0, (now.getTime() - start) / total));
  return progress < expected - 0.1 ? "behind" : "ahead";
}

/** Текст отказа при постановке или null. `current` — текущее значение того, что улучшаем. */
export function canCreate(
  input: Pick<GoalInput, "type" | "metric" | "target"> & Pick<Partial<GoalInput>, "stretchSkill" | "skillTitle">,
  ctx: { active: { type: GoalType; stretchSkill?: string | null; skillTitle?: string | null }[]; current: number; isBodyweight: boolean; hasWeight: boolean },
): string | null {
  if (ctx.active.length >= GOALS_ACTIVE_MAX) return `Максимум ${GOALS_ACTIVE_MAX} активных целей`;
  if (input.type === "BODY_WEIGHT" && ctx.active.some((g) => g.type === "BODY_WEIGHT")) return "Цель по весу уже есть";
  if (input.type === "STRETCH_SKILL") {
    // Один навык — одна активная цель (свой навык — по названию без учёта регистра)
    const same = ctx.active.some(
      (g) =>
        g.type === "STRETCH_SKILL" &&
        (isSkillKey(input.stretchSkill) ? g.stretchSkill === input.stretchSkill : !g.stretchSkill && sameTitle(g.skillTitle, input.skillTitle)),
    );
    return same ? "Цель по этому навыку уже есть" : null;
  }
  if (input.type === "STRENGTH" && ctx.isBodyweight && input.metric !== "MAX_REPS") return "Для упражнения со своим весом — только повторы";
  const counter = input.type === "WORKOUTS" || input.type === "HOURS" || input.type === "STRETCH_WEEKLY";
  if (input.type === "BODY_WEIGHT") {
    if (ctx.current === input.target) return "Уже достигнуто";
  } else if (!counter && ctx.current >= input.target) {
    return "Уже достигнуто";
  }
  return null;
}

const sameTitle = (a?: string | null, b?: string | null) => (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();

function fmt(n: number) {
  return String(Math.round(n * 10) / 10).replace(".", ",");
}

/** `tz` — пояс пользователя: у регулярности по нему считается число недель (из createdAt и срока). */
export function goalTitle(
  g: {
    type: GoalType;
    metric: RecordType | null;
    target: number;
    startValue: number;
    exerciseName?: string | null;
    stretchUnit?: StretchUnit | null;
    stretchSkill?: string | null;
    skillTitle?: string | null;
    createdAt?: Date;
    deadline?: string | null;
  },
  tz = "UTC",
): string {
  const n = g.target;
  switch (g.type) {
    case "STRENGTH": {
      const name = g.exerciseName ?? "Упражнение";
      if (g.metric === "MAX_REPS") return `${name} — ${n} ${plural(n, "повтор", "повтора", "повторов")}`;
      return `${name} — ${g.metric === "ONE_RM" ? "1ПМ " : ""}${fmt(n)} кг`;
    }
    case "WORKOUTS":
      return `${n} ${plural(n, "тренировка", "тренировки", "тренировок")}`;
    case "STREAK":
      return `Серия ${n} ${plural(n, "неделя", "недели", "недель")}`;
    case "HOURS":
      return `${n} ${plural(n, "час", "часа", "часов")} в зале`;
    case "BODY_WEIGHT":
      return `Вес тела — ${fmt(n)} кг ${g.startValue > n ? "↓" : "↑"}`;
    case "STRETCH_HOLD":
      return `${g.exerciseName ?? "Упражнение"} — удержание ${formatClock(n)}`;
    case "STRETCH_WEEKLY": {
      const norm =
        g.stretchUnit === "MINUTES"
          ? `${n} ${plural(n, "минута", "минуты", "минут")} растяжки в неделю`
          : `${n} ${plural(n, "растяжка", "растяжки", "растяжек")} в неделю`;
      const weeks = g.createdAt ? goalStretchWeeks({ createdAt: g.createdAt, deadline: g.deadline ?? null }, tz).length : 0;
      return weeks ? `${norm} · ${weeks} ${plural(weeks, "неделя", "недели", "недель")}` : norm;
    }
    case "STRETCH_SKILL":
      return skillName(g);
  }
}

/** «эта неделя: 1/3», у минут — «эта неделя: 20/60 мин». */
export function weeklyWeekText(unit: StretchUnit | null, week: { value: number; target: number }): string {
  return `эта неделя: ${week.value}/${week.target}${unit === "MINUTES" ? " мин" : ""}`;
}

/** Цель, выполненная тренировкой (FinishMeta.goals.achieved → сводка и лента). */
export type FinishGoal = {
  id: string;
  type: GoalType;
  title: string;
  /** Заголовок без килограммов (для hideWeights): у силовых по весу/1ПМ — имя упражнения; null — как title. */
  feedTitle: string | null;
};

export type FinishGoals = {
  achieved: FinishGoal[];
  /** Невыполненные цели, которые эта тренировка продвинула: доли пути до и после. */
  advanced: { id: string; title: string; before: number; after: number }[];
};

export type GoalSuggestion = GoalInput & { title: string };

/** Подсказки для пустой страницы целей. */
export function suggestGoals(
  s: { topExercise: { id: string; name: string; workWeight: number } | null; streak: number },
  today: string,
): GoalSuggestion[] {
  const out: GoalSuggestion[] = [];
  const with_ = (g: GoalInput, exerciseName?: string): GoalSuggestion => ({
    ...g,
    title: goalTitle({ type: g.type, metric: g.metric ?? null, target: g.target, startValue: 0, exerciseName }),
  });
  if (s.topExercise && s.topExercise.workWeight > 0) {
    const target = Math.ceil((s.topExercise.workWeight * 1.1) / 2.5) * 2.5;
    out.push(with_({ type: "STRENGTH", exerciseId: s.topExercise.id, metric: "MAX_WEIGHT", target, deadline: null }, s.topExercise.name));
  }
  out.push(with_({ type: "STREAK", target: s.streak + 4, deadline: null }));
  out.push(with_({ type: "WORKOUTS", target: 20, deadline: addMonths(today, 2) }));
  return out;
}

export function goalNotice(kind: "achieved" | "reminder" | "failed" | "weekFailed", title: string, progress: number): { title: string; body: string } {
  const pct = Math.floor(progress * 100);
  switch (kind) {
    case "achieved":
      return { title: "🎯 Цель достигнута", body: title };
    case "reminder":
      return { title: "До срока цели 7 дней", body: `${title}: пройдено ${pct} %` };
    case "failed":
      return { title: "Срок цели вышел", body: `${title}: пройдено ${pct} %. Поставить снова?` };
    case "weekFailed":
      return { title: `Неделя без растяжки — цель «${title}» не выполнена`, body: `Пройдено ${pct} %. Поставить снова?` };
  }
}

/** «87,5 / 100 кг», «3 / 12 недель», вес тела — «84,8 → 80 кг», регулярность — «2 из 4 недель» (по `weekly`). */
export function goalValueText(
  g: { type: GoalType; metric: RecordType | null },
  current: number,
  target: number,
  weekly?: { done: number; total: number } | null,
): string {
  const c = fmt(current);
  switch (g.type) {
    case "STRENGTH":
      return g.metric === "MAX_REPS" ? `${c} / ${target} ${plural(target, "повтор", "повтора", "повторов")}` : `${c} / ${fmt(target)} кг`;
    case "WORKOUTS":
      return `${c} / ${target} ${plural(target, "тренировки", "тренировок", "тренировок")}`;
    case "STREAK":
      return `${c} / ${target} ${plural(target, "недели", "недель", "недель")}`;
    case "HOURS":
      return `${c} / ${target} ч`;
    case "BODY_WEIGHT":
      return `${c} → ${fmt(target)} кг`;
    case "STRETCH_HOLD":
      return `${formatClock(current)} / ${formatClock(target)}`;
    case "STRETCH_WEEKLY":
      return weekly ? `${weekly.done} из ${weekly.total} ${plural(weekly.total, "недели", "недель", "недель")}` : `${Math.floor(current * 100)} %`;
    case "STRETCH_SKILL":
      return `Осталось ${c} см`;
  }
}

const dayMonth = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", timeZone: "UTC" });
const dayMonthYear = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/** «до 31 декабря · осталось 81 день»; `today` — местная дата пользователя. */
export function deadlineText(deadline: string, today: string): string {
  const d = new Date(`${deadline}T12:00:00Z`);
  const date = deadline.slice(0, 4) === today.slice(0, 4) ? dayMonth.format(d) : dayMonthYear.format(d).replace(/\s*г\.$/, "");
  const left = Math.round((d.getTime() - new Date(`${today}T12:00:00Z`).getTime()) / 86_400_000);
  if (left < 0) return `до ${date} · срок вышел`;
  if (left === 0) return `до ${date} · последний день`;
  return `до ${date} · ${plural(left, "остался", "осталось", "осталось")} ${left} ${plural(left, "день", "дня", "дней")}`;
}
