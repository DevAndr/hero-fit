import type { MuscleGroup, StretchZone } from "@/generated/prisma/enums";
import { MUSCLE_GROUP_LABELS } from "@/lib/muscle-groups";
import { stretchZoneLabel } from "@/lib/stretching/zones";

/** Подписи «области» упражнения: у растяжки — зоны, у остальных — группы мышц. */
export function areaLabels(e: { kind?: string; muscleGroups: MuscleGroup[]; stretchZones?: StretchZone[] }): string[] {
  return e.kind === "STRETCH" ? (e.stretchZones ?? []).map(stretchZoneLabel) : e.muscleGroups.map((g) => MUSCLE_GROUP_LABELS[g]);
}
