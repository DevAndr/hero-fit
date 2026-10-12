/**
 * Дерево сценариев помощника: узел → текст, «почему так» и кнопки. Свободного ввода нет.
 * Статичные узлы (меню, справка, советы) — `staticReply`; узлы с данными собирают построители ниже
 * из правил `rules.ts` (в тренировке — на клиенте) и ответов `askAssistantAction`.
 */
import { HELP_TOPICS, TIPS } from "./content";
import { kg, PAIN_SPOTS, type PainSpot, type WeightAdvice } from "./rules";

export type NodeId = string;

export type EditorAction = "apply-sets" | "replace" | "remove" | "start-plan" | "recovery" | "pain" | "checkin";

export type Button = { label: string } & ({ go: NodeId } | { href: string } | { action: EditorAction; payload?: string });

export type Reply = { text: string; why?: string; buttons: Button[] };

export const BACK: Button = { label: "Назад в меню", go: "menu" };

export const MENU_BUTTONS: Button[] = [
  { label: "Застой — что делать?", go: "stall" },
  { label: "Пропущена тренировка — как быть?", go: "missed" },
  { label: "Что потренировать сегодня?", go: "recovery" },
  { label: "Что-то болит", go: "pain" },
  { label: "Как это работает?", go: "help" },
  { label: "Советы по тренировкам", go: "tips" },
  { label: "Как ты считаешь советы?", go: "rules" },
];

const RULES_TEXT = [
  "Вес на сегодня: сначала план тренера, затем прогрессия твоего шаблона, затем подсказка «Пора увеличить вес», иначе — как в прошлый раз.",
  "Прибавлять пора, если во всех рабочих подходах оставался запас 2+ повтора или 3 тренировки подряд результат держится. Шаг — 2,5 кг, до 20 кг — 1 кг.",
  "В чек-ине «Мало сил» — прибавок не будет. «Что-то болит» — упражнения на это место помощник предложит пропустить.",
  "Застой — 4+ тренировки с упражнением за 6 недель без нового рекорда 4 недели.",
  "Что тренировать — по карте восстановления мышц.",
].join("\n\n");

export function staticReply(id: NodeId): Reply | null {
  if (id === "menu") return { text: "Привет! Я помогу с весами, планом и самочувствием. Что подсказать?", buttons: MENU_BUTTONS };
  if (id === "help") {
    return { text: "О чём рассказать?", buttons: [...HELP_TOPICS.map((t) => ({ label: t.title, go: `help:${t.id}` })), BACK] };
  }
  if (id === "tips") {
    return { text: "Выбери тему:", buttons: [...TIPS.map((t) => ({ label: t.title, go: `tips:${t.id}` })), BACK] };
  }
  if (id === "rules") return { text: RULES_TEXT, buttons: [BACK] };
  if (id === "pain") {
    return {
      text: "Где болит? Подскажу, какие упражнения сегодня лучше пропустить.",
      buttons: [...PAIN_SPOTS.map((p) => ({ label: p.label, action: "pain" as const, payload: p.spot })), BACK],
    };
  }
  const [kind, topicId] = id.split(":");
  const list = kind === "help" ? HELP_TOPICS : kind === "tips" ? TIPS : null;
  const topic = list?.find((t) => t.id === topicId);
  if (!topic) return null;
  return {
    text: topic.text,
    buttons: [
      ...(topic.href ? [{ label: topic.link ?? "Открыть", href: topic.href }] : []),
      { label: kind === "help" ? "Другая тема" : "Другой совет", go: kind },
      BACK,
    ],
  };
}

// ─────────────── Узлы с данными ───────────────

type Ex = { id: string; name: string };

export const CHECKIN_OPTIONS = [
  { label: "Отлично", payload: "GREAT" },
  { label: "Нормально", payload: "OK" },
  { label: "Мало сил", payload: "TIRED" },
  { label: "Что-то болит", payload: "PAIN" },
  { label: "Пропустить", payload: "SKIP" },
] as const;

export function checkinReply(): Reply {
  return {
    text: "Как ты сегодня? Учту это в советах.",
    buttons: CHECKIN_OPTIONS.map((o) => ({ label: o.label, action: "checkin" as const, payload: o.payload })),
  };
}

export function exerciseMenuReply(ex: Ex): Reply {
  return {
    text: `${ex.name}: что подсказать?`,
    buttons: [
      { label: "Какой вес взять сегодня?", go: `exercise:${ex.id}:weight` },
      { label: "Повторы или вес?", go: `exercise:${ex.id}:reps` },
      { label: "Заменить упражнение", go: `exercise:${ex.id}:replace` },
      { label: "Что-то болит", go: "pain" },
      BACK,
    ],
  };
}

const PAIN_SKIP = "Не делай через боль. Пропусти это упражнение сегодня.";
const DOCTOR = "Если боль острая или не проходит несколько дней — обратись к врачу.";

/** Подпись пропуска: выполненные подходы не теряются — убираются только оставшиеся. */
const skipLabel = (done: boolean, name?: string) =>
  done ? (name ? `Пропустить оставшиеся: ${name}` : "Пропустить оставшиеся подходы") : name ? `Убрать: ${name}` : "Убрать из тренировки";

export function weightReply(ex: Ex, advice: WeightAdvice, done = false): Reply {
  if (advice.kind === "pain") {
    return { text: `${PAIN_SKIP}\n\n${DOCTOR}`, buttons: [{ label: skipLabel(done), action: "remove", payload: ex.id }, BACK] };
  }
  if (advice.kind === "first") {
    return {
      text: advice.bodyweight
        ? "Первый раз — сделай столько повторов, сколько выходит с чистой техникой, оставив запас 2–3."
        : "Первый раз — возьми вес, с которым сделаешь 10–12 повторов с запасом 2–3. Дальше помощник подскажет по результату.",
      buttons: [BACK],
    };
  }
  const set = advice.weight ? `${advice.sets} × ${advice.reps} · ${kg(advice.weight)}` : `${advice.sets} × ${advice.reps}`;
  const from = { coach: "По плану тренера", own: "По твоей прогрессии", hint: "Пора прибавить", last: "Как в прошлый раз" }[advice.source];
  return {
    text: `${from}: ${set}.${advice.note ? `\n\n${advice.note}` : ""}`,
    why: advice.why,
    buttons: [{ label: "Подставить в подходы", action: "apply-sets", payload: ex.id }, { label: "К упражнению", go: `exercise:${ex.id}` }, BACK],
  };
}

export function repsReply(ex: Ex, r: { text: string; why: string }): Reply {
  return { text: r.text, why: r.why, buttons: [{ label: "К упражнению", go: `exercise:${ex.id}` }, BACK] };
}

export function replaceReply(ex: Ex, candidates: Ex[], hasCompleted: boolean): Reply {
  if (!candidates.length) {
    return { text: "Подходящей замены нет — можно просто пропустить.", buttons: [{ label: skipLabel(hasCompleted), action: "remove", payload: ex.id }, BACK] };
  }
  return {
    text: hasCompleted
      ? "Часть подходов уже сделана — новое упражнение встанет после текущего."
      : "Чем заменить — та же основная группа мышц:",
    buttons: [
      ...candidates.map((c) => ({ label: hasCompleted ? `Добавить вместо: ${c.name}` : `Заменить: ${c.name}`, action: "replace" as const, payload: `${ex.id}>${c.id}` })),
      { label: "К упражнению", go: `exercise:${ex.id}` },
      BACK,
    ],
  };
}

export function painReply(spot: PainSpot, related: Ex[], inWorkout: boolean, done: ReadonlySet<string> = new Set()): Reply {
  if (spot === "other" || !inWorkout) {
    return { text: `Не делай упражнения, которые отдают болью, — их лучше пропустить сегодня.\n\n${DOCTOR}`, buttons: [BACK] };
  }
  return {
    text: related.length
      ? `${PAIN_SKIP}\n\nЭто место нагружают: ${related.map((e) => e.name).join(", ")}.\n\n${DOCTOR}`
      : `В этой тренировке упражнений на это место нет. Если что-то отдаёт болью — пропусти.\n\n${DOCTOR}`,
    buttons: [...related.map((e) => ({ label: skipLabel(done.has(e.id), e.name), action: "remove" as const, payload: e.id })), BACK],
  };
}
