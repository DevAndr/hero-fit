/** Ссылка-приглашение тренера в Telegram Mini App (startapp → /tg → экран согласия). Без бота — нет ссылки. */
export function telegramJoinUrl(code: string, botUsername: string | undefined): string | null {
  return botUsername ? `https://t.me/${botUsername}?startapp=join_${code}` : null;
}
