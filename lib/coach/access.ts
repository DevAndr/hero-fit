import "server-only";
import { notFound } from "next/navigation";
import { requireUser, type CurrentUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";

/** Вошёл и включил режим тренера — иначе 404 (не раскрываем, что раздел существует). */
export async function requireCoach(): Promise<CurrentUser> {
  const user = await requireUser();
  if (!user.isCoach) notFound();
  return user;
}

/**
 * Единая проверка доступа тренера к данным клиента: активная связь именно с этим тренером, иначе 404.
 * Каждая страница и действие тренера над клиентом начинается с неё.
 */
export async function requireClientOf(clientId: string) {
  const coach = await requireCoach();
  const link = await db.coachLink.findFirst({
    where: { coachId: coach.id, clientId, endedAt: null },
    select: {
      createdAt: true,
      client: { select: { id: true, nickname: true, name: true, timeZone: true, xp: true } },
    },
  });
  if (!link) notFound();
  return { coach, client: link.client, linkedAt: link.createdAt };
}

/** Активный тренер клиента (карточка «Мой тренер»); null — тренера нет. */
export async function activeCoachOf(clientId: string) {
  const link = await db.coachLink.findFirst({
    where: { clientId, endedAt: null },
    select: { createdAt: true, coach: { select: { id: true, nickname: true, name: true } } },
  });
  return link ? { ...link.coach, linkedAt: link.createdAt } : null;
}
