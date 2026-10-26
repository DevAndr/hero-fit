/**
 * Реестр фича-флагов (спека 2026-10-12-feature-flags). Состояние — в таблице FeatureFlag (нет строки — выключен).
 * expires — до какого числа флаг должен уйти из кода: после раскатки на 100 % и 2–4 недель удалить флаг, проверки
 * и строку в БД (тест реестра падает, если срок прошёл). Права Премиума — не флаги.
 */
export const FLAGS = {
  strength_analytics: {
    description: "Аналитика силы: «Ты стал сильнее» в итогах и push, «Месяц к месяцу», прогноз целей",
    expires: "2026-12-31",
  },
  clubs: {
    description: "Клубы залов: поиск, вступление, рейтинг и лента клуба",
    expires: "2027-03-31",
  },
  shop: {
    description: "Магазин косметики: монеты, аватары, цвет ника, темы",
    expires: "2027-04-30",
  },
  golden_goblin: {
    description: "Золотой гоблин: редкая встреча посреди тренировки",
    expires: "2027-04-30",
  },
  workout_formats: {
    description: "Форматы тренировки: суперсеты и круговые (дальше — кардио)",
    expires: "2027-04-30",
  },
  whoop: {
    description: "WHOOP: пульс и strain из браслета в сводке тренировки",
    expires: "2027-04-30",
  },
  program_catalog: {
    description: "Каталог программ тренеров: публикация и самостоятельный запуск",
    expires: "2027-04-30",
  },
  campaigns: {
    description: "Рассылки «вернись в зал» по условиям из админки",
    expires: "2027-04-30",
  },
  native_app: {
    description: "Нативное Android-приложение: push через свой ntfy",
    expires: "2027-06-30",
  },
} as const satisfies Record<string, { description: string; expires: string }>;

export type FlagKey = keyof typeof FLAGS;

export const FLAG_KEYS = Object.keys(FLAGS) as FlagKey[];

export function isFlagKey(key: string): key is FlagKey {
  return Object.hasOwn(FLAGS, key);
}
