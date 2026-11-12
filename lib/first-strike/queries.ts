import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { isEnabled } from "@/lib/flags/server";
import { canStrike } from "@/lib/first-strike/rules";

type Client = Prisma.TransactionClient | typeof db;

/** Завершённые обычные тренировки (сессия растяжки не считается). */
export function completedWorkouts(client: Client, userId: string) {
  return client.workout.count({ where: { userId, status: "COMPLETED", stretchOnly: false } });
}

/** Показывать ли «Первый удар»: без запроса к БД, если удар уже был или флаг выключен. */
export async function getStrikeOffer(user: { id: string; firstStrikeAt: Date | null }): Promise<boolean> {
  if (user.firstStrikeAt) return false;
  const flag = await isEnabled("first_strike", user.id);
  if (!flag) return false;
  return canStrike({ flag, firstStrikeAt: user.firstStrikeAt, completedWorkouts: await completedWorkouts(db, user.id) });
}
