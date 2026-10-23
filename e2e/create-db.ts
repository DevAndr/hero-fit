import { Client } from "pg";

/**
 * Пользователей в тестовой базе, после которых она пересоздаётся (E2E_DB_MAX_USERS): база не чистится между прогонами,
 * каждый полный прогон добавляет ~1,5 тыс. пользователей, а тики и рейтинг идут по всем — на 32 тыс. прогон шёл
 * 13 минут вместо 9 и сыпал таймаутами в случайных местах.
 */
const MAX_USERS = Number(process.env.E2E_DB_MAX_USERS) || 10_000;

async function userCount(url: string): Promise<number> {
  const db = new Client({ connectionString: url });
  await db.connect();
  try {
    const { rows } = await db.query<{ n: string }>(`select count(*) n from "User"`);
    return Number(rows[0].n);
  } catch {
    return 0; // миграции ещё не применены — таблицы нет
  } finally {
    await db.end();
  }
}

/** CREATE DATABASE, если тестовой базы ещё нет, и пересоздание разросшейся (подключение — к основной базе того же сервера). */
async function main() {
  const name = new URL(process.env.DATABASE_URL!).pathname.slice(1);
  const quoted = `"${name.replaceAll('"', '""')}"`;
  const admin = new Client({ connectionString: process.env.E2E_ADMIN_URL });
  await admin.connect();
  try {
    let { rowCount } = await admin.query("select 1 from pg_database where datname = $1", [name]);
    if (rowCount && name.endsWith("_test")) {
      const users = await userCount(process.env.DATABASE_URL!);
      if (users > MAX_USERS) {
        await admin.query(`drop database ${quoted} with (force)`);
        console.log(`[e2e] база ${name} разрослась (${users} пользователей > ${MAX_USERS}) — пересоздаю`);
        rowCount = 0;
      }
    }
    if (!rowCount) {
      await admin.query(`create database ${quoted}`);
      console.log(`[e2e] создана база ${name}`);
    }
  } finally {
    await admin.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
