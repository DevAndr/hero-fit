import { plural } from "../format";
import { STREAK_WEEK_TARGET, type StreakStatus } from "./weekly-streak";

export const weeksText = (n: number) => `${n} ${plural(n, "неделя", "недели", "недель")}`;
const workoutsText = (n: number) => `${n} ${plural(n, "тренировка", "тренировки", "тренировок")}`;
const daysText = (n: number) => `${n} ${plural(n, "день", "дня", "дней")}`;

/** Неделю ещё можно спасти, но тренировок не хватает на оставшиеся дни. */
export function isStreakUrgent(status: StreakStatus) {
  return (status.state === "pending" || status.state === "frozen") && status.needed > 0 && status.needed >= status.daysLeft;
}

/** Подпись карточки серии на дашборде (без оффера выкупа — его текст строит страница). */
export function streakMessage(status: StreakStatus): string {
  if (isStreakUrgent(status) && (status.state === "pending" || status.state === "frozen")) {
    return `Не потеряй streak! Ещё ${workoutsText(status.needed)} до конца недели`;
  }
  switch (status.state) {
    case "none":
      return `Сделайте ${STREAK_WEEK_TARGET} тренировки за неделю, чтобы зажечь серию`;
    case "done":
      return "Неделя засчитана 🔥";
    case "pending":
      return `Эта неделя: ${status.count}/${STREAK_WEEK_TARGET} · осталось ${daysText(status.daysLeft)}`;
    case "frozen":
      return "Неделя пропущена — серию спасёт заморозка";
    case "lost":
      return "Серия прервалась — начните новую";
  }
}

/** Подсказка к огоньку в шапке. */
export function streakHint(status: StreakStatus): string {
  if (status.state === "done") return "Неделя засчитана";
  if (status.state === "pending" || status.state === "frozen") {
    return `Эта неделя: ${status.count}/${STREAK_WEEK_TARGET}, осталось ${daysText(status.daysLeft)}`;
  }
  return `Streak — недели подряд с ${STREAK_WEEK_TARGET}+ тренировками`;
}
