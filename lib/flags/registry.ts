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
  smart_coach: {
    description: "Умный помощник: чат с советами на сценариях, чек-ин самочувствия",
    expires: "2027-02-28",
  },
  clubs: {
    description: "Клубы залов: поиск, вступление, рейтинг и лента клуба",
    expires: "2027-03-31",
  },
} as const satisfies Record<string, { description: string; expires: string }>;

export type FlagKey = keyof typeof FLAGS;

export const FLAG_KEYS = Object.keys(FLAGS) as FlagKey[];

export function isFlagKey(key: string): key is FlagKey {
  return Object.hasOwn(FLAGS, key);
}
