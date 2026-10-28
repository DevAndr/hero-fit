"use client";

import { SupersetLabel } from "@/components/training/superset-frame";
import { ArrowDown, ArrowLeftRight, ArrowUp, Check, ChevronDown, ChevronUp, EllipsisVertical, MessageCircleQuestion, Minus, Plus, Timer, Trash2, X } from "lucide-react";
import { Fragment, useEffect, useRef, useState, type Dispatch, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { selectOnFocus } from "@/components/ui/select-on-focus";
import { HintBadge } from "@/components/stats/hint-badge";
import { LottiePlayer, preloadLottie, prefersReducedMotion } from "@/components/lottie/lottie-player";
import { PlateTools } from "@/components/training/plate-tools";
import type { ProgressionHint } from "@/lib/progress/progression";
import type { LastPerformance } from "@/lib/workouts/queries";
import { MUSCLE_GROUP_LABELS } from "@/lib/muscle-groups";
import { cardioWarning, typoWarning, type TypoReference } from "@/lib/workouts/typo";
import { isTimed, timedSetText, type ExerciseKindName } from "@/lib/workouts/kinds";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/telegram/webapp";
import { ExerciseSwapDialog, type SwapSource } from "@/components/training/exercise-swap-dialog";
import { exerciseKey, isExerciseDone, parseNumber, setDurationSec, type Action, type ExerciseState, type SetState } from "@/components/training/workout-state";
import type { ExerciseItem } from "@/lib/exercises/queries";

/** Образец для «точно столько?»: прошлый выполненный рабочий подход здесь, иначе тот же по счёту в прошлый раз. */
function typoReference(sets: SetState[], index: number, workingNumber: number, last?: LastPerformance[string]): TypoReference | null {
  for (let j = index - 1; j >= 0; j--) {
    const s = sets[j];
    if (s.completedAt && !s.isWarmup && (parseNumber(s.weight) || parseNumber(s.reps))) {
      return { weight: parseNumber(s.weight), reps: parseNumber(s.reps), source: "set" };
    }
  }
  const prev = last?.sets[workingNumber - 1] ?? last?.sets.at(-1);
  return prev ? { ...prev, source: "last" } : null;
}

const formatSets = (sets: { weight: number; reps: number }[]) =>
  sets.map((s) => (s.weight ? `${s.weight}×${s.reps}` : `${s.reps}`)).join(", ");

/** Свёрнутое выполненное упражнение: одна строка без полей ввода, тап — развернуть. */
function CollapsedExercise({
  item,
  handle,
  onToggle,
  groupLabel,
}: {
  item: ExerciseState;
  handle?: ReactNode;
  onToggle: () => void;
  groupLabel?: string | null;
}) {
  const kind: ExerciseKindName = item.exercise.kind ?? "REPS";
  const working = item.sets.filter((s) => !s.isWarmup);
  const summary = isTimed(kind)
    ? working.map((s) => timedSetText(kind, { durationSec: setDurationSec(kind, s.duration), distanceM: Math.round(parseNumber(s.distance) * 1000) })).join(", ")
    : formatSets(working.map((s) => ({ weight: parseNumber(s.weight), reps: Math.round(parseNumber(s.reps)) })));
  return (
    <section className="rounded-xl border bg-card" aria-label={item.exercise.name} data-exercise-key={item.key} data-collapsed>
      <div className="flex items-center gap-2 p-3">
        {handle}
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={false}
          aria-label={`${item.exercise.name}: выполнено, развернуть`}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left"
        >
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Check className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold">
              <SupersetLabel label={groupLabel} />
              {item.exercise.name}
            </span>
            <span className="block truncate text-xs text-muted-foreground tabular-nums">
              {item.sets.length}/{item.sets.length}
              {working.length ? ` · ${summary}` : null}
            </span>
          </span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
        </button>
      </div>
    </section>
  );
}

export function ExerciseBlock({
  item,
  index,
  total,
  last,
  hint,
  coachTarget,
  onAsk,
  dispatch,
  onComplete,
  handle,
  collapsed = false,
  onToggleCollapsed,
  groupLabel,
  swap,
}: {
  item: ExerciseState;
  index: number;
  total: number;
  last?: LastPerformance[string];
  hint?: ProgressionHint;
  /** «от тренера: 4 × 8 · 60 кг» — задание активного тренера по этому упражнению шаблона. */
  coachTarget?: string;
  /** Открыть помощника с этим упражнением (только если помощник доступен). */
  onAsk?: () => void;
  dispatch: Dispatch<Action>;
  /** Вызывается, когда подход отмечен выполненным (запуск таймера отдыха). */
  onComplete: (item: ExerciseState, set: SetState) => void;
  /** Ручка перетаскивания (на ПК). */
  handle?: ReactNode;
  /** Свёрнуто (выполненное упражнение — см. `isCollapsed`). */
  collapsed?: boolean;
  /** Свернуть/развернуть вручную; кнопка «Свернуть» — только у выполненного упражнения. */
  onToggleCollapsed?: () => void;
  /** Метка суперсета A1/A2 (только при флаге workout_formats). */
  groupLabel?: string | null;
  /** Каталог для «Заменить» (тренажёр занят); без него пункта нет. */
  swap?: SwapSource;
}) {
  const { exercise } = item;
  const kind: ExerciseKindName = exercise.kind ?? "REPS";
  // На время и кардио: без веса, повторов, разминки и запаса повторов; у кардио своё «точно столько?» (cardioWarning)
  const timed = isTimed(kind);
  const columns = kind === "TIME" ? "grid-cols-[2.5rem_1fr_2.75rem_2rem]" : "grid-cols-[2.5rem_1fr_1fr_2.75rem_2rem]";
  const doneCount = item.sets.filter((s) => s.completedAt).length;
  // Подходы, у которых сейчас играет анимация «готово» вместо кнопки
  // Строка, где сейчас печатают: «точно столько?» не мигает на промежуточных цифрах
  const [editing, setEditing] = useState<string | null>(null);
  const [celebrating, setCelebrating] = useState<ReadonlySet<string>>(new Set());
  const stopCelebrating = (setKey: string) =>
    setCelebrating((prev) => {
      const next = new Set(prev);
      next.delete(setKey);
      return next;
    });
  useEffect(() => preloadLottie("success"), []);

  const [swapOpen, setSwapOpen] = useState(false);
  const swappedTo = useRef<string | null>(null);
  const freshHeading = (key: string) => document.querySelector<HTMLElement>(`[data-exercise-key="${key}"] h3`);
  const replaceWith = (target: ExerciseItem) => {
    const newKey = exerciseKey();
    swappedTo.current = newKey;
    const original = item;
    setSwapOpen(false);
    dispatch({
      type: "replaceExercise",
      key: item.key,
      exercise: { id: target.id, name: target.name, muscleGroups: target.muscleGroups, stretchZones: target.stretchZones, isBodyweight: target.isBodyweight, kind: target.kind },
      restSec: target.defaultRestSec,
      last: swap?.last ?? {},
      newKey,
    });
    // Один тост на все замены: «Вернуть» прошлой замены после следующей уже не сработало бы
    toast(`Заменено: ${target.name}`, { id: "exercise-swap", action: { label: "Вернуть", onClick: () => dispatch({ type: "undoReplace", newKey, original }) } });
    // Фокус — на новое упражнение. Замена на месте: блок с диалогом размонтирован — фокус вручную;
    // новое следом за начатым: диалог при закрытии вернёт фокус сам (finalFocus)
    requestAnimationFrame(() => freshHeading(newKey)?.focus());
  };

  if (collapsed && onToggleCollapsed) return <CollapsedExercise item={item} handle={handle} onToggle={onToggleCollapsed} groupLabel={groupLabel} />;

  return (
    <section className="rounded-xl border bg-card" aria-label={exercise.name} data-exercise-key={item.key}>
      <header className="flex items-start gap-2 p-4 pb-2">
        {handle}
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold outline-none" tabIndex={-1}>
            <SupersetLabel label={groupLabel} />
            {exercise.name}
          </h3>
          <p className="text-xs text-muted-foreground">
            {exercise.muscleGroups.map((g) => MUSCLE_GROUP_LABELS[g]).join(" · ")} · {doneCount}/{item.sets.length}
          </p>
          {last?.sets.length ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Прошлый раз:{" "}
              <span className="text-foreground">
                {timed ? last.sets.map((s) => timedSetText(kind, s)).join(", ") : formatSets(last.sets)}
              </span>
            </p>
          ) : null}
          {coachTarget ? <p className="mt-1 text-sm font-medium text-primary">{coachTarget}</p> : null}
          {hint && !timed ? <HintBadge hint={hint} className="mt-1.5 w-fit" /> : null}
        </div>

        <div className="flex items-center gap-0.5 rounded-lg border px-1 text-xs" aria-label="Отдых между подходами">
          <button
            type="button"
            className="p-1 text-muted-foreground hover:text-foreground"
            onClick={() => dispatch({ type: "setRest", key: item.key, restSec: item.restSec - 15 })}
            aria-label="Уменьшить отдых"
          >
            <Minus className="size-3" />
          </button>
          <span className="flex items-center gap-1 tabular-nums">
            <Timer className="size-3" />
            {item.restSec}с
          </span>
          <button
            type="button"
            className="p-1 text-muted-foreground hover:text-foreground"
            onClick={() => dispatch({ type: "setRest", key: item.key, restSec: item.restSec + 15 })}
            aria-label="Увеличить отдых"
          >
            <Plus className="size-3" />
          </button>
        </div>

        {onToggleCollapsed && isExerciseDone(item) ? (
          <Button variant="ghost" size="icon-sm" aria-expanded aria-label="Свернуть упражнение" onClick={onToggleCollapsed}>
            <ChevronUp />
          </Button>
        ) : null}
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Действия с упражнением" />}>
            <EllipsisVertical />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {onAsk ? (
              <>
                  <DropdownMenuItem onClick={onAsk}>
                    <MessageCircleQuestion />
                    Спросить помощника
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
              </>
            ) : null}
            <DropdownMenuItem disabled={index === 0} onClick={() => dispatch({ type: "moveExercise", key: item.key, delta: -1 })}>
              <ArrowUp />
              Выше
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={index === total - 1}
              onClick={() => dispatch({ type: "moveExercise", key: item.key, delta: 1 })}
            >
              <ArrowDown />
              Ниже
            </DropdownMenuItem>
            {swap ? (
              <DropdownMenuItem onClick={() => setSwapOpen(true)}>
                <ArrowLeftRight />
                Заменить
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={() => dispatch({ type: "removeExercise", key: item.key })}>
              <Trash2 />
              Убрать из тренировки
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {swap ? (
          <ExerciseSwapDialog
            open={swapOpen}
            onOpenChange={setSwapOpen}
            item={item}
            source={swap}
            onReplace={replaceWith}
            finalFocus={() => {
              const key = swappedTo.current;
              swappedTo.current = null;
              return (key && freshHeading(key)) || true;
            }}
            onSkip={() => {
              setSwapOpen(false);
              dispatch({ type: "skipPending", key: item.key });
            }}
          />
        ) : null}
      </header>

      <div className="px-2 pb-2">
        <div className={cn("grid items-center gap-2 px-2 pb-1 text-[11px] uppercase tracking-wide text-muted-foreground", columns)}>
          <span>#</span>
          {kind === "CARDIO" ? <span>км</span> : null}
          {timed ? <span>время</span> : <span>{exercise.isBodyweight ? "доп. кг" : "кг"}</span>}
          {timed ? null : <span>повт.</span>}
          <span className="sr-only">Выполнен</span>
          <span className="sr-only">Удалить</span>
        </div>

        {item.sets.map((set, i) => {
          const done = Boolean(set.completedAt);
          const workingNumber = item.sets.slice(0, i + 1).filter((s) => !s.isWarmup).length;
          const typo =
            set.isWarmup || editing === set.key || kind === "TIME"
              ? null
              : kind === "CARDIO"
                ? cardioWarning({ durationSec: setDurationSec(kind, set.duration), distanceM: Math.round(parseNumber(set.distance) * 1000) })
                : typoWarning(
                    { weight: parseNumber(set.weight), reps: parseNumber(set.reps) },
                    typoReference(item.sets, i, workingNumber, last),
                  );
          return (
            <Fragment key={set.key}>
              <div
                data-testid="set-row"
                data-done={done || undefined}
                onFocus={() => setEditing(set.key)}
                onBlur={() => setEditing(null)}
                className={cn("grid items-center gap-2 rounded-lg px-2 py-1 transition-colors", columns, done && "bg-primary/10")}
              >
                {timed ? (
                  <span className="flex h-8 items-center justify-center text-sm font-bold text-muted-foreground tabular-nums">{i + 1}</span>
                ) : (
                  <button
                    type="button"
                    title="Нажмите, чтобы отметить как разминочный"
                    aria-label={`Подход ${i + 1}: ${set.isWarmup ? "разминка" : "рабочий"}`}
                    onClick={() => dispatch({ type: "updateSet", key: item.key, setKey: set.key, patch: { isWarmup: !set.isWarmup } })}
                    className={cn(
                      "h-8 rounded-md text-sm font-bold tabular-nums",
                      set.isWarmup ? "text-xp" : "text-muted-foreground",
                    )}
                  >
                    {set.isWarmup ? "Р" : workingNumber}
                  </button>
                )}
                {kind === "CARDIO" ? (
                  <Input
                    {...selectOnFocus}
                    inputMode="decimal"
                    value={set.distance}
                    placeholder="0"
                    aria-label={`Дистанция, подход ${i + 1}`}
                    onChange={(e) => dispatch({ type: "updateSet", key: item.key, setKey: set.key, patch: { distance: e.target.value } })}
                    className="h-9 text-center tabular-nums"
                  />
                ) : null}
                {timed ? (
                  <Input
                    {...selectOnFocus}
                    inputMode="decimal"
                    value={set.duration}
                    placeholder="0:00"
                    aria-label={`Время, подход ${i + 1}`}
                    title="Минуты и секунды: 1:30, 1,30 или 90"
                    onChange={(e) => dispatch({ type: "updateSet", key: item.key, setKey: set.key, patch: { duration: e.target.value } })}
                    onBlur={(e) => {
                      // «1,30» и «90» → «1:30»: видно, как поняли ввод
                      const sec = setDurationSec(kind, e.target.value);
                      if (sec > 0 && e.target.value !== timedSetText("TIME", { durationSec: sec }))
                        dispatch({ type: "updateSet", key: item.key, setKey: set.key, patch: { duration: timedSetText("TIME", { durationSec: sec }) } });
                    }}
                    className="h-9 text-center tabular-nums"
                  />
                ) : null}
                {timed ? null : (
                  <>
                <Input
                  {...selectOnFocus}
                  inputMode="decimal"
                  value={set.weight}
                  placeholder="0"
                  aria-label={`Вес, подход ${i + 1}`}
                  onChange={(e) => dispatch({ type: "updateSet", key: item.key, setKey: set.key, patch: { weight: e.target.value } })}
                  className="h-9 text-center tabular-nums"
                />
                <Input
                  {...selectOnFocus}
                  inputMode="numeric"
                  value={set.reps}
                  placeholder="0"
                  aria-label={`Повторы, подход ${i + 1}`}
                  onChange={(e) => dispatch({ type: "updateSet", key: item.key, setKey: set.key, patch: { reps: e.target.value } })}
                  className="h-9 text-center tabular-nums"
                />
                  </>
                )}
                <Button
                  type="button"
                  size="icon"
                  variant={done ? "default" : "outline"}
                  aria-pressed={done}
                  aria-label={`Подход ${i + 1} выполнен`}
                  onClick={() => {
                    dispatch({ type: "toggleComplete", key: item.key, setKey: set.key, now: new Date().toISOString() });
                    if (done) stopCelebrating(set.key);
                    else {
                      haptic("light");
                      onComplete(item, set);
                      if (!prefersReducedMotion()) setCelebrating((prev) => new Set(prev).add(set.key));
                    }
                  }}
                  className={cn(
                    "relative size-9",
                    done && celebrating.has(set.key) && "border-transparent bg-transparent hover:bg-transparent",
                  )}
                >
                  {done && celebrating.has(set.key) ? (
                    <LottiePlayer
                      name="success"
                      speed={1.4}
                      onComplete={() => stopCelebrating(set.key)}
                      fallback={<Check className="text-primary" />}
                      className="pointer-events-none absolute -inset-3"
                    />
                  ) : (
                    <Check />
                  )}
                </Button>
                <button
                  type="button"
                  aria-label={`Удалить подход ${i + 1}`}
                  onClick={() => {
                    dispatch({ type: "removeSet", key: item.key, setKey: set.key });
                    toast("Подход удалён", {
                      action: {
                        label: "Вернуть",
                        onClick: () =>
                          dispatch({
                            type: "restoreSet",
                            key: item.key,
                            after: item.sets[i - 1]?.key ?? null,
                            before: item.sets[i + 1]?.key ?? null,
                            index: i,
                            set,
                          }),
                      },
                    });
                  }}
                  className="flex h-8 items-center justify-center text-muted-foreground hover:text-destructive"
                >
                  <X className="size-4" />
                </button>
              </div>
              {typo ? (
                <p className="-mt-0.5 px-2 pl-12 text-xs text-streak" data-testid="typo-warning">
                  {typo}
                </p>
              ) : null}
              {done && !set.isWarmup && !timed ? (
                <RirPicker
                  value={set.rir}
                  label={`Запас повторов, подход ${i + 1}`}
                  onChange={(rir) => dispatch({ type: "updateSet", key: item.key, setKey: set.key, patch: { rir } })}
                />
              ) : null}
            </Fragment>
          );
        })}

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-1 w-full text-muted-foreground"
          onClick={() => dispatch({ type: "addSet", key: item.key })}
        >
          <Plus />
          Подход
        </Button>
        {exercise.isBodyweight || timed ? null : <PlateTools item={item} dispatch={dispatch} />}
      </div>
    </section>
  );
}

const RIR_OPTIONS = [
  { value: 0, label: "0", hint: "до отказа" },
  { value: 1, label: "1", hint: "ещё 1 повтор" },
  { value: 2, label: "2", hint: "ещё 2 повтора" },
  { value: 3, label: "3", hint: "ещё 3 повтора" },
  { value: 4, label: "4+", hint: "легко, 4 и больше" },
];

/** Сколько повторов осталось в запасе (RIR) — по нему подсказка «Пора увеличить вес» срабатывает точнее. */
function RirPicker({ value, label, onChange }: { value: number | null; label: string; onChange: (rir: number | null) => void }) {
  return (
    <div role="group" aria-label={label} className="flex items-center gap-1 px-2 pb-1 pl-[3.25rem] text-xs">
      <span className="mr-1 text-muted-foreground">Запас повторов</span>
      {RIR_OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          title={o.hint}
          aria-label={`Запас: ${o.hint}`}
          aria-pressed={value === o.value}
          onClick={() => onChange(value === o.value ? null : o.value)}
          className={cn(
            "h-6 min-w-7 rounded-md border px-1.5 font-semibold tabular-nums transition-colors",
            value === o.value ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
