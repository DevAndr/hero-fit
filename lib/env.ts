import "server-only";
import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.url(),
  JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET должен быть не короче 32 символов"),
  JWT_REFRESH_SECRET: z.string().min(32, "JWT_REFRESH_SECRET должен быть не короче 32 символов"),
  JWT_ACCESS_TTL: z.string().default("15m"),
  JWT_REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(30),
  APP_URL: z.url().default("http://localhost:3000"),
  /** Логины админов через запятую (lib/auth/admin.ts) — страница /admin/flags. */
  ADMIN_LOGINS: z.string().optional(),
  /** Кэш фича-флагов в памяти процесса, мс (e2e — 0). */
  FLAGS_CACHE_MS: z.coerce.number().int().min(0).default(10_000),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  MAIL_FROM: z.string().default("Hero Fit <no-reply@hero-fit.local>"),
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().default("mailto:admin@hero-fit.local"),
  /** ntfy для push в Android-приложении (спека 2026-10-25-native-push-ntfy); пусто — нативные подписки не принимаются. */
  NTFY_URL: z
    .union([z.literal(""), z.url().startsWith("https://")])
    .optional()
    .transform((v) => v || undefined),
  /** SHA-256 ключа подписи Android-приложения (android/README.md), через запятую — App Links (/.well-known/assetlinks.json). */
  ANDROID_CERT_SHA256: z.string().optional(),
  NOTIFICATIONS_WORKER: z.enum(["on", "off"]).default("on"),
  /** off — ежедневный сундук не открывается сам (e2e: диалог не мешает остальным сценариям). */
  DAILY_CHEST_AUTOOPEN: z.enum(["on", "off"]).default("on"),
  /** off — регистрация сразу отмечает экскурсию пройденной (e2e: экскурсия не мешает остальным сценариям). */
  ONBOARDING_TOUR: z.enum(["on", "off"]).default("on"),
  CRON_SECRET: z.string().optional(),
  /** Только e2e: cron-эндпоинт принимает ?now= (тестовые часы для напоминаний). */
  E2E_TEST_CLOCK: z.enum(["1"]).optional(),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  /** Telegram-бот (@BotFather): без токена и имени интеграция выключена. */
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_BOT_USERNAME: z.string().optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().optional(),
  TELEGRAM_API_URL: z.url().default("https://api.telegram.org"),
  /** on — локальная разработка: обновления через getUpdates вместо webhook. */
  TELEGRAM_POLLING: z.enum(["on", "off"]).default("off"),
  /** WHOOP (developer.whoop.com): без client id интеграция выключена. Ключ — 32 байта base64 для шифрования токенов. */
  WHOOP_CLIENT_ID: z.string().optional(),
  WHOOP_CLIENT_SECRET: z.string().optional(),
  WHOOP_TOKEN_KEY: z.string().optional(),
  WHOOP_API_URL: z.url().default("https://api.prod.whoop.com"),
}).refine((e) => !e.TELEGRAM_BOT_TOKEN || (e.TELEGRAM_WEBHOOK_SECRET?.length ?? 0) >= 32, {
  path: ["TELEGRAM_WEBHOOK_SECRET"],
  message: "TELEGRAM_WEBHOOK_SECRET обязателен при TELEGRAM_BOT_TOKEN (32+ символа)",
}).refine(
  (e) =>
    !e.WHOOP_CLIENT_ID ||
    (!!e.WHOOP_CLIENT_SECRET && Buffer.from(e.WHOOP_TOKEN_KEY ?? "", "base64").length === 32),
  {
    path: ["WHOOP_TOKEN_KEY"],
    message: "WHOOP_TOKEN_KEY обязателен при WHOOP_CLIENT_ID (32 байта base64)",
  },
);

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  throw new Error(
    `Некорректные переменные окружения (см. .env.example):\n${z.prettifyError(parsed.error)}`,
  );
}

export const env = parsed.data;
