import { execSync } from "node:child_process";

/**
 * e2e работают на отдельной базе (по умолчанию `<имя>_test` на том же сервере Postgres),
 * чтобы dev-сервер разработчика не забирал очередь push и не видел тестовых пользователей.
 * Переопределить — E2E_DATABASE_URL.
 */
export function testDatabaseUrl(base = process.env.DATABASE_URL) {
  if (process.env.E2E_DATABASE_URL) return process.env.E2E_DATABASE_URL;
  if (!base) throw new Error("DATABASE_URL не задан (.env)");
  const url = new URL(base);
  const name = url.pathname.slice(1);
  url.pathname = `/${name.endsWith("_test") ? name : `${name}_test`}`;
  return url.toString();
}

/** Создать базу при необходимости, применить миграции и сид (идемпотентно). Синхронно — до старта webServer. */
export function prepareTestDatabase(adminUrl: string, testUrl: string) {
  const env = { ...process.env, DATABASE_URL: testUrl };
  execSync(`npx tsx e2e/create-db.ts`, { stdio: "inherit", env: { ...env, E2E_ADMIN_URL: adminUrl } });
  execSync("npx prisma migrate deploy", { stdio: ["ignore", "ignore", "inherit"], env });
  execSync("npx prisma db seed", { stdio: ["ignore", "ignore", "inherit"], env });
}
