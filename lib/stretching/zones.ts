import type { StretchZone } from "@/generated/prisma/enums";

/** Зоны растяжки в порядке показа (сверху вниз по телу). */
export const STRETCH_ZONES = [
  "NECK",
  "SHOULDERS",
  "CHEST",
  "BACK",
  "LOWER_BACK",
  "HIPS",
  "HAMSTRINGS",
  "QUADS",
  "ADDUCTORS",
  "CALVES",
] as const satisfies readonly StretchZone[];

const LABELS: Record<StretchZone, string> = {
  NECK: "Шея",
  SHOULDERS: "Плечи",
  CHEST: "Грудь",
  BACK: "Спина",
  LOWER_BACK: "Поясница",
  HIPS: "Тазобедренные",
  HAMSTRINGS: "Задняя поверхность бедра",
  QUADS: "Передняя поверхность бедра",
  ADDUCTORS: "Приводящие",
  CALVES: "Икры",
};

export const stretchZoneLabel = (z: StretchZone): string => LABELS[z];

/** Основная зона упражнения — первая в списке. */
export const primaryZone = (zones: readonly StretchZone[]): StretchZone | null => zones[0] ?? null;
