/** Обратная связь: подписи, уведомления и тексты (спека 2026-10-18-feedback-design). Без Prisma — годится клиенту. */

export type FeedbackKind = "BUG" | "IDEA" | "OTHER";
export type FeedbackStatus = "NEW" | "IN_PROGRESS" | "DONE" | "REJECTED";

/** Обращений за скользящие сутки на пользователя. */
export const FEEDBACK_DAILY_MAX = 5;
/** Сообщений админам в Telegram о новых обращениях за час, не больше. */
export const FEEDBACK_ALERTS_HOURLY = 20;

export const KIND_LABEL: Record<FeedbackKind, string> = { BUG: "Ошибка", IDEA: "Идея", OTHER: "Другое" };
export const STATUS_LABEL: Record<FeedbackStatus, string> = { NEW: "Новое", IN_PROGRESS: "В работе", DONE: "Сделано", REJECTED: "Отклонено" };

const FINAL: ReadonlySet<FeedbackStatus> = new Set(["DONE", "REJECTED"]);

/** Автору сообщаем, когда обращение пришло к итогу (из другого статуса). */
export function shouldNotify(prev: FeedbackStatus, next: FeedbackStatus): boolean {
  return FINAL.has(next) && prev !== next;
}

/** Первая строка, обрезанная по слову до max символов. */
export function preview(body: string, max = 40): string {
  const line = body.trim().split("\n")[0].trim();
  if (line.length <= max) return line;
  const cut = line.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > 0 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

export function notificationText(status: "DONE" | "REJECTED", body: string): { title: string; body: string; url: string } {
  return {
    title: "Обратная связь",
    body: `Ваше обращение «${preview(body)}» — ${status === "DONE" ? "сделано" : "отклонено"}`,
    url: "/feedback",
  };
}

/** Telegram админам — без текста и автора (152-ФЗ): только тип и ссылка на админку. */
export function feedbackAlertText(kind: FeedbackKind, appUrl: string): string {
  return `📝 Новое обращение: ${KIND_LABEL[kind].toLowerCase()}\n${appUrl.replace(/\/$/, "")}/admin/feedback`;
}

/** Вкладки /admin/feedback: open = новые и в работе. */
export const FEEDBACK_FILTERS = ["open", "new", "in_progress", "done", "rejected", "all"] as const;
export type FeedbackFilter = (typeof FEEDBACK_FILTERS)[number];

export const FILTER_LABEL: Record<FeedbackFilter, string> = {
  open: "Открытые",
  new: "Новые",
  in_progress: "В работе",
  done: "Сделано",
  rejected: "Отклонено",
  all: "Все",
};

/** Статусы под вкладкой; all — без условия. */
export const FILTER_STATUSES: Record<FeedbackFilter, FeedbackStatus[] | null> = {
  open: ["NEW", "IN_PROGRESS"],
  new: ["NEW"],
  in_progress: ["IN_PROGRESS"],
  done: ["DONE"],
  rejected: ["REJECTED"],
  all: null,
};

export function parseFilter(raw: unknown): FeedbackFilter {
  return (FEEDBACK_FILTERS as readonly unknown[]).includes(raw) ? (raw as FeedbackFilter) : "open";
}
