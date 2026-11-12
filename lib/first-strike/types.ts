import type { BossView } from "@/lib/boss/queries";
import type { NewAchievement } from "@/lib/achievements/engine";
import type { OnboardingProgram } from "@/lib/onboarding/queries";

/** Ответ firstStrikeAction — всё для экрана результата (файл с "use server" типы не экспортирует). */
export type StrikeResult =
  | {
      ok: true;
      xp: number;
      damage: number;
      xpBefore: number;
      /** XP после удара и выданных им ачивок. */
      xpAfter: number;
      /** Босс текущей недели уже с ударом. */
      boss: BossView;
      achievement: NewAchievement | null;
      /** Есть своя тренировка PLANNED или IN_PROGRESS. */
      hasDraft: boolean;
      /** Готовые программы для старта; пусто, если hasDraft. */
      programs: OnboardingProgram[];
    }
  | { ok: false; error: string };
