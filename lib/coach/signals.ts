/** Сигналы риска клиента для тренера (чистые функции). Правила — в поясе клиента. */
import { dayKey } from "@/lib/daily-login";
import { localMidnight } from "@/lib/progress/weekly-streak";

/** Строки совпадают с enum CoachSignalKind в Prisma. */
export type SignalKind = "MISSED_PLAN" | "STALLED" | "ACTIVITY_DROP" | "INACTIVE";

export type SignalInput = {
  linkedAt: Date;
  lastWorkoutAt: Date | null;
  /** Завершённые тренировки за 42 дня. */
  workoutsAt: Date[];
  /** Назначения этого тренера за 28 дней и вперёд (статусы календаря). */
  plan: { date: string; status: "done" | "missed" | "skipped" | "today" | "planned" }[];
  /** Задания тренера клиенту. */
  targets: { fails: number; unloadedAt: Date | null; updatedAt: Date }[];
};

export type Signal = { kind: SignalKind; since: Date };

const DAY = 86_400_000;
const INACTIVE_DAYS = 7;
const MISSED_IN_ROW = 2;
const STALL_FAILS = 2;
const UNLOAD_DAYS = 14;
const RECENT_DAYS = 14;
const BASE_DAYS = 42;
const MIN_BASE = 2;

const ORDER: SignalKind[] = ["MISSED_PLAN", "INACTIVE", "STALLED", "ACTIVITY_DROP"];

export function clientSignals(input: SignalInput, now: Date, tz: string): Signal[] {
  const out: Signal[] = [];
  const ago = (days: number) => now.getTime() - days * DAY;

  // Две последние прошедшие назначенные — обе не выполнены; сегодняшнее ещё не пропуск
  const today = dayKey(now, tz);
  const past = input.plan.filter((o) => o.date < today).sort((a, b) => b.date.localeCompare(a.date));
  const lastTwo = past.slice(0, MISSED_IN_ROW);
  if (lastTwo.length === MISSED_IN_ROW && lastTwo.every((o) => o.status === "missed" || o.status === "skipped")) {
    out.push({ kind: "MISSED_PLAN", since: localMidnight(lastTwo[MISSED_IN_ROW - 1].date, tz) });
  }

  const quietSince = input.lastWorkoutAt ?? input.linkedAt;
  const inactive = quietSince.getTime() <= ago(INACTIVE_DAYS);
  if (inactive) out.push({ kind: "INACTIVE", since: quietSince });

  const stalledSince = input.targets
    .flatMap((t) => [
      ...(t.fails >= STALL_FAILS ? [t.updatedAt] : []),
      ...(t.unloadedAt && t.unloadedAt.getTime() >= ago(UNLOAD_DAYS) ? [t.unloadedAt] : []),
    ])
    .sort((a, b) => a.getTime() - b.getTime())[0];
  if (stalledSince) out.push({ kind: "STALLED", since: stalledSince });

  if (!inactive && input.linkedAt.getTime() <= ago(BASE_DAYS)) {
    const count = (from: number, to: number) => input.workoutsAt.filter((w) => w.getTime() > from && w.getTime() <= to).length;
    // Обычный темп — тренировок за 2 недели в днях 15…42 назад
    const base = count(ago(BASE_DAYS), ago(RECENT_DAYS)) / ((BASE_DAYS - RECENT_DAYS) / RECENT_DAYS);
    const recent = count(ago(RECENT_DAYS), now.getTime());
    if (base >= MIN_BASE && recent <= base / 2) out.push({ kind: "ACTIVITY_DROP", since: new Date(ago(RECENT_DAYS)) });
  }

  return out.sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
}

export function signalsDiff(open: SignalKind[], current: SignalKind[]): { open: SignalKind[]; resolve: SignalKind[] } {
  return { open: current.filter((k) => !open.includes(k)), resolve: open.filter((k) => !current.includes(k)) };
}

export const SIGNAL_LABELS: Record<SignalKind, string> = {
  MISSED_PLAN: "Пропуски плана",
  STALLED: "Застой на весе",
  ACTIVITY_DROP: "Спад активности",
  INACTIVE: "Неактивен",
};

/** alert — клиент уходит (пропуски, тишина), warn — тренируется, но что-то не так. */
export function signalTone(kind: SignalKind): "alert" | "warn" {
  return kind === "MISSED_PLAN" || kind === "INACTIVE" ? "alert" : "warn";
}

const dateLabel = (d: Date, tz: string) => d.toLocaleDateString("ru-RU", { day: "numeric", month: "long", timeZone: tz });

/** Пояснение для карточки клиента. */
export function signalText(signal: Signal, tz: string): string {
  switch (signal.kind) {
    case "MISSED_PLAN":
      return `Две последние назначенные тренировки не выполнены (с ${dateLabel(signal.since, tz)})`;
    case "INACTIVE":
      return `Нет тренировок с ${dateLabel(signal.since, tz)}`;
    case "STALLED":
      return "Задание не выполняется 2 раза подряд или была разгрузка";
    case "ACTIVITY_DROP":
      return "За 2 недели вдвое меньше тренировок, чем обычно";
  }
}

const NOTICE: Record<SignalKind, string> = {
  MISSED_PLAN: "пропущены 2 тренировки подряд",
  INACTIVE: "7 дней без тренировок",
  STALLED: "застой на весе",
  ACTIVITY_DROP: "спад активности",
};

/** Заголовок уведомления тренеру: «Маша: пропущены 2 тренировки подряд · спад активности». */
export function signalsNotice(name: string, kinds: SignalKind[]): string {
  return `${name}: ${kinds.map((k) => NOTICE[k]).join(" · ")}`;
}
