import { Client } from "pg";

/** CREATE DATABASE, если тестовой базы ещё нет (подключение — к основной базе того же сервера). */
async function main() {
  const name = new URL(process.env.DATABASE_URL!).pathname.slice(1);
  const admin = new Client({ connectionString: process.env.E2E_ADMIN_URL });
  await admin.connect();
  try {
    const { rowCount } = await admin.query("select 1 from pg_database where datname = $1", [name]);
    if (!rowCount) {
      await admin.query(`create database "${name.replaceAll('"', '""')}"`);
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
