import type { ActiveWorkout, ExerciseInfo, LastPerformance } from "@/lib/workouts/queries";
import type { WorkoutDraft } from "@/lib/workouts/schema";

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
export type ExerciseState = { key: string; exercise: ExerciseInfo; restSec: number; sets: SetState[] };
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
  | { type: "addSet"; key: string }
  | { type: "removeSet"; key: string; setKey: string }
  | { type: "updateSet"; key: string; setKey: string; patch: Partial<Pick<SetState, "weight" | "reps" | "isWarmup" | "rir">> }
  | { type: "toggleComplete"; key: string; setKey: string; now: string }
  /** Разминка перед рабочими подходами: заменяет невыполненные разминочные, выполненные не трогает. */
  | { type: "setWarmup"; key: string; sets: { weight: number; reps: number }[] };

const DEFAULT_SETS = 3;

function mapExercise(state: WorkoutState, exerciseKey: string, fn: (e: ExerciseState) => ExerciseState): WorkoutState {
  return { ...state, exercises: state.exercises.map((e) => (e.key === exerciseKey ? fn(e) : e)) };
}

export function reducer(state: WorkoutState, action: Action): WorkoutState {
  switch (action.type) {
    case "rename":
      return { ...state, name: action.name };

    case "replace":
      return action.state;

    case "started":
      return { ...state, status: "IN_PROGRESS", startedAt: action.startedAt };

    case "addExercises": {
      const added = action.exercises.map(({ exercise, restSec }) => {
        // Подходы заполняем по прошлой тренировке — «как в прошлый раз».
        const previous = action.last[exercise.id]?.sets ?? [];
        const template = previous.length ? previous : Array.from({ length: DEFAULT_SETS }, () => ({ weight: 0, reps: 0 }));
        return {
          key: key(),
          exercise,
          restSec,
          sets: template.map((s) => ({
            key: key(),
            weight: fmt(s.weight),
            reps: fmt(s.reps),
            isWarmup: false,
            rir: null,
            completedAt: null,
          })),
        };
      });
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

    case "toggleComplete":
      return mapExercise(state, action.key, (e) => ({
        ...e,
        sets: e.sets.map((s) =>
          s.key === action.setKey ? { ...s, completedAt: s.completedAt ? null : action.now } : s,
        ),
      }));
  }
}
