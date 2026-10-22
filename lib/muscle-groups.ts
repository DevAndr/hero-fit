import type { MuscleGroup } from "@/generated/prisma/enums";

export const MUSCLE_GROUP_LABELS: Record<MuscleGroup, string> = {
  CHEST: "Грудь",
  LEGS: "Ноги",
  GLUTES: "Ягодицы",
  SHOULDERS: "Плечи",
  FOREARMS: "Предплечья",
  CALVES: "Икры",
  TRICEPS: "Трицепс",
  BICEPS: "Бицепс",
  BACK: "Спина",
  TRAPS: "Трапеция",
  ABS: "Пресс",
};

export const MUSCLE_GROUPS = Object.keys(MUSCLE_GROUP_LABELS) as MuscleGroup[];
