/** Комментарии тренера: проверка текста и превью для уведомления (чистые функции). */
import { z } from "zod";

export const COMMENT_MAX = 1000;
const PREVIEW_MAX = 120;

export const commentTextSchema = z.string().trim().min(1, "Введите комментарий").max(COMMENT_MAX, `Не длиннее ${COMMENT_MAX} символов`);

export function commentPreview(text: string): string {
  return text.length > PREVIEW_MAX ? `${text.slice(0, PREVIEW_MAX)}…` : text;
}
