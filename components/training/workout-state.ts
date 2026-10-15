import type { ActiveWorkout, ExerciseInfo, LastPerformance } from "@/lib/workouts/queries";
import type { WorkoutDraft } from "@/lib/workouts/schema";
import { link, normalizeGroups, unlink } from "@/lib/workouts/supersets";

/** Вес и повторы — строки: пользователь может временно стереть поле или ввести «82,5». */
export type SetState = {
  key: string;
  weight: string;
  reps: string;
  isWarmup: boolean;
  /** Запас повторов после подхода (RIR) — спрашивается, когда подход отмечен выполненным. */
  rir: number | null;
  completedAt: string | null;
};
/** `group` — суперсет/круг (lib/workouts/supersets.ts); хранится и без флага, чтобы автосохранение его не стёрло. */
export type ExerciseState = { key: string; exercise: ExerciseInfo; restSec: number; group: number | null; sets: SetState[] };
export type WorkoutState = {
  name: string;
  status: "PLANNED" | "IN_PROGRESS";
  startedAt: string | null;
  exercises: ExerciseState[];
};

let seq = 0;
const key = () => `k${Date.now().toString(36)}${(seq++).toString(36)}`;

const fmt = (n: number) => (n ? String(n) : "");

export function initState(workout: ActiveWorkout): WorkoutState {
  return {
    name: workout.name,
    status: workout.status,
    startedAt: workout.startedAt,
    exercises: workout.exercises.map((e) => ({
      key: key(),
      exercise: e.exercise,
      restSec: e.restSec,
      group: e.group ?? null,
      sets: e.sets.map((s) => ({ key: key(), ...s, weight: fmt(s.weight), reps: fmt(s.reps) })),
    })),
  };
}

export const parseNumber = (value: string) => {
  const n = Number.parseFloat(value.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

export function toDraft(state: WorkoutState): WorkoutDraft {
  return {
    name: state.name.trim() || "Тренировка",
    exercises: state.exercises.map((e) => ({
      exerciseId: e.exercise.id,
      restSec: e.restSec,
      group: e.group,
      sets: e.sets.map((s) => ({
        weight: parseNumber(s.weight),
        reps: Math.round(parseNumber(s.reps)),
        isWarmup: s.isWarmup,
        rir: s.rir,
        completedAt: s.completedAt,
      })),
    })),
  };
}

export type Action =
  | { type: "rename"; name: string }
  /** Подменить всё состояние — черновиком, восстановленным с устройства. */
  | { type: "replace"; state: WorkoutState }
  | { type: "started"; startedAt: string }
  | {
      type: "addExercises";
      exercises: { exercise: ExerciseInfo; restSec: number }[];
      last: LastPerformance;
      /** Куда вставить (перетаскивание из каталога); без него — в конец. */
      index?: number;
    }
  | { type: "removeExercise"; key: string }
  | { type: "moveExercise"; key: string; delta: -1 | 1 }
  | { type: "reorderExercise"; key: string; toIndex: number }
  | { type: "setRest"; key: string; restSec: number }
  /** Суперсет: связать упражнение со следующим / отсоединить следующее. */
  | { type: "linkNext"; key: string }
  | { type: "unlink"; key: string }
  | { type: "addSet"; key: string }
  | { type: "removeSet"; key: string; setKey: string }
  /**
   * «Вернуть» после удаления: подход встаёт после бывшего левого соседа `after`, если тот на месте, иначе перед
   * правым `before`, иначе на прежнюю позицию `index` — так порядок сохраняется при возврате нескольких подходов
   * в любом порядке. Повторный возврат ничего не меняет.
   */
  | { type: "restoreSet"; key: string; after: string | null; before: string | null; index: number; set: SetState }
  | { type: "updateSet"; key: string; setKey: string; patch: Partial<Pick<SetState, "weight" | "reps" | "isWarmup" | "rir">> }
  | { type: "toggleComplete"; key: string; setKey: string; now: string }
  /** Разминка перед рабочими подходами: заменяет невыполненные разминочные, выполненные не трогает. */
  | { type: "setWarmup"; key: string; sets: { weight: number; reps: number }[] }
  /** Совет помощника: невыполненные рабочие подходы — по совету (выполненные и разминка не трогаются). */
  | { type: "applySets"; key: string; sets: { weight: number; reps: number }[] }
  /** Замена от помощника: без выполненных подходов — на месте, иначе новое упражнение сразу после текущего. */
  | { type: "replaceExercise"; key: string; exercise: ExerciseInfo; restSec: number; last: LastPerformance }
  /** Пропуск от помощника (боль): невыполненные подходы убираются, выполненные остаются; ничего не сделано — упражнение целиком. */
  | { type: "skipPending"; key: string };

const DEFAULT_SETS = 3;

function mapExercise(state: WorkoutState, exerciseKey: string, fn: (e: ExerciseState) => ExerciseState): WorkoutState {
  return { ...state, exercises: state.exercises.map((e) => (e.key === exerciseKey ? fn(e) : e)) };
}

const workingSet = (s: { weight: number; reps: number }): SetState => ({
  key: key(),
  weight: fmt(s.weight),
  reps: fmt(s.reps),
  isWarmup: false,
  rir: null,
  completedAt: null,
});

/** Подходы — по прошлой тренировке («как в прошлый раз»), иначе 3 пустых. */
function newExercise(exercise: ExerciseInfo, restSec: number, last: LastPerformance): ExerciseState {
  const previous = last[exercise.id]?.sets ?? [];
  const template = previous.length ? previous : Array.from({ length: DEFAULT_SETS }, () => ({ weight: 0, reps: 0 }));
  return { key: key(), exercise, restSec, group: null, sets: template.map(workingSet) };
}

/** Список упражнений поменялся — группы суперсетов без «дыр» и одиночек. */
function regroup(state: WorkoutState): WorkoutState {
  const exercises = normalizeGroups(state.exercises);
  return exercises.every((e, i) => e === state.exercises[i]) ? state : { ...state, exercises };
}

const GROUPING: ReadonlySet<Action["type"]> = new Set(["replace", "addExercises", "removeExercise", "moveExercise", "reorderExercise", "replaceExercise", "skipPending"]);

export function reducer(state: WorkoutState, action: Action): WorkoutState {
  const next = apply(state, action);
  return GROUPING.has(action.type) ? regroup(next) : next;
}

function apply(state: WorkoutState, action: Action): WorkoutState {
  switch (action.type) {
    case "rename":
      return { ...state, name: action.name };

    case "replace":
      return action.state;

    case "started":
      return { ...state, status: "IN_PROGRESS", startedAt: action.startedAt };

    case "addExercises": {
      const added = action.exercises.map(({ exercise, restSec }) => newExercise(exercise, restSec, action.last));
      const at = Math.min(Math.max(action.index ?? state.exercises.length, 0), state.exercises.length);
      return { ...state, exercises: [...state.exercises.slice(0, at), ...added, ...state.exercises.slice(at)] };
    }

    case "removeExercise":
      return { ...state, exercises: state.exercises.filter((e) => e.key !== action.key) };

    case "moveExercise": {
      const from = state.exercises.findIndex((e) => e.key === action.key);
      const to = from + action.delta;
      if (from < 0 || to < 0 || to >= state.exercises.length) return state;
      const exercises = [...state.exercises];
      [exercises[from], exercises[to]] = [exercises[to], exercises[from]];
      return { ...state, exercises };
    }

    case "reorderExercise": {
      const from = state.exercises.findIndex((e) => e.key === action.key);
      const to = action.toIndex;
      if (from < 0 || from === to || to < 0 || to >= state.exercises.length) return state;
      const exercises = [...state.exercises];
      exercises.splice(to, 0, ...exercises.splice(from, 1));
      return { ...state, exercises };
    }

    case "linkNext":
    case "unlink": {
      const at = state.exercises.findIndex((e) => e.key === action.key);
      if (at < 0) return state;
      const exercises = (action.type === "linkNext" ? link : unlink)(state.exercises, at);
      return { ...state, exercises };
    }

    case "setRest":
      return mapExercise(state, action.key, (e) => ({ ...e, restSec: Math.min(600, Math.max(0, action.restSec)) }));

    case "addSet":
      return mapExercise(state, action.key, (e) => {
        const last = e.sets.at(-1);
        return {
          ...e,
          sets: [
            ...e.sets,
            { key: key(), weight: last?.weight ?? "", reps: last?.reps ?? "", isWarmup: false, rir: null, completedAt: null },
          ],
        };
      });

    case "removeSet":
      return mapExercise(state, action.key, (e) => ({ ...e, sets: e.sets.filter((s) => s.key !== action.setKey) }));

    case "restoreSet": {
      const target = state.exercises.find((e) => e.key === action.key);
      if (!target || target.sets.some((s) => s.key === action.set.key)) return state;
      return mapExercise(state, action.key, (e) => {
        const prev = e.sets.findIndex((s) => s.key === action.after);
        const next = e.sets.findIndex((s) => s.key === action.before);
        const at = prev >= 0 ? prev + 1 : next >= 0 ? next : Math.min(Math.max(action.index, 0), e.sets.length);
        return { ...e, sets: [...e.sets.slice(0, at), action.set, ...e.sets.slice(at)] };
      });
    }

    case "updateSet":
      return mapExercise(state, action.key, (e) => ({
        ...e,
        sets: e.sets.map((s) => (s.key === action.setKey ? { ...s, ...action.patch } : s)),
      }));

    case "setWarmup":
      return mapExercise(state, action.key, (e) => {
        const kept = e.sets.filter((s) => !(s.isWarmup && !s.completedAt));
        const at = kept.findIndex((s) => !s.isWarmup);
        const warmups: SetState[] = action.sets.map((w) => ({
          key: key(),
          weight: fmt(w.weight),
          reps: fmt(w.reps),
          isWarmup: true,
          rir: null,
          completedAt: null,
        }));
        const index = at === -1 ? kept.length : at;
        return { ...e, sets: [...kept.slice(0, index), ...warmups, ...kept.slice(index)] };
      });

    case "applySets":
      return mapExercise(state, action.key, (e) => {
        const kept = e.sets.filter((s) => s.isWarmup || s.completedAt);
        const done = kept.filter((s) => !s.isWarmup).length;
        return { ...e, sets: [...kept, ...action.sets.slice(done).map(workingSet)] };
      });

    case "replaceExercise": {
      const at = state.exercises.findIndex((e) => e.key === action.key);
      if (at < 0) return state;
      const started = state.exercises[at].sets.some((s) => s.completedAt);
      // На месте — в той же группе; после начатого — вне группы
      const fresh = { ...newExercise(action.exercise, action.restSec, action.last), group: started ? null : state.exercises[at].group };
      const exercises = [...state.exercises];
      exercises.splice(started ? at + 1 : at, started ? 0 : 1, fresh);
      return { ...state, exercises };
    }

    case "skipPending": {
      const done = state.exercises.find((e) => e.key === action.key)?.sets.some((s) => s.completedAt);
      if (!done) return { ...state, exercises: state.exercises.filter((e) => e.key !== action.key) };
      return mapExercise(state, action.key, (e) => ({ ...e, sets: e.sets.filter((s) => s.completedAt) }));
    }

    case "toggleComplete":
      return mapExercise(state, action.key, (e) => {
        const at = e.sets.findIndex((s) => s.key === action.setKey);
        if (at < 0) return e;
        const toggled = e.sets[at];
        const sets = e.sets.map((s, i) => (i === at ? { ...s, completedAt: s.completedAt ? null : action.now } : s));
        // Отметили рабочий подход — его вес и повторы переходят в следующий невыполненный, если тот пустой
        if (!toggled.completedAt && !toggled.isWarmup) {
          const next = sets.findIndex((s, i) => i > at && !s.completedAt && !s.isWarmup);
          if (next >= 0 && sets[next].weight === "" && sets[next].reps === "") {
            sets[next] = { ...sets[next], weight: toggled.weight, reps: toggled.reps };
          }
        }
        return { ...e, sets };
      });
  }
}

/** Час без отмеченных подходов — тренировку, похоже, забыли завершить. */
export const FORGOTTEN_AFTER_MS = 60 * 60 * 1000;

/** Время последнего отмеченного подхода, если с него прошло `FORGOTTEN_AFTER_MS` и больше; иначе null. */
export function forgottenSince(state: WorkoutState, now: number): string | null {
  if (state.status !== "IN_PROGRESS") return null;
  let last: string | null = null;
  for (const e of state.exercises) for (const s of e.sets) if (s.completedAt && (!last || s.completedAt > last)) last = s.completedAt;
  return last && now - Date.parse(last) >= FORGOTTEN_AFTER_MS ? last : null;
}

/** Все подходы упражнения отмечены выполненными (и подходы вообще есть). */
export const isExerciseDone = (e: ExerciseState) => e.sets.length > 0 && e.sets.every((s) => s.completedAt);

/** Упражнение, где подход отметили последним, — его не сворачиваем: там как раз выбирают запас повторов. */
export function lastWorkedKey(exercises: ExerciseState[]): string | null {
  let best: { key: string; at: string } | null = null;
  for (const e of exercises)
    for (const s of e.sets) if (s.completedAt && (!best || s.completedAt >= best.at)) best = { key: e.key, at: s.completedAt };
  return best?.key ?? null;
}

/**
 * Свёрнуто ли упражнение в редакторе: ручной выбор (`manual`), иначе — выполнено целиком и работа ушла в другое упражнение.
 * Свёрнутое — одна строка без полей ввода, чтобы длинная тренировка не мешала заполнять текущее.
 */
export const isCollapsed = (e: ExerciseState, lastKey: string | null, manual?: boolean) =>
  manual ?? (isExerciseDone(e) && e.key !== lastKey);
