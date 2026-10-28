"use client";

import { Fragment, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, useTransition } from "react";
import { CircleAlert, CloudCheck, CloudOff, EllipsisVertical, Flag, Loader2, Play, RefreshCw, Trash2 } from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ExerciseBlock } from "@/components/training/exercise-block";
import { useClosingConfirmation } from "@/components/telegram/telegram-mini-app";
import { BossBar } from "@/components/boss/boss-bar";
import { useFlag } from "@/components/flags/flags-provider";
import { GoblinBanner } from "@/components/goblin/goblin-banner";
import { SupersetHeader, SupersetLink, SupersetPart } from "@/components/training/superset-frame";
import { canLink, groupLabels, groupSize } from "@/lib/workouts/supersets";
import { isTimed } from "@/lib/workouts/kinds";
import { ExerciseCatalog } from "@/components/training/exercise-catalog";
import type { BossView } from "@/lib/boss/queries";
import { ExercisePicker } from "@/components/training/exercise-picker";
import {
  NotificationToggle,
  RestTimerBar,
  RestTimerProvider,
  RestTimerSpacer,
  useRestTimer,
} from "@/components/training/rest-timer";
import { formatClock, formatDuration } from "@/lib/format";
import { pickInitial, pruneRecords, readRecord, refreshTrainingCache } from "@/components/training/offline-store";
import { useWakeLock } from "@/components/training/use-wake-lock";
import { useWorkoutSync, type SyncStatus } from "@/components/training/use-workout-sync";
import { DropIndicator, ExerciseDropList, SortableItem, WorkoutDnd } from "@/components/training/workout-dnd";
import {
  forgottenSince,
  initState,
  isCollapsed,
  lastWorkedKey,
  lightenPlan,
  liveSets,
  nextStep,
  reducer,
  toDraft,
  type ExerciseState,
  type WorkoutState,
  type SetState,
} from "@/components/training/workout-state";
import { FavoritesProvider } from "@/components/exercises/favorites";
import type { ExerciseItem } from "@/lib/exercises/queries";
import { unstable_rethrow } from "next/navigation";
import { cancelWorkoutAction } from "@/lib/workouts/actions";
import type { ProgressionHint } from "@/lib/progress/progression";
import type { ActiveWorkout, LastPerformance } from "@/lib/workouts/queries";
import { workoutTotals } from "@/lib/workouts/schema";
import { useAssistant } from "@/components/assistant/assistant";
import { prunePain, readPain } from "@/components/assistant/pain-store";
import type { SwapSource } from "@/components/training/exercise-swap-dialog";
import type { Wellbeing } from "@/lib/assistant/rules";
import type { Target } from "@/lib/coach/targets";
import { RecoveryLine, whoopZone } from "@/components/training/recovery-line";
import type { WhoopRecoveryView } from "@/lib/whoop/queries";
import { TogetherControl, type TogetherInitial } from "@/components/together/together-control";

type Props = {
  workout: ActiveWorkout;
  exercises: ExerciseItem[];
  last: LastPerformance;
  hints: Record<string, ProgressionHint>;
  /** Задания тренера по упражнениям (exerciseId → «от тренера: …»). */
  coachTargets: Record<string, string>;
  /** План календаря, из которого начата тренировка (если он ещё есть). */
  plan?: { key: string; title: string } | null;
  /** Босс недели (урон без этой тренировки). */
  boss?: BossView;
  /** Для помощника: задания тренера и цели своей прогрессии (exerciseId → цель). */
  targets?: Record<string, Target>;
  own?: Record<string, Target>;
  /** Восстановление WHOOP: строка зоны, при красной — «Облегчить»; жёлтая/красная — как самочувствие «устал». */
  whoop?: WhoopRecoveryView | null;
  /** Совместная тренировка (флаг together): открытая сессия на момент загрузки. */
  together?: { initial: TogetherInitial } | null;
};

export function WorkoutEditor(props: Props) {
  return (
    <FavoritesProvider exercises={props.exercises}>
      <RestTimerProvider>
        <Editor {...props} />
        <RestTimerSpacer />
        <RestTimerBar />
      </RestTimerProvider>
    </FavoritesProvider>
  );
}

const clockTime = new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" });

/** Час без отмеченных подходов: «тренировка ещё идёт?» — с кнопкой завершения. */
function ForgottenBanner({ state, onFinish }: { state: WorkoutState; onFinish: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  const since = forgottenSince(state, now);
  if (!since) return null;
  return (
    <div role="region" aria-label="Тренировка ещё идёт?" className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-streak/40 bg-streak/10 px-3 py-2 text-sm">
      <span>
        Последний подход был {formatDuration(Math.floor((now - Date.parse(since)) / 1000))} назад — тренировка ещё идёт?
      </span>
      <Button size="sm" variant="outline" onClick={onFinish}>
        Завершить
      </Button>
    </div>
  );
}

function Elapsed({ since }: { since: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const sec = Math.max(0, Math.floor((now - new Date(since).getTime()) / 1000));
  return (
    <span className="font-mono text-2xl font-black tabular-nums" data-testid="elapsed">
      {formatClock(sec)}
    </span>
  );
}

function SaveIndicator({ status, onSync }: { status: SyncStatus; onSync: () => void }) {
  if (status === "offline" || status === "error")
    return (
      <span className="flex flex-wrap items-center gap-2 text-xs" data-testid="save-status">
        {status === "offline" ? (
          <span className="flex items-center gap-1 text-streak">
            <CloudOff className="size-3.5" />
            Нет сети — сохранено на устройстве
          </span>
        ) : (
          <span className="flex items-center gap-1 text-destructive">
            <CircleAlert className="size-3.5" />
            Не сохранено на сервере
          </span>
        )}
        <Button variant="outline" size="xs" onClick={onSync}>
          <RefreshCw />
          Синхронизировать
        </Button>
      </span>
    );
  if (status === "saved")
    return (
      <span className="flex items-center gap-1 text-xs text-muted-foreground" data-testid="save-status">
        <CloudCheck className="size-3.5" />
        Сохранено
      </span>
    );
  return (
    <span className="flex items-center gap-1 text-xs text-muted-foreground" data-testid="save-status">
      <Loader2 className="size-3.5 animate-spin" />
      Сохранение…
    </span>
  );
}

const timeFmt = new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" });

const NO_TARGETS: Record<string, Target> = {};

/** «Облегчить» уже нажимали в этой тренировке — повторно не предлагаем (и после перезагрузки). */
const lightenedKey = (workoutId: string) => `hf:lightened:${workoutId}`;

function Editor({ workout, exercises, last, hints, coachTargets, plan, boss, targets = NO_TARGETS, own = NO_TARGETS, whoop, together }: Props) {
  const [state, dispatch] = useReducer(reducer, workout, initState);
  // Выполненные упражнения сворачиваются (isCollapsed); ручной выбор — поверх правила (ключ упражнения → свёрнуто)
  const [manualCollapse, setManualCollapse] = useState<ReadonlyMap<string, boolean>>(new Map());
  const lastKey = lastWorkedKey(state.exercises);
  const labels = groupLabels(state.exercises);
  // «Заменить» (тренажёр занят): каталог и прошлые результаты — те же, что у добавления упражнений
  const inWorkout = state.exercises.map((e) => e.exercise.id).join(",");
  const swap = useMemo<SwapSource>(
    () => ({ exercises, last, inWorkout: inWorkout ? inWorkout.split(",") : [], getPain: () => readPain(workout.id) }),
    [exercises, last, inWorkout, workout.id],
  );
  // Свернувшийся блок выше сдвинул бы страницу под пальцем — держим упражнение, где отметили подход, на месте
  const anchor = useRef<{ key: string; top: number } | null>(null);
  useLayoutEffect(() => {
    const at = anchor.current;
    if (!at) return;
    anchor.current = null;
    const el = document.querySelector(`[data-exercise-key="${at.key}"]`);
    const delta = el ? el.getBoundingClientRect().top - at.top : 0;
    if (Math.abs(delta) > 1) window.scrollBy(0, delta);
  });
  // Помощник видит упражнения тренировки и меняет их через тот же редьюсер (автосохранение и офлайн — как обычно)
  const assistant = useAssistant();
  const [wellbeing, setWellbeing] = useState<Wellbeing | null>(workout.wellbeing ?? null);
  // Жёлтая/красная зона WHOOP — как «устал» (без прибавки); явный выбор самочувствия важнее зоны
  const zone = whoopZone(whoop)?.zone ?? null;
  const zoneWellbeing: Wellbeing | null = zone === "yellow" || zone === "red" ? "TIRED" : null;
  const tired = (wellbeing ?? zoneWellbeing) === "TIRED";
  const { setWorkout } = assistant;
  useEffect(() => {
    if (!assistant.available) return;
    setWorkout({
      workoutId: workout.id,
      started: state.status === "IN_PROGRESS",
      wellbeing,
      zoneWellbeing,
      exercises: state.exercises,
      dispatch,
      last,
      hints,
      coach: targets,
      own,
      catalog: exercises,
      setWellbeing,
    });
  }, [assistant.available, setWorkout, workout.id, state.status, state.exercises, wellbeing, zoneWellbeing, last, hints, targets, own, exercises]);
  useEffect(() => () => setWorkout(null), [setWorkout]);
  const draft = useMemo(() => toDraft(state), [state]);
  const [goblin, setGoblin] = useState(workout.goblin ?? null);
  const sync = useWorkoutSync(workout.id, state, (error) => toast.error(error), setGoblin);
  const rest = useRestTimer();
  // Telegram переспросит перед закрытием, пока тренировка открыта
  useClosingConfirmation(true);
  useWakeLock(state.status === "IN_PROGRESS");

  // Золотой гоблин (флаг): бросок делает сервер при сохранении черновика — ответ приходит через useWorkoutSync
  const goblinOn = useFlag("golden_goblin");
  const formatsOn = useFlag("workout_formats");
  const [pending, startTransition] = useTransition();
  const [finishOpen, setFinishOpen] = useState(false);
  // Тренировку забыли завершить — в диалоге предлагаем время последнего подхода
  const [forgotten, setForgotten] = useState<string | null>(null);
  const openFinish = () => {
    setForgotten(forgottenSince(state, Date.now()));
    setFinishOpen(true);
  };
  const [cancelOpen, setCancelOpen] = useState(false);

  // «Облегчить» (красная зона): −10 % невыполненным рабочим подходам, кроме заданий тренера/программы; один раз
  const [lightened, setLightened] = useState(true);
  useEffect(() => {
    // localStorage читается после монтирования (на сервере его нет)
    let done = false;
    try {
      done = localStorage.getItem(lightenedKey(workout.id)) !== null;
    } catch {}
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLightened(done);
  }, [workout.id]);
  const lightenSkip = useMemo(() => new Set(Object.keys(targets)), [targets]);
  const canLighten = zone === "red" && !lightened && lightenPlan(state, lightenSkip).length > 0;
  const lighten = () => {
    const changes = lightenPlan(state, lightenSkip);
    try {
      localStorage.setItem(lightenedKey(workout.id), "1");
    } catch {}
    setLightened(true);
    if (!changes.length) return;
    dispatch({ type: "setWeights", weights: changes.map((c) => ({ key: c.key, setKey: c.setKey, weight: c.to })) });
    toast("Облегчено", {
      action: {
        label: "Вернуть",
        // Вес, поправленный вручную после «Облегчить», не затирается
        onClick: () =>
          dispatch({ type: "setWeights", weights: changes.map((c) => ({ key: c.key, setKey: c.setKey, weight: c.from, expect: c.to })) }),
      },
    });
  };
  // Отмена тренировки из плана по умолчанию пропускает и план на сегодня (иначе он так и висит «Сегодня по плану»)
  const [skipPlan, setSkipPlan] = useState(true);

  // Черновик на устройстве новее серверного (не успели отправить без сети) — поднимаем его.
  // Только после монтирования: на сервере localStorage нет, иначе разъехалась бы гидрация.
  const { restore } = sync;
  useEffect(() => {
    // Без сети страница могла прийти из кэша и быть устаревшей — чужие черновики не трогаем.
    if (navigator.onLine) {
      pruneRecords(workout.id);
      prunePain(workout.id);
      refreshTrainingCache();
    }
    const rec = readRecord(workout.id);
    const picked = pickInitial(workout, rec);
    if (rec && picked.state) {
      dispatch({ type: "replace", state: picked.state });
      restore(rec);
      toast.info("Восстановлено с устройства — отправим на сервер, когда будет сеть");
    }
  }, [workout, restore]);

  const totals = workoutTotals(draft.exercises.map((e, i) => ({ ...e, kind: state.exercises[i]?.exercise.kind })));
  const pendingSets = draft.exercises.reduce((n, e) => n + e.sets.filter((s) => !s.completedAt).length, 0);
  const added = useMemo(() => new Set(state.exercises.map((e) => e.exercise.id)), [state.exercises]);

  const addExercises = (items: ExerciseItem[], index?: number) =>
    dispatch({
      type: "addExercises",
      exercises: items.map((e) => ({
        exercise: {
          id: e.id,
          name: e.name,
          muscleGroups: e.muscleGroups,
          stretchZones: e.stretchZones,
          isBodyweight: e.isBodyweight,
          kind: e.kind,
        },
        restSec: e.defaultRestSec,
      })),
      last,
      index,
    });

  /** Старт сразу на устройстве (секундомер идёт и без сети), на сервер — через очередь синхронизации. */
  const start = () => {
    const at = new Date().toISOString();
    dispatch({ type: "started", startedAt: at });
    sync.queueStart(at);
  };

  const onComplete = (item: ExerciseState, set: SetState) => {
    if (state.status === "PLANNED") start();
    const top = document.querySelector(`[data-exercise-key="${item.key}"]`)?.getBoundingClientRect().top;
    if (top !== undefined) anchor.current = { key: item.key, top };
    // Развёрнутое вручную выполненное упражнение снова сворачивается, когда работа ушла дальше
    setManualCollapse((prev) => new Map([...prev].filter(([, collapsed]) => collapsed)));
    const step = nextStep(state.exercises, item, set, formatsOn);
    if (step?.kind === "switch") {
      rest.skip();
      toast(`Дальше: ${step.label}`);
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      requestAnimationFrame(() =>
        document
          .querySelector(`[data-exercise-key="${step.key}"]`)
          ?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" }),
      );
      anchor.current = null;
      return;
    }
    if (step) rest.start(step.restSec, step.label);
  };

  /** Завершение: при успехе уводит на сводку; без сети — встаёт в очередь со временем с устройства. */
  const finish = (at = new Date().toISOString()) =>
    startTransition(async () => {
      rest.skip();
      const outcome = await sync.queueFinish(at);
      if (outcome !== "sent") setFinishOpen(false);
    });

  const cancel = () =>
    startTransition(async () => {
      try {
        await sync.settle();
        rest.skip();
        await cancelWorkoutAction(workout.id, Boolean(plan) && skipPlan);
      } catch (err) {
        // Успешная отмена завершается redirect() — на клиенте это отклонённый промис, не сбой сети.
        unstable_rethrow(err);
        toast.error("Нет сети — отменить тренировку можно, когда появится связь");
        setCancelOpen(false);
      }
    });

  return (
    <WorkoutDnd
      exercises={state.exercises}
      onReorder={(key, toIndex) => dispatch({ type: "reorderExercise", key, toIndex })}
      onDropFromCatalog={(exercise, index) => addExercises([exercise], index)}
    >
      {(dropIndex) => (
        // На ПК справа — каталог упражнений; на мобильных — диалог «Добавить упражнение»
        <div className="mx-auto max-w-2xl lg:grid lg:max-w-6xl lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-6">
          <div className="min-w-0 space-y-4">
            <div className="rounded-xl border bg-card p-4">
              <div className="flex items-start gap-2">
                <Input
                  value={state.name}
                  onChange={(e) => dispatch({ type: "rename", name: e.target.value })}
                  aria-label="Название тренировки"
                  className="h-auto border-none bg-transparent px-0 text-xl font-black shadow-none focus-visible:ring-0 dark:bg-transparent"
                  maxLength={80}
                />
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={<Button variant="ghost" size="icon-sm" aria-label="Действия с тренировкой" />}
                  >
                    <EllipsisVertical />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuItem variant="destructive" onClick={() => setCancelOpen(true)}>
                      <Trash2 />
                      Отменить тренировку
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                {state.status === "IN_PROGRESS" && state.startedAt ? (
                  <Elapsed since={state.startedAt} />
                ) : (
                  <span className="text-sm text-muted-foreground">Соберите тренировку и нажмите «Начать»</span>
                )}
                <SaveIndicator status={sync.status} onSync={() => void sync.syncNow()} />
              </div>
              <ForgottenBanner state={state} onFinish={openFinish} />

              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground tabular-nums">
                <span>
                  Подходы: <b className="text-foreground">{totals.sets}</b>
                </span>
                <span>
                  Повторы: <b className="text-foreground">{totals.reps}</b>
                </span>
                <span>
                  Объём: <b className="text-foreground">{totals.volume.toLocaleString("ru-RU")} кг</b>
                </span>
              </div>

              {boss ? <BossBar boss={boss} sets={liveSets(state)} /> : null}

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {state.status === "PLANNED" ? (
                  <Button
                    size="lg"
                    disabled={state.exercises.length === 0 || pending}
                    onClick={start}
                  >
                    <Play />
                    Начать
                  </Button>
                ) : null}
                <NotificationToggle />
                {together && state.status === "IN_PROGRESS" ? <TogetherControl workoutId={workout.id} initial={together.initial} /> : null}
              </div>
            </div>

            <RecoveryLine view={whoop} onLighten={canLighten ? lighten : undefined} />

            {goblinOn && goblin ? <GoblinBanner spawnedAt={goblin.spawnedAt} sets={liveSets(state)} /> : null}

            <ExerciseDropList empty={state.exercises.length === 0}>
              {state.exercises.map((item, index) => {
                const collapsed = isCollapsed(item, lastKey, manualCollapse.get(item.key));
                const next = state.exercises[index + 1];
                const grouped = formatsOn && item.group !== null;
                const startsGroup = grouped && state.exercises[index - 1]?.group !== item.group;
                return (
                  <Fragment key={item.key}>
                    {dropIndex === index ? <DropIndicator /> : null}
                    {startsGroup ? <SupersetHeader size={groupSize(state.exercises, index)} /> : null}
                    <SortableItem id={item.key} label={item.exercise.name}>
                      {(handle) => (
                        <SupersetPart grouped={grouped}>
                          <ExerciseBlock
                            item={item}
                            index={index}
                            total={state.exercises.length}
                            last={last[item.exercise.id]}
                            hint={tired ? undefined : hints[item.exercise.id]}
                            coachTarget={coachTargets[item.exercise.id]}
                            onAsk={assistant.available && !isTimed(item.exercise.kind) ? () => assistant.openExercise(item.exercise.id) : undefined}
                            dispatch={dispatch}
                            onComplete={onComplete}
                            handle={handle}
                            collapsed={collapsed}
                            onToggleCollapsed={() => setManualCollapse((prev) => new Map(prev).set(item.key, !collapsed))}
                            groupLabel={formatsOn ? labels[index] : null}
                            swap={swap}
                          />
                        </SupersetPart>
                      )}
                    </SortableItem>
                    {formatsOn && next ? (
                      <SupersetLink
                        names={[item.exercise.name, next.exercise.name]}
                        linked={item.group !== null && next.group === item.group}
                        canLink={canLink(state.exercises, index)}
                        onLink={() => dispatch({ type: "linkNext", key: item.key })}
                        onUnlink={() => dispatch({ type: "unlink", key: item.key })}
                      />
                    ) : null}
                  </Fragment>
                );
              })}
              {dropIndex !== null && dropIndex === state.exercises.length && state.exercises.length > 0 ? (
                <DropIndicator />
              ) : null}
            </ExerciseDropList>

            <ExercisePicker
              exercises={exercises}
              alreadyAdded={added}
              onAdd={(items) => addExercises(items)}
              className="lg:hidden"
            />

            {sync.queuedFinish ? (
              <section
                aria-label="Завершение ждёт сети"
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-streak/50 bg-streak/10 p-4"
              >
                <p className="text-sm">
                  <span className="font-semibold">Тренировка завершена на устройстве в {timeFmt.format(new Date(sync.queuedFinish))}.</span>{" "}
                  <span className="text-muted-foreground">
                    Отправим, когда появится сеть, — время завершения сохранится.
                  </span>
                </p>
                <Button variant="outline" onClick={() => void sync.syncNow()}>
                  <RefreshCw />
                  Отправить сейчас
                </Button>
              </section>
            ) : state.status === "IN_PROGRESS" ? (
              <Button size="lg" className="w-full" onClick={openFinish} disabled={pending}>
                <Flag />
                Завершить тренировку
              </Button>
            ) : null}

            <AlertDialog open={finishOpen} onOpenChange={setFinishOpen}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Завершить тренировку?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Выполнено подходов: {totals.sets}, объём {totals.volume.toLocaleString("ru-RU")} кг.
                    {pendingSets > 0 ? ` Неотмеченные подходы (${pendingSets}) не попадут в историю.` : ""}
                    {forgotten && state.startedAt
                      ? ` Последний подход отмечен в ${clockTime.format(new Date(forgotten))} — завершить тогда же? Длительность будет ${formatDuration(
                          Math.max(0, Math.floor((Date.parse(forgotten) - Date.parse(state.startedAt)) / 1000)),
                        )}.`
                      : ""}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={pending}>Продолжить</AlertDialogCancel>
                  {forgotten ? (
                    <>
                      <Button variant="outline" onClick={() => finish()} disabled={pending}>
                        Завершить сейчас
                      </Button>
                      <AlertDialogAction onClick={() => finish(forgotten)} disabled={pending}>
                        {pending ? <Loader2 className="animate-spin" /> : null}
                        По последнему подходу
                      </AlertDialogAction>
                    </>
                  ) : (
                    <AlertDialogAction onClick={() => finish()} disabled={pending}>
                      {pending ? <Loader2 className="animate-spin" /> : null}
                      Завершить
                    </AlertDialogAction>
                  )}
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Отменить тренировку?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Все введённые подходы будут удалены, XP не начислится.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                {plan ? (
                  <Label className="flex items-center gap-2 font-normal">
                    <Checkbox checked={skipPlan} onCheckedChange={(v) => setSkipPlan(v === true)} />
                    Пропустить «{plan.title}» в календаре на сегодня
                  </Label>
                ) : null}
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={pending}>Назад</AlertDialogCancel>
                  <AlertDialogAction variant="destructive" onClick={cancel} disabled={pending}>
                    Отменить тренировку
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>

          <ExerciseCatalog exercises={exercises} alreadyAdded={added} onAdd={(e) => addExercises([e])} />
        </div>
      )}
    </WorkoutDnd>
  );
}
