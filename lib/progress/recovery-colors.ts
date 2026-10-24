import type { RecoveryState } from "@/lib/progress/recovery";

/**
 * Цвет состояния — заливка мышцы на силуэте и точка в списке / фильтре. «Можно нагружать» — смысловой recovery-green,
 * а не primary: темы магазина перекрашивают акцент (в оранжевой «Кузнице» он совпал бы с «нужен отдых»).
 */
export const RECOVERY_FILL: Record<RecoveryState, string> = {
  fatigued: "fill-streak",
  recovering: "fill-xp",
  ready: "fill-recovery-green",
  neglected: "fill-muted-foreground/30",
};
export const RECOVERY_DOT: Record<RecoveryState, string> = {
  fatigued: "bg-streak",
  recovering: "bg-xp",
  ready: "bg-recovery-green",
  neglected: "bg-muted-foreground/40",
};
