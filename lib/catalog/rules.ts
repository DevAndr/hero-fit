export const CATALOG_DESCRIPTION_MAX = 300;
export const CATALOG_PAGE = 20;

export function catalogRuleText(rule: {
  stepKind: "PERCENT" | "KG";
  stepValue: number;
  deloadEvery: number | null;
}): string {
  const unit = rule.stepKind === "PERCENT" ? "%" : "кг";
  const base = `+${rule.stepValue.toLocaleString("ru-RU")} ${unit} в неделю`;
  return rule.deloadEvery ? `${base} · разгрузка каждую ${rule.deloadEvery}-ю неделю` : base;
}

/** Число тренировочных дней в неделе (уникальные дни недели). */
export function daysPerWeek(days: { weekday: number }[]): number {
  return new Set(days.map((d) => d.weekday)).size;
}

export type PublishBlock = "not-coach" | "no-nickname" | "no-days" | "no-description" | "hidden" | null;

export function canPublish(
  p: { days: number; description: string | null; hiddenAt: Date | null },
  coach: { isCoach: boolean; nickname: string | null },
): PublishBlock {
  if (!coach.isCoach) return "not-coach";
  if (!coach.nickname) return "no-nickname";
  if (p.hiddenAt) return "hidden";
  if (p.days < 1) return "no-days";
  if (!p.description?.trim()) return "no-description";
  return null;
}

export const PUBLISH_BLOCK_TEXT: Record<Exclude<PublishBlock, null>, string> = {
  "not-coach": "Публиковать может только тренер",
  "no-nickname": "Укажите ник в настройках",
  "no-days": "Добавьте хотя бы один день",
  "no-description": "Добавьте описание для каталога",
  hidden: "Программа снята администратором",
};

/** Что мешает запустить программу: "coach" — активная от тренера, "replace" — своя/каталожная (можно заменить). */
export function startBlock(
  active: { coachId: string | null; catalogProgramId: string | null } | null,
): null | "coach" | "replace" {
  if (!active) return null;
  return active.coachId ? "coach" : "replace";
}

export const PROGRAM_UNAVAILABLE = "Программа недоступна";
export const COACH_PROGRAM_RUNNING = "Сейчас идёт программа от тренера";
/** Ошибка-сигнал запуска: идёт своя/каталожная программа — клиент спрашивает «Заменить программу «…»?». */
export const NEEDS_REPLACE = "replace";

/** Подпись источника программы из каталога по метке недели: «программа «Сила» (неделя 3/8)». */
export const catalogSourceLabel = (name: string, week: string) => `программа «${name}» (${week[0].toLowerCase()}${week.slice(1)})`;
export const HIDE_REASON_MAX = 200;
