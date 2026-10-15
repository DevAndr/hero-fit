import { z } from "zod";

/** Ошибка для записи — общая для сервера и браузера (spec: docs/superpowers/specs/2026-10-15-error-monitoring-design.md). */
export type ErrorInput = {
  source: "SERVER" | "CLIENT";
  message: string;
  stack: string | null;
  path: string | null;
  version: string | null;
  userAgent: string | null;
  userId: string | null;
};

export const MAX_BODY_BYTES = 8192;
export const MESSAGE_MAX = 1000;
export const STACK_MAX = 6000;
export const PATH_MAX = 300;

/** Отчёт браузера в `POST /api/errors`. */
export const clientReportSchema = z.object({
  message: z.string().min(1).max(MESSAGE_MAX),
  stack: z.string().max(STACK_MAX).optional(),
  path: z.string().max(PATH_MAX).optional(),
  version: z.string().max(30).optional(),
});

/** Путь без query-строки и якоря: в query бывают токены (сброс пароля). */
export const stripQuery = (path: string) => path.split(/[?#]/, 1)[0];
