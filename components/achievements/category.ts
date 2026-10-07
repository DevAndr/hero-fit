import {
  BicepsFlexed,
  CalendarCheck,
  ClipboardList,
  Clock,
  Crown,
  Dumbbell,
  Flame,
  Layers,
  Medal,
  Shapes,
  TrendingUp,
  Weight,
  type LucideIcon,
} from "lucide-react";
import type { AchievementCategory } from "@/generated/prisma/enums";

export const CATEGORY_META: Record<AchievementCategory, { label: string; icon: LucideIcon; color: string }> = {
  WORKOUT_COUNT: { label: "Тренировки", icon: Dumbbell, color: "text-primary bg-primary/15" },
  STREAK: { label: "В ударе", icon: Flame, color: "text-streak bg-streak/15" },
  WEIGHT_PROGRESS: { label: "Прогресс в весе", icon: TrendingUp, color: "text-xp bg-xp/15" },
  STRENGTH: { label: "Сила", icon: BicepsFlexed, color: "text-chart-5 bg-chart-5/15" },
  RECORDS: { label: "Рекорды", icon: Medal, color: "text-xp bg-xp/15" },
  VOLUME: { label: "Объём", icon: Weight, color: "text-chart-3 bg-chart-3/15" },
  SET_VOLUME: { label: "Подходы", icon: Layers, color: "text-chart-2 bg-chart-2/15" },
  VARIETY: { label: "Разнообразие", icon: Shapes, color: "text-chart-1 bg-chart-1/15" },
  TIME: { label: "Время и режим", icon: Clock, color: "text-chart-2 bg-chart-2/15" },
  PROGRAMS: { label: "Программы", icon: ClipboardList, color: "text-primary bg-primary/15" },
  DAILY_LOGIN: { label: "Каждый день", icon: CalendarCheck, color: "text-chart-4 bg-chart-4/15" },
  MILESTONE: { label: "Вехи", icon: Crown, color: "text-chart-4 bg-chart-4/15" },
};

export const CATEGORY_ORDER = Object.keys(CATEGORY_META) as AchievementCategory[];
