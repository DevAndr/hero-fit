import "server-only";
import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.url(),
  JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET должен быть не короче 32 символов"),
  JWT_REFRESH_SECRET: z.string().min(32, "JWT_REFRESH_SECRET должен быть не короче 32 символов"),
  JWT_ACCESS_TTL: z.string().default("15m"),
  JWT_REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(30),
  APP_URL: z.url().default("http://localhost:3000"),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  MAIL_FROM: z.string().default("Hero Fit <no-reply@hero-fit.local>"),
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().default("mailto:admin@hero-fit.local"),
  NOTIFICATIONS_WORKER: z.enum(["on", "off"]).default("on"),
  /** off — ежедневный сундук не открывается сам (e2e: диалог не мешает остальным сценариям). */
  DAILY_CHEST_AUTOOPEN: z.enum(["on", "off"]).default("on"),
  /** off — регистрация сразу отмечает экскурсию пройденной (e2e: экскурсия не мешает остальным сценариям). */
  ONBOARDING_TOUR: z.enum(["on", "off"]).default("on"),
  CRON_SECRET: z.string().optional(),
  /** Только e2e: cron-эндпоинт принимает ?now= (тестовые часы для напоминаний). */
  E2E_TEST_CLOCK: z.enum(["1"]).optional(),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  throw new Error(
    `Некорректные переменные окружения (см. .env.example):\n${z.prettifyError(parsed.error)}`,
  );
}

export const env = parsed.data;
