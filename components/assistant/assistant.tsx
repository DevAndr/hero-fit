"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type PointerEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import { Loader2, MessageCircleQuestion, X } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import type { Action, ExerciseState } from "@/components/training/workout-state";
import { askAssistantAction, saveWellbeingAction } from "@/lib/assistant/actions";
import { reachGoal } from "@/lib/analytics/reach";
import { clampPos, DRAG_THRESHOLD, parsePos, popoverSide, type FloatPos } from "@/lib/assistant/position";
import { painRelated, replacementCandidates, repsOrWeight, weightAdvice, type PainSpot, type Wellbeing } from "@/lib/assistant/rules";
import {
  BACK,
  checkinReply,
  exerciseMenuReply,
  MENU_BUTTONS,
  painReply,
  repsReply,
  replaceReply,
  staticReply,
  weightReply,
  type Button as ReplyButton,
  type NodeId,
  type Reply,
} from "@/lib/assistant/scenarios";
import type { Target } from "@/lib/coach/targets";
import type { ExerciseItem } from "@/lib/exercises/queries";
import type { ProgressionHint } from "@/lib/progress/progression";
import type { LastPerformance } from "@/lib/workouts/queries";
import { createWorkoutAction } from "@/lib/workouts/actions";
import { cn } from "@/lib/utils";
import { readPain, writePain } from "./pain-store";
import { flushWellbeing, sendWellbeing } from "./wellbeing-queue";

/** Что редактор тренировки сообщает помощнику: упражнения, данные для советов и dispatch редьюсера. */
export type WorkoutBridge = {
  workoutId: string;
  started: boolean;
  wellbeing: Wellbeing | null;
  exercises: ExerciseState[];
  dispatch: Dispatch<Action>;
  last: LastPerformance;
  hints: Record<string, ProgressionHint>;
  coach: Record<string, Target>;
  own: Record<string, Target>;
  catalog: ExerciseItem[];
  /** Ответ чек-ина — редактор помнит его до перезагрузки (на сервер пишет действие). */
  setWellbeing: (value: Wellbeing) => void;
};

type Ctx = {
  available: boolean;
  setWorkout: (bridge: WorkoutBridge | null) => void;
  openExercise: (exerciseId: string) => void;
};

const AssistantContext = createContext<Ctx>({ available: false, setWorkout: () => {}, openExercise: () => {} });

export const useAssistant = () => useContext(AssistantContext);

type Message = { id: number; from: "me" | "bot"; text: string; why?: string; buttons?: ReplyButton[] };

const today = () => new Date().toISOString().slice(0, 10);
const checkinKey = (workoutId: string) => `hf:checkin:${workoutId}`;

function checkinDone(workoutId: string) {
  try {
    return sessionStorage.getItem(checkinKey(workoutId)) === "1";
  } catch {
    return false;
  }
}

function markCheckin(workoutId: string) {
  try {
    sessionStorage.setItem(checkinKey(workoutId), "1");
  } catch {
    // не критично — чек-ин просто спросят ещё раз
  }
}

/**
 * Умный помощник (спека 2026-10-12-smart-coach): плавающая кнопка и чат на сценариях. `available` — флаг
 * smart_coach и выключатель в /settings (считает layout; сервер в действиях проверяет сам).
 */
export function AssistantProvider({ available, children }: { available: boolean; children: ReactNode }) {
  const [workout, setWorkout] = useState<WorkoutBridge | null>(null);
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState<NodeId>("menu");
  const [session, setSession] = useState(0);
  // Закрыли чат — фокус обратно на кнопку «Помощник» (а не в начало страницы)
  const [refocus, setRefocus] = useState(false);

  const openExercise = useCallback((exerciseId: string) => {
    setStart(`exercise:${exerciseId}`);
    setSession((n) => n + 1);
    setOpen(true);
  }, []);

  const value = useMemo(() => ({ available, setWorkout, openExercise }), [available, openExercise]);

  // Чек-ин, отвеченный без сети, — досылаем при появлении сети и при открытии кабинета
  useEffect(() => {
    if (!available) return;
    const flush = () => void flushWellbeing(saveWellbeingAction);
    flush();
    window.addEventListener("online", flush);
    return () => window.removeEventListener("online", flush);
  }, [available]);

  return (
    <AssistantContext.Provider value={value}>
      {children}
      {available ? (
        // ym-hide-content — Вебвизор не пишет текст чата: боль (данные о здоровье) и веса
        <div className="ym-hide-content">
          {open ? (
            <Chat
              key={session}
              start={start}
              workout={workout}
              onClose={() => {
                setOpen(false);
                setRefocus(true);
              }}
            />
          ) : (
            <Launcher
              focus={refocus}
              workout={workout}
              onOpen={(node) => {
                setStart(node);
                setSession((n) => n + 1);
                setOpen(true);
              }}
            />
          )}
        </div>
      ) : null}
    </AssistantContext.Provider>
  );
}

/** Над таймером отдыха, если он виден (`--rest-timer-clear` ставит таймер). */
const FLOAT =
  "fixed right-4 z-40 bottom-[max(calc(9.5rem+env(safe-area-inset-bottom)+var(--tg-safe-bottom)),var(--rest-timer-clear,0px))] lg:right-6 lg:bottom-[max(1.5rem,var(--rest-timer-clear,0px))]";

function Launcher({ workout, onOpen, focus }: { workout: WorkoutBridge | null; onOpen: (node: NodeId) => void; focus: boolean }) {
  const [hideCheckin, setHideCheckin] = useState(true);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (focus) button.current?.focus();
  }, [focus]);
  const workoutId = workout?.workoutId;
  const needCheckin = Boolean(workout?.started && workout.wellbeing === null);
  useEffect(() => {
    // sessionStorage читается после монтирования (на сервере его нет)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHideCheckin(workoutId ? checkinDone(workoutId) : true);
  }, [workoutId]);

  const drag = useDraggable();

  return (
    <div className={cn(drag.style ? "fixed z-40" : FLOAT, "flex gap-2", drag.className)} style={drag.style}>
      {workout && needCheckin && !hideCheckin ? (
        <CheckIn
          workout={workout}
          onDone={(pain) => {
            setHideCheckin(true);
            if (pain) onOpen("pain");
          }}
        />
      ) : null}
      <Button
        ref={button}
        size="icon-lg"
        className="size-12 touch-none rounded-full shadow-lg"
        aria-label="Помощник"
        title="Помощник — можно перетащить"
        {...drag.handlers}
        onClick={() => {
          if (drag.consumeDrag()) return;
          onOpen("menu");
        }}
      >
        <MessageCircleQuestion className="size-6" />
      </Button>
    </div>
  );
}

const LAUNCHER_SIZE = 48;

/** Область для fixed-элементов — без полос прокрутки (innerWidth их включает). */
const viewport = () => ({ width: document.documentElement.clientWidth, height: document.documentElement.clientHeight });
const POS_KEY = "hf:assistant-pos";

/** Перетаскивание кнопки помощника: положение — на устройстве, кнопка всегда целиком на экране. */
function useDraggable() {
  const [pos, setPos] = useState<FloatPos | null>(null);
  const [view, setView] = useState({ width: 0, height: 0 });
  const start = useRef<{ x: number; y: number; pos: FloatPos; last: FloatPos | null } | null>(null);
  const dragged = useRef(false);

  useEffect(() => {
    const fit = () => {
      const v = viewport();
      setView(v);
      setPos((p) => (p ? clampPos(p, LAUNCHER_SIZE, v.width, v.height) : p));
    };
    let saved: FloatPos | null = null;
    try {
      saved = parsePos(localStorage.getItem(POS_KEY));
    } catch {}
    // localStorage и размер окна — только после монтирования
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved) setPos(saved);
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  const handlers = {
    onPointerDown: (e: PointerEvent<HTMLButtonElement>) => {
      if (e.button !== 0) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const v = viewport();
      const from = pos ?? { right: v.width - rect.right, bottom: v.height - rect.bottom };
      start.current = { x: e.clientX, y: e.clientY, pos: from, last: null };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    onPointerMove: (e: PointerEvent<HTMLButtonElement>) => {
      const s = start.current;
      if (!s) return;
      const dx = e.clientX - s.x;
      const dy = e.clientY - s.y;
      if (!s.last && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      const v = viewport();
      s.last = clampPos({ right: s.pos.right - dx, bottom: s.pos.bottom - dy }, LAUNCHER_SIZE, v.width, v.height);
      setPos(s.last);
    },
    onPointerUp: () => {
      const s = start.current;
      start.current = null;
      if (!s?.last) return;
      dragged.current = true;
      try {
        localStorage.setItem(POS_KEY, JSON.stringify(s.last));
      } catch {}
    },
    onPointerCancel: () => {
      start.current = null;
    },
  };

  /** Клик после перетаскивания — не открывает чат. */
  const consumeDrag = () => {
    const was = dragged.current;
    dragged.current = false;
    return was;
  };

  if (!pos || !view.width) return { handlers, consumeDrag, style: undefined, className: "flex-col items-end" };
  // Карточка чек-ина раскрывается к центру экрана
  const side = popoverSide(pos, LAUNCHER_SIZE, view.width, view.height);
  const style: CSSProperties = {
    ...(side.left ? { left: view.width - pos.right - LAUNCHER_SIZE } : { right: pos.right }),
    ...(side.below ? { top: view.height - pos.bottom - LAUNCHER_SIZE } : { bottom: pos.bottom }),
  };
  return {
    handlers,
    consumeDrag,
    style,
    className: cn(side.below ? "flex-col-reverse" : "flex-col", side.left ? "items-start" : "items-end"),
  };
}

/** Чек-ин самочувствия: карточка над кнопкой помощника, не блокирует тренировку. Боль на сервер не уходит. */
function CheckIn({ workout, onDone }: { workout: WorkoutBridge; onDone: (pain: boolean) => void }) {
  const reply = checkinReply();
  const answer = (payload: string) => {
    markCheckin(workout.workoutId);
    if (payload === "GREAT" || payload === "OK" || payload === "TIRED") {
      workout.setWellbeing(payload);
      void sendWellbeing(workout.workoutId, payload, saveWellbeingAction);
    }
    onDone(payload === "PAIN");
  };
  return (
    <section aria-label="Как ты сегодня?" className="w-72 space-y-2 rounded-2xl border bg-popover p-3 shadow-xl">
      <p className="text-sm font-medium">{reply.text}</p>
      <div className="flex flex-wrap gap-1.5">
        {reply.buttons.map((b) => (
          <Button key={b.label} size="sm" variant={"payload" in b && b.payload === "SKIP" ? "ghost" : "outline"} onClick={() => "payload" in b && answer(b.payload!)}>
            {b.label}
          </Button>
        ))}
      </div>
    </section>
  );
}

function Chat({ start, workout, onClose }: { start: NodeId; workout: WorkoutBridge | null; onClose: () => void }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [pain, setPain] = useState<PainSpot[]>([]);
  const [wellbeing, setWellbeing] = useState<Wellbeing | null>(workout?.wellbeing ?? null);
  const seq = useRef(0);
  const scroller = useRef<HTMLDivElement>(null);
  const workoutRef = useRef(workout);
  useEffect(() => {
    workoutRef.current = workout;
  }, [workout]);
  const workoutId = workout?.workoutId;

  const push = useCallback((m: Omit<Message, "id">) => setMessages((list) => [...list, { ...m, id: seq.current++ }]), []);

  useEffect(() => {
    // Боль — с устройства (после монтирования: на сервере localStorage нет)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (workoutId) setPain(readPain(workoutId));
  }, [workoutId]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [messages, loading]);

  /** Ответ на узел: статичный, по данным тренировки или с сервера. */
  const resolve = useCallback(
    async (node: NodeId, painNow: PainSpot[]): Promise<Reply> => {
      const w = workoutRef.current;
      if (node === "menu" && w) {
        const names = new Map(w.exercises.map((e) => [e.exercise.id, e.exercise.name]));
        return {
          text: names.size ? "Чем помочь? Выбери упражнение или тему." : "Чем помочь?",
          buttons: [...[...names].map(([id, name]) => ({ label: name, go: `exercise:${id}` })), ...MENU_BUTTONS],
        };
      }
      const fixed = staticReply(node);
      if (fixed) return fixed;

      if (node === "recovery") {
        return {
          text: w ? "Тренировка уже идёт — по карте мышц на дашборде видно, кто восстановился." : "Соберу тренировку из групп мышц, которые уже восстановились.",
          buttons: w ? [{ label: "Карта мышц", href: "/dashboard" }, BACK] : [{ label: "Собрать по восстановлению", action: "recovery" }, BACK],
        };
      }
      if (node === "stall" || node === "missed") {
        const answer = await askAssistantAction(node).catch(() => null);
        if (!answer?.ok) return { text: "Нужна сеть — попробуй, когда появится связь.", buttons: [BACK] };
        if (node === "stall") {
          const list = answer.stall ?? [];
          if (!list.length) return { text: "Всё растёт: застоя нет — продолжай в том же духе.", buttons: [BACK] };
          return {
            text: `Без новых рекордов: ${list.map((s) => `${s.name} — ${s.weeks} нед.`).join(", ")}.\n\nЧто можно сделать: разгрузочная неделя с весом на 10 % ниже; сменить диапазон повторов (например, с 8–10 на 5–6); заменить вариацию упражнения.`,
            why: "Застой — 4+ тренировки с упражнением за 6 недель и ни одного рекорда за 4 недели.",
            buttons: [{ label: "Совет: разгрузка", go: "tips:deload" }, BACK],
          };
        }
        const missed = answer.missed;
        if (!missed) return { text: "Пропусков нет 👍", buttons: [BACK] };
        return {
          text: missed.text,
          buttons: [
            ...(missed.canStart ? [{ label: "Начать", action: "start-plan" as const, payload: missed.key }] : []),
            { label: "Открыть календарь", href: "/calendar" },
            BACK,
          ],
        };
      }

      const m = /^exercise:([^:]+)(?::(weight|reps|replace))?$/.exec(node);
      const item = m && w ? w.exercises.find((e) => e.exercise.id === m[1]) : undefined;
      if (!m || !w || !item) return staticReply("menu")!;
      const ex = item.exercise;
      const last = w.last[ex.id] ?? null;
      if (!m[2]) return exerciseMenuReply(ex);
      if (m[2] === "weight") {
        return weightReply(
          ex,
          weightAdvice({
            bodyweight: ex.isBodyweight,
            groups: ex.muscleGroups,
            last,
            hint: w.hints[ex.id] ?? null,
            coach: w.coach[ex.id] ?? null,
            own: w.own[ex.id] ?? null,
            wellbeing,
            pain: painNow,
          }),
          item.sets.some((s) => s.completedAt),
        );
      }
      if (m[2] === "reps") return repsReply(ex, repsOrWeight({ bodyweight: ex.isBodyweight, last }));
      const lastDate = Object.fromEntries(Object.entries(w.last).map(([id, l]) => [id, l.date.slice(0, 10)]));
      const candidates = replacementCandidates(ex, w.catalog, {
        inWorkout: w.exercises.map((e) => e.exercise.id),
        pain: painNow,
        lastDate,
        today: today(),
      });
      return replaceReply(ex, candidates, item.sets.some((s) => s.completedAt));
    },
    [wellbeing],
  );

  const show = useCallback(
    async (node: NodeId, painNow: PainSpot[]) => {
      setLoading(true);
      const reply = await resolve(node, painNow);
      setLoading(false);
      push({ from: "bot", ...reply });
    },
    [push, resolve],
  );

  // Первый ответ при открытии
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    reachGoal("assistant_open");
    const w = workoutRef.current;
    const needCheckin = w?.started && w.wellbeing === null && !checkinDone(w.workoutId);
    if (needCheckin && start === "menu") push({ from: "bot", ...checkinReply() });
    else void show(start, workoutId ? readPain(workoutId) : []);
  }, [push, show, start, workoutId]);

  const applied = () => reachGoal("assistant_apply");

  const press = async (b: ReplyButton) => {
    push({ from: "me", text: b.label });
    if ("go" in b) return show(b.go, pain);
    if (!("action" in b)) return;
    const w = workoutRef.current;
    const keyOf = (id: string) => w?.exercises.find((e) => e.exercise.id === id)?.key;

    if (b.action === "checkin" && w) {
      markCheckin(w.workoutId);
      const v = b.payload;
      if (v === "GREAT" || v === "OK" || v === "TIRED") {
        setWellbeing(v);
        w.setWellbeing(v);
        void sendWellbeing(w.workoutId, v, saveWellbeingAction);
        push({ from: "bot", text: v === "TIRED" ? "Принято. Сегодня без прибавок — повторить прошлый результат уже хорошо." : "Отлично, учту." });
        return show("menu", pain);
      }
      return show(v === "PAIN" ? "pain" : "menu", pain);
    }
    if (b.action === "pain") {
      const spot = b.payload as PainSpot;
      const next = w ? [...new Set([...pain, spot])] : pain;
      if (w) {
        setPain(next);
        writePain(w.workoutId, next);
      }
      const related = w ? w.exercises.filter((e) => painRelated(e.exercise.muscleGroups, [spot])).map((e) => e.exercise) : [];
      const uniq = [...new Map(related.map((e) => [e.id, e])).values()];
      const done = new Set(w ? w.exercises.filter((e) => e.sets.some((x) => x.completedAt)).map((e) => e.exercise.id) : []);
      return push({ from: "bot", ...painReply(spot, uniq, Boolean(w), done) });
    }
    if (!w) return;
    if (b.action === "remove" && b.payload) {
      const key = keyOf(b.payload);
      // Выполненные подходы остаются — убираются только оставшиеся (ничего не сделано — упражнение целиком)
      if (key) w.dispatch({ type: "skipPending", key });
      applied();
      return push({ from: "bot", text: "Готово — сегодня без этого упражнения.", buttons: [BACK] });
    }
    if (b.action === "apply-sets" && b.payload) {
      const item = w.exercises.find((e) => e.exercise.id === b.payload);
      if (!item) return;
      const advice = weightAdvice({
        bodyweight: item.exercise.isBodyweight,
        groups: item.exercise.muscleGroups,
        last: w.last[item.exercise.id] ?? null,
        hint: w.hints[item.exercise.id] ?? null,
        coach: w.coach[item.exercise.id] ?? null,
        own: w.own[item.exercise.id] ?? null,
        wellbeing,
        pain,
      });
      if (advice.kind !== "sets") return;
      w.dispatch({ type: "applySets", key: item.key, sets: Array.from({ length: advice.sets }, () => ({ weight: advice.weight, reps: advice.reps })) });
      applied();
      return push({ from: "bot", text: "Готово — подходы заполнены. Удачной тренировки!", buttons: [BACK] });
    }
    if (b.action === "replace" && b.payload) {
      const [fromId, toId] = b.payload.split(">");
      const key = keyOf(fromId);
      const target = w.catalog.find((e) => e.id === toId);
      if (!key || !target) return;
      w.dispatch({
        type: "replaceExercise",
        key,
        exercise: { id: target.id, name: target.name, muscleGroups: target.muscleGroups, isBodyweight: target.isBodyweight },
        restSec: target.defaultRestSec,
        last: w.last,
      });
      applied();
      return push({ from: "bot", text: `Готово: ${target.name}.`, buttons: [BACK] });
    }
  };

  const lastBot = [...messages].reverse().find((m) => m.from === "bot");

  // Открыли — фокус в чат (иначе с клавиатуры и скринридером до него не добраться); Escape — закрыть
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    panel.current?.focus();
  }, []);

  return (
    <section
      ref={panel}
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
      role="dialog"
      aria-label="Помощник"
      className={cn(FLOAT, "flex max-h-[min(70dvh,36rem)] w-[min(24rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl outline-none border bg-popover shadow-2xl")}
    >
      <header className="flex items-center gap-2 border-b px-4 py-2.5">
        <MessageCircleQuestion className="size-4 text-primary" />
        <h2 className="flex-1 font-bold">Помощник</h2>
        <Button variant="ghost" size="icon-sm" aria-label="Закрыть помощника" onClick={onClose}>
          <X />
        </Button>
      </header>
      <div ref={scroller} className="flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
        {messages.map((m) =>
          m.from === "me" ? (
            <p key={m.id} className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3 py-1.5 text-sm text-primary-foreground">
              {m.text}
            </p>
          ) : (
            <BotMessage key={m.id} message={m} active={m === lastBot} onPress={press} />
          ),
        )}
        {loading ? <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Помощник думает" /> : null}
      </div>
    </section>
  );
}

function BotMessage({ message, active, onPress }: { message: Message; active: boolean; onPress: (b: ReplyButton) => void }) {
  const [why, setWhy] = useState(false);
  return (
    <div className="max-w-[92%] space-y-2">
      <div className="rounded-2xl rounded-bl-sm bg-muted px-3 py-2 text-sm whitespace-pre-line">{message.text}</div>
      {message.why ? (
        why ? (
          <p className="rounded-xl border px-3 py-2 text-xs text-muted-foreground">{message.why}</p>
        ) : (
          <button type="button" className="text-xs text-primary underline-offset-2 hover:underline" onClick={() => setWhy(true)}>
            Почему так?
          </button>
        )
      ) : null}
      {active && message.buttons?.length ? (
        <div className="flex flex-wrap gap-1.5">
          {message.buttons.map((b) =>
            "href" in b ? (
              <Link key={b.label} href={b.href} className={buttonVariants({ size: "sm", variant: "outline" })}>
                {b.label}
              </Link>
            ) : "action" in b && (b.action === "recovery" || b.action === "start-plan") ? (
              <form key={b.label} action={createWorkoutAction}>
                <input type="hidden" name="source" value={b.action === "recovery" ? "recovery" : `plan:${b.payload}`} />
                <Button type="submit" size="sm">
                  {b.label}
                </Button>
              </form>
            ) : (
              <Button key={b.label} size="sm" variant="outline" onClick={() => onPress(b)}>
                {b.label}
              </Button>
            ),
          )}
        </div>
      ) : null}
    </div>
  );
}
