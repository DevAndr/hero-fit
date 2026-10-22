import type { MuscleGroup } from "@/generated/prisma/enums";
import { plural } from "@/lib/format";
import { MUSCLE_GROUP_LABELS, MUSCLE_GROUPS } from "@/lib/muscle-groups";

/**
 * Восстановление мышц после тренировки — упрощённая модель для подсказок, не медицина.
 * Норма отдыха на 6 рабочих подходов зависит от размера группы; объём растягивает её от ×0,5 до ×1,5.
 */
const BASE_HOURS: Record<MuscleGroup, number> = {
  LEGS: 72,
  GLUTES: 72,
  BACK: 72,
  CHEST: 72,
  SHOULDERS: 60,
  TRAPS: 60,
  BICEPS: 48,
  TRICEPS: 48,
  FOREARMS: 48,
  CALVES: 48,
  ABS: 48,
};
const BASE_SETS = 6;
/** Сколько дней без нагрузки — «давно не тренировалась». */
export const NEGLECT_DAYS = 7;
/** Окно истории для расчёта усталости: дольше максимальной нормы (72 ч × 1,5). */
export const RECOVERY_WINDOW_DAYS = 14;

const HOUR_MS = 3_600_000;

export type RecoveryState = "fatigued" | "recovering" | "ready" | "neglected";

/** Рабочие подходы одной тренировки на группу: основная группа упражнения — 1, второстепенные — 0,5. */
export type GroupSession = { group: MuscleGroup; sets: number; at: Date };

export type GroupRecovery = {
  group: MuscleGroup;
  state: RecoveryState;
  /** 0…100 */
  percent: number;
  hoursLeft: number;
  /** Полных суток с последней тренировки группы; null — ни разу. */
  daysSince: number | null;
};

export function recoveryHours(group: MuscleGroup, sets: number) {
  return BASE_HOURS[group] * Math.min(1.5, Math.max(0.5, sets / BASE_SETS));
}

/**
 * Состояние каждой группы. `recent` — тренировки за окно `RECOVERY_WINDOW_DAYS` (усталость),
 * `last` — последняя тренировка группы за всё время (сколько дней отдыхает).
 * Несколько тренировок — берём ту, после которой группа восстановлена меньше всего.
 */
export function muscleRecovery(recent: GroupSession[], last: GroupSession[], now: Date): GroupRecovery[] {
  return MUSCLE_GROUPS.map((group) => {
    let ratio = 1;
    let hoursLeft = 0;
    for (const s of recent) {
      if (s.group !== group || s.sets <= 0) continue;
      const elapsed = (now.getTime() - s.at.getTime()) / HOUR_MS;
      const need = recoveryHours(group, s.sets);
      const r = Math.min(1, Math.max(0, elapsed / need));
      if (r < ratio) {
        ratio = r;
        hoursLeft = Math.ceil(need - elapsed);
      }
    }
    const lastAt = Math.max(
      ...[...recent, ...last].filter((s) => s.group === group && s.sets > 0).map((s) => s.at.getTime()),
    );
    const daysSince = Number.isFinite(lastAt) ? Math.floor((now.getTime() - lastAt) / (24 * HOUR_MS)) : null;

    const state: RecoveryState =
      daysSince === null || daysSince >= NEGLECT_DAYS
        ? "neglected"
        : ratio < 0.5
          ? "fatigued"
          : ratio < 1
            ? "recovering"
            : "ready";
    return { group, state, percent: Math.round(ratio * 100), hoursLeft, daysSince };
  });
}

/** Подписи без рода и числа: группы бывают «Пресс», «Спина», «Ноги». */
export const RECOVERY_STATE_LABELS: Record<RecoveryState, string> = {
  fatigued: "Нужен отдых",
  recovering: "Восстановление",
  ready: "Можно нагружать",
  neglected: "Давно не было",
};

const PLURAL_GROUPS = new Set<MuscleGroup>(["LEGS", "GLUTES", "SHOULDERS", "FOREARMS", "CALVES"]);

export function recoveryHint(r: GroupRecovery) {
  const name = MUSCLE_GROUP_LABELS[r.group];
  switch (r.state) {
    case "neglected":
      return r.daysSince === null
        ? `${name}: ещё не тренировали`
        : `${name} отдыха${PLURAL_GROUPS.has(r.group) ? "ют" : "ет"} ${r.daysSince} ${plural(r.daysSince, "день", "дня", "дней")}`;
    case "ready":
      return `${name}: можно нагружать`;
    default:
      return `${name}: восстановление ${r.percent} %, ещё ~${r.hoursLeft} ч`;
  }
}
