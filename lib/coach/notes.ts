/** Заметка тренера о клиенте (видит только тренер): проверка текста (чистая функция). */
import { z } from "zod";

export const NOTE_MAX = 5000;

/** Пустой текст после обрезки — заметка удаляется. */
export const noteTextSchema = z.string().trim().max(NOTE_MAX, `Не длиннее ${NOTE_MAX} символов`);
