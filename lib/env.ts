import "server-only";
import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.url(),
  JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET должен быть не короче 32 символов"),
  JWT_REFRESH_SECRET: z.string().min(32, "JWT_REFRESH_SECRET должен быть не короче 32 символов"),
  JWT_ACCESS_TTL: z.string().default("15m"),
  JWT_REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(30),
  APP_URL: z.url().default("http://localhost:3000"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  throw new Error(
    `Некорректные переменные окружения (см. .env.example):\n${z.prettifyError(parsed.error)}`,
  );
}

export const env = parsed.data;
