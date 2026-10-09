import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { generateFriendCode, normalizeFriendCode } from "@/lib/social/league";

/** Код приглашения тренера (как код друга: 8 символов, без похожих); создаётся при первом включении режима. */
export async function ensureCoachCode(userId: string): Promise<string> {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { coachCode: true } });
  if (user.coachCode) return user.coachCode;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      // Условие coachCode = null — параллельные запросы не перезапишут код друг друга
      await db.user.updateMany({ where: { id: userId, coachCode: null }, data: { coachCode: generateFriendCode() } });
      break;
    } catch (e) {
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
    }
  }
  const saved = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { coachCode: true } });
  if (!saved.coachCode) throw new Error("Не удалось создать код тренера");
  return saved.coachCode;
}

/** Тренер по коду из ссылки (регистр и дефис не важны); выключенный режим — как неизвестный код. */
export async function getCoachByCode(input: string) {
  const code = normalizeFriendCode(input);
  if (!code) return null;
  return db.user.findFirst({ where: { coachCode: code, isCoach: true }, select: { id: true, nickname: true, name: true } });
}
