import { STREAK_WEEK_THRESHOLDS } from "@/lib/progress/weekly-streak";

/** Картинки ачивок — `assets/icons/achievements/<key>.png`. */
export type AchievementIconKey =
  | "default"
  | "first_training"
  | "3x_training"
  | "number_one_in_league"
  | "number_two_in_league"
  | "number_three_in_league"
  | "100_weigth_push"
  | "add_5_kg"
  | "many_set"
  | "first_template"
  | "in_streak"
  | "stable_in_streak"
  | "progress_in_training";

/** Иконка по коду ачивки (код — из `definitions.ts`); без своей картинки — `default`. */
export function achievementIconKey(code: string): AchievementIconKey {
  const [prefix, ...rest] = code.split(":");
  const n = Number(rest.at(-1));
  switch (prefix) {
    case "workouts":
      return n === 1 ? "first_training" : "default";
    case "weekgoal":
      return "3x_training";
    case "league1":
      return "number_one_in_league";
    case "league2":
      return "number_two_in_league";
    case "league3":
      return "number_three_in_league";
    case "lift":
      return n === 100 ? "100_weigth_push" : "default";
    case "weightkg":
      return "add_5_kg";
    case "sets":
      return "many_set";
    case "template":
      return "first_template";
    case "streakw":
      return n === STREAK_WEEK_THRESHOLDS[0] ? "in_streak" : "stable_in_streak";
    case "records":
      return "progress_in_training";
    default:
      return "default";
  }
}
