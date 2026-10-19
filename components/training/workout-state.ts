import type { ActiveWorkout, ExerciseInfo, LastPerformance } from "@/lib/workouts/queries";
import type { WorkoutDraft } from "@/lib/workouts/schema";
import { afterSet, groupSize, link, MAX_GROUP, normalizeGroups, unlink } from "@/lib/workouts/supersets";
import { formatClock, isTimed, parseClock, type ExerciseKindName } from "@/lib/workouts/kinds";

/** Вес и повторы — строки: пользователь может временно стереть поле или ввести «82,5». */
export type SetState = {
  key: string;
  weight: string;
  reps: string;
  isWarmup: boolean;
  /** Запас повторов после подхода (RIR) — спрашивается, когда подход отмечен выполненным. */
  rir: number | null;
  /** Подход на время/кардио: время «мм:сс» и дистанция, км («5,2») — строки, как вес и повторы. */
  duration: string;
  distance: string;
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
/** Ключ нового упражнения, заданный заранее (замена — чтобы «Вернуть» нашло его). */
export const exerciseKey = key;

const fmt = (n: number) => (n ? String(n) : "");

/** Время и дистанция с сервера → строки полей: «1:30», «5,2». */
function timedFields(durationSec?: number | null, distanceM?: number | null) {
  return {
    duration: durationSec ? formatClock(durationSec) : "",
    distance: distanceM ? String(distanceM / 1000).replace(".", ",") : "",
  };
}

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
      sets: e.sets.map(({ durationSec, distanceM, ...s }) => ({ key: key(), ...s, ...timedFields(durationSec, distanceM), weight: fmt(s.weight), reps: fmt(s.reps) })),
    })),
  };
}

export const parseNumber = (value: string) => {
  const n = Number.parseFloat(value.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** Время подхода из поля: у кардио голое число — минуты. */
export const setDurationSec = (kind: ExerciseKindName | undefined, duration: string | undefined) =>
  parseClock(duration ?? "", { bareMinutes: kind === "CARDIO" });

export function toDraft(state: WorkoutState): WorkoutDraft {
  return {
    name: state.name.trim() || "Тренировка",
    exercises: state.exercises.map((e) => ({
      exerciseId: e.exercise.id,
      restSec: e.restSec,
      group: e.group,
      sets: e.sets.map((s) => ({
        // На время и кардио — без веса и повторов (их мог подставить план, помощник или задание тренера)
        weight: isTimed(e.exercise.kind) ? 0 : parseNumber(s.weight),
        reps: isTimed(e.exercise.kind) ? 0 : Math.round(parseNumber(s.reps)),
        durationSec: setDurationSec(e.exercise.kind, s.duration) || null,
        distanceM: Math.round(parseNumber(s.distance ?? "") * 1000) || null,
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
  | { type: "updateSet"; key: string; setKey: string; patch: Partial<Pick<SetState, "weight" | "reps" | "isWarmup" | "rir" | "duration" | "distance">> }
  | { type: "toggleComplete"; key: string; setKey: string; now: string }
  /** Разминка перед рабочими подходами: заменяет невыполненные разминочные, выполненные не трогает. */
  | { type: "setWarmup"; key: string; sets: { weight: number; reps: number }[] }
  /** Совет помощника: невыполненные рабочие подходы — по совету (выполненные и разминка не трогаются). */
  | { type: "applySets"; key: string; sets: { weight: number; reps: number }[] }
  /** Замена от помощника: без выполненных подходов — на месте, иначе новое упражнение сразу после текущего. */
  | { type: "replaceExercise"; key: string; exercise: ExerciseInfo; restSec: number; last: LastPerformance; newKey?: string }
  /** «Вернуть» после замены: новое убирается, исходное — на его место (если было заменено на месте). */
  | { type: "undoReplace"; newKey: string; original: ExerciseState }
  /** Пропуск от помощника (боль): невыполненные подходы убираются, выполненные остаются; ничего не сделано — упражнение целиком. */
  | { type: "skipPending"; key: string }
  /**
   * Веса подходов списком («Облегчить» и его «Вернуть»): подход должен быть на месте и не выполнен; с `expect` —
   * только если вес сейчас именно такой (правка вручную после «Облегчить» не затирается).
   */
  | { type: "setWeights"; weights: { key: string; setKey: string; weight: string; expect?: string }[] };

const DEFAULT_SETS = 3;

function mapExercise(state: WorkoutState, exerciseKey: string, fn: (e: ExerciseState) => ExerciseState): WorkoutState {
  return { ...state, exercises: state.exercises.map((e) => (e.key === exerciseKey ? fn(e) : e)) };
}

const workingSet = (s: { weight: number; reps: number; durationSec?: number | null; distanceM?: number | null }): SetState => ({
  key: key(),
  weight: fmt(s.weight),
  reps: fmt(s.reps),
  ...timedFields(s.durationSec, s.distanceM),
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

/** Подпись для таймера отдыха: какой подход следующий. */
function nextLabel(exercises: ExerciseState[], current: ExerciseState, justDone: SetState) {
  const remainingHere = current.sets.filter((s) => s.key !== justDone.key && !s.completedAt);
  if (remainingHere.length) return current.exercise.name;
  const index = exercises.findIndex((e) => e.key === current.key);
  const next = exercises.slice(index + 1).find((e) => e.sets.some((s) => !s.completedAt));
  return next?.exercise.name ?? null;
}

export type NextStep = { kind: "rest"; restSec: number; label: string } | { kind: "switch"; key: string; label: string } | null;

/**
 * Что после отметки подхода: отдых (с подписью, что дальше) или — внутри суперсета — переход к следующему
 * упражнению круга без таймера. Разминка и выключенные суперсеты — как раньше: отдых этого упражнения.
 */
export function nextStep(exercises: ExerciseState[], item: ExerciseState, set: SetState, supersets = true): NextStep {
  if (!supersets || set.isWarmup || item.group === null) {
    const label = nextLabel(exercises, item, set);
    return label ? { kind: "rest", restSec: item.restSec, label } : null;
  }
  const index = exercises.findIndex((e) => e.key === item.key);
  const step = afterSet(
    exercises.map((e) => ({ group: e.group, pending: e.sets.filter((s) => !s.completedAt && s.key !== set.key).length })),
    index,
  );
  if (step.kind === "switch") return { kind: "switch", key: exercises[step.next].key, label: exercises[step.next].exercise.name };
  if (step.next === null) return null;
  // После круга — отдых последнего упражнения группы
  let last = index;
  while (exercises[last + 1]?.group === item.group) last++;
  return { kind: "rest", restSec: exercises[last].restSec, label: exercises[step.next].exercise.name };
}

/** Список упражнений поменялся — группы суперсетов без «дыр» и одиночек. */
function regroup(state: WorkoutState): WorkoutState {
  const exercises = normalizeGroups(state.exercises);
  return exercises.every((e, i) => e === state.exercises[i]) ? state : { ...state, exercises };
}

const GROUPING: ReadonlySet<Action["type"]> = new Set(["replace", "addExercises", "removeExercise", "moveExercise", "reorderExercise", "replaceExercise", "undoReplace", "skipPending"]);

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
            {
              key: key(),
              weight: last?.weight ?? "",
              reps: last?.reps ?? "",
              duration: last?.duration ?? "",
              distance: last?.distance ?? "",
              isWarmup: false,
              rir: null,
              completedAt: null,
            },
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
          duration: "",
          distance: "",
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
      // Замена остаётся в том же суперсете — и на месте, и сразу после начатого упражнения;
      // полный круг (6) не растёт — новое встаёт сразу после круга, вне его
      const made = newExercise(action.exercise, action.restSec, action.last);
      const { group } = state.exercises[at];
      const full = started && group !== null && groupSize(state.exercises, at) >= MAX_GROUP;
      const fresh = { ...made, key: action.newKey ?? made.key, group: full ? null : group };
      const exercises = [...state.exercises];
      if (!started) exercises.splice(at, 1, fresh);
      else if (!full) exercises.splice(at + 1, 0, fresh);
      else {
        let end = at;
        while (exercises[end + 1]?.group === group) end++;
        exercises.splice(end + 1, 0, fresh);
      }
      return { ...state, exercises };
    }

    case "undoReplace": {
      const at = state.exercises.findIndex((e) => e.key === action.newKey);
      if (at < 0) return state;
      const exercises = [...state.exercises];
      const fresh = exercises[at];
      // Сделанные в новом подходы не теряются: оно остаётся с ними, невыполненные убираются
      const done = fresh.sets.filter((x) => x.completedAt);
      const kept = done.length ? [{ ...fresh, sets: done }] : [];
      if (exercises.some((e) => e.key === action.original.key)) exercises.splice(at, 1, ...kept);
      // Номер группы — от нового: пока висел тост, группы могли перенумероваться
      else exercises.splice(at, 1, { ...action.original, group: fresh.group }, ...kept);
      return { ...state, exercises };
    }

    case "skipPending": {
      const done = state.exercises.find((e) => e.key === action.key)?.sets.some((s) => s.completedAt);
      if (!done) return { ...state, exercises: state.exercises.filter((e) => e.key !== action.key) };
      return mapExercise(state, action.key, (e) => ({ ...e, sets: e.sets.filter((s) => s.completedAt) }));
    }

    case "setWeights": {
      const byKey = new Map(action.weights.map((w) => [`${w.key}:${w.setKey}`, w]));
      let changed = false;
      const exercises = state.exercises.map((e) => {
        let touched = false;
        const sets = e.sets.map((s) => {
          const w = byKey.get(`${e.key}:${s.key}`);
          if (!w || s.completedAt || (w.expect !== undefined && s.weight !== w.expect) || s.weight === w.weight) return s;
          touched = true;
          return { ...s, weight: w.weight };
        });
        if (!touched) return e;
        changed = true;
        return { ...e, sets };
      });
      return changed ? { ...state, exercises } : state;
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
          const empty = (s: SetState) => s.weight === "" && s.reps === "" && !s.duration && !s.distance;
          if (next >= 0 && empty(sets[next])) {
            sets[next] = { ...sets[next], weight: toggled.weight, reps: toggled.reps, duration: toggled.duration, distance: toggled.distance };
          }
        }
        return { ...e, sets };
      });
  }
}

/** Вес −10 % вниз по шагу помощника: 1 кг до 20 кг, дальше 2,5 кг. */
function lightened(weight: number) {
  const v = weight * 0.9;
  // Эпсилон — от погрешности умножения (90 · 0,9 не должно стать 80,99…)
  return v < 20 ? Math.floor(v + 1e-9) : Math.floor(v / 2.5 + 1e-9) * 2.5;
}

/**
 * «Облегчить» (красная зона WHOOP): невыполненные рабочие подходы с весом — −10 %. Выполненные, разминку, кардио/время
 * и упражнения из `skip` (задания тренера и программы) не трогает; подход, который нечем облегчить, пропускает.
 */
export function lightenPlan(state: WorkoutState, skip: ReadonlySet<string>): { key: string; setKey: string; from: string; to: string }[] {
  return state.exercises.flatMap((e) => {
    if (skip.has(e.exercise.id) || isTimed(e.exercise.kind)) return [];
    return e.sets.flatMap((s) => {
      const from = parseNumber(s.weight);
      if (s.completedAt || s.isWarmup || from <= 0) return [];
      const to = lightened(from);
      return to <= 0 || to >= from ? [] : [{ key: e.key, setKey: s.key, from: s.weight, to: String(to) }];
    });
  });
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

/** Подходы для живых индикаторов (полоса босса, Золотой гоблин): у подхода на время/кардио — время, повторы — 0. */
export function liveSets(state: WorkoutState) {
  return state.exercises.flatMap((e) =>
    e.sets.map((s) => ({
      completedAt: s.completedAt,
      isWarmup: s.isWarmup,
      rir: s.rir,
      reps: isTimed(e.exercise.kind) ? 0 : Math.round(parseNumber(s.reps)),
      durationSec: isTimed(e.exercise.kind) ? setDurationSec(e.exercise.kind, s.duration) : 0,
    })),
  );
}
