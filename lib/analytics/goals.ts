/**
 * Цели Яндекс.Метрики. Сервер не может вызвать ym() — после регистрации или завершения тренировки
 * он кладёт цель в cookie `hf_goals` (queueGoal), а счётчик на клиенте отправляет и чистит её.
 */
export const GOALS = ["signup", "workout_start", "workout_finish", "first_workout", "onboarding_done", "onboarding_skip", "share_story", "coach_enabled", "coach_client_joined", "coach_assign", "coach_comment", "coach_targets", "coach_copy_plan", "coach_program_assign", "coach_page_published", "trainer_page_join", "telegram_open", "goal_create", "goal_achieved", "assistant_open", "assistant_apply", "club_page_published", "club_page_join", "account_deleted", "shop_buy", "shop_open"] as const;
export type Goal = (typeof GOALS)[number];

export const GOAL_COOKIE = "hf_goals";

const SEP = ".";

/** Номер счётчика — только в production и только число (иначе Метрика не подключается). */
export function metrikaId(nodeEnv: string | undefined, raw: string | undefined): number | null {
  if (nodeEnv !== "production") return null;
  const v = raw?.trim();
  return v && /^\d+$/.test(v) ? Number(v) : null;
}

export function parseGoals(value: string | undefined): Goal[] {
  if (!value) return [];
  const known = new Set<string>(GOALS);
  return [...new Set(value.split(SEP))].filter((g): g is Goal => known.has(g));
}

export function addGoal(value: string | undefined, goal: Goal): string {
  return [...new Set([...parseGoals(value), goal])].join(SEP);
}

/** Страницы без Метрики: /tg — Telegram кладёт в адрес подписанный initData (#tgWebAppData), он не должен уйти в отчёты. */
export function metrikaOff(pathname: string) {
  return pathname === "/tg";
}
