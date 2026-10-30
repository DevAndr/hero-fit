/** Подсказка «Задайте пароль для входа на сайте» — аккаунтам из Mini App без пароля: с 3-го дня или после первой тренировки. */
export const SITE_LOGIN_HINT_DAYS = 3;

const DAY_MS = 86_400_000;

export type SiteLoginHintUser = { hasPassword: boolean; telegram: boolean; createdAt: Date; completed: number };

export function siteLoginHintDue(u: SiteLoginHintUser, now: Date) {
  if (u.hasPassword || !u.telegram) return false;
  return u.completed > 0 || now.getTime() - u.createdAt.getTime() >= SITE_LOGIN_HINT_DAYS * DAY_MS;
}

export const SITE_LOGIN_HINT = {
  title: "Задайте пароль для входа на сайте",
  body: "Аккаунт создан в Telegram. Задайте email и пароль — тогда прогресс будет доступен и в браузере",
  url: "/settings#site-login",
} as const;
