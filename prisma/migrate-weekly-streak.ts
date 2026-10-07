/**
 * Пересчёт недельного streak по истории тренировок для всех пользователей (идемпотентный).
 * Запуск после миграции схемы: npm run db:migrate-streak
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import { recomputeStreak } from "../lib/progress/streak-db";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  const now = new Date();
  const users = await db.user.findMany({ select: { id: true } });
  for (const { id } of users) await recomputeStreak(db, id, now);
  console.log(`Недельный streak пересчитан: ${users.length} пользователей`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
