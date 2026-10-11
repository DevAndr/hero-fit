/** Оценка тренировки: тяжесть 1–10 (RPE за тренировку) и заметка — чистые функции. */
import { z } from "zod";

export const feedbackSchema = z.object({
  rpe: z.number().int().min(1, "Выберите тяжесть от 1 до 10").max(10, "Выберите тяжесть от 1 до 10"),
  note: z
    .string()
    .trim()
    .max(500, "Не больше 500 символов")
    .transform((s) => s || null),
});

export type Feedback = z.infer<typeof feedbackSchema>;

export function rpeLabel(rpe: number): string {
  if (rpe <= 2) return "Очень легко";
  if (rpe <= 4) return "Легко";
  if (rpe <= 6) return "Нормально";
  if (rpe <= 8) return "Тяжело";
  return "На пределе";
}

/** Тяжесть, о которой тренеру стоит узнать сразу. */
const HARD_RPE = 9;

/**
 * Что сказать тренеру: `first` — первое уведомление (есть заметка или было на пределе), `update` — после него
 * появилась или изменилась заметка; правка одной тяжести и удаление заметки не уведомляют.
 */
export function coachNotice(f: {
  rpe: number;
  note: string | null;
  prevNote: string | null;
  notifiedAt: Date | null;
}): "first" | "update" | null {
  if (f.notifiedAt === null) return f.note !== null || f.rpe >= HARD_RPE ? "first" : null;
  return f.note !== null && f.note !== f.prevNote ? "update" : null;
}

/** Подпись уведомлений об оценке: по ней их отличают от других уведомлений тренера с той же ссылкой. */
export const FEEDBACK_NOTICE_BODY = "Оценка тренировки";

const NOTE_MAX = 80;

/** «Маша: тяжесть 10/10 · болела спина» или «Маша: тяжесть 9/10 — На пределе». */
export function feedbackNotice(name: string, rpe: number, note: string | null): string {
  const head = `${name}: тяжесть ${rpe}/10`;
  if (!note) return `${head} — ${rpeLabel(rpe)}`;
  return `${head} · ${note.length > NOTE_MAX ? `${note.slice(0, NOTE_MAX - 1)}…` : note}`;
}
