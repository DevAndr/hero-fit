import type { AchievementCategory } from "@/generated/prisma/enums";

export const CATEGORY_LABELS: Record<AchievementCategory, string> = {
  WORKOUT_COUNT: "Тренировки",
  STREAK: "В ударе",
  WEIGHT_PROGRESS: "Прогресс в весе",
  STRENGTH: "Сила",
  RECORDS: "Рекорды",
  VOLUME: "Объём",
  SET_VOLUME: "Подходы",
  VARIETY: "Разнообразие",
  TIME: "Время и режим",
  PROGRAMS: "Программы",
  DAILY_LOGIN: "Каждый день",
  MILESTONE: "Вехи",
  LEAGUE: "Лига",
  BOSS: "Боссы",
  GUILD: "Гильдия",
};

export const CATEGORY_ORDER = Object.keys(CATEGORY_LABELS) as AchievementCategory[];
