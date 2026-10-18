import { z } from "zod";

export const BODY_MIN = 10;
export const BODY_MAX = 2000;
export const NOTE_MAX = 1000;
const PAGE_MAX = 200;

/** Страница, откуда открыли форму: свой путь без query и hash; иное — не задано (без ошибки). */
export function cleanPage(raw: unknown): string | undefined {
  if (typeof raw !== "string" || !raw.startsWith("/") || /^\/[/\\]/.test(raw)) return undefined;
  const path = raw.split(/[?#]/)[0];
  return path.length <= PAGE_MAX ? path : undefined;
}

export const feedbackSchema = z.object({
  kind: z.enum(["BUG", "IDEA", "OTHER"]),
  body: z.string().trim().min(BODY_MIN, `Опишите подробнее — от ${BODY_MIN} символов`).max(BODY_MAX, `Не больше ${BODY_MAX} символов`),
  page: z.unknown().optional().transform(cleanPage),
});
export type FeedbackInput = z.infer<typeof feedbackSchema>;

/** Правка из /admin/feedback: статус и заметка (пустая — убрать). */
export const adminPatchSchema = z.object({
  status: z.enum(["NEW", "IN_PROGRESS", "DONE", "REJECTED"]).optional(),
  adminNote: z
    .string()
    .trim()
    .max(NOTE_MAX, `Заметка — до ${NOTE_MAX} символов`)
    .transform((s) => (s === "" ? null : s))
    .optional(),
});
