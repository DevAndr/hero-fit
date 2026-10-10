"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { LINK_TOKEN_TTL_MS, newLinkToken, telegramEnabled } from "@/lib/telegram/format";
import { unlinkTelegram } from "@/lib/telegram/updates";

/** Одноразовая ссылка на бота: /start <token> привяжет чат к этому аккаунту. */
export async function createTelegramLinkAction(): Promise<{ url: string } | { error: string }> {
  const user = await requireUser();
  if (!telegramEnabled(env)) return { error: "Telegram не настроен на сервере" };
  const token = newLinkToken();
  await db.telegramLinkToken.create({ data: { token, userId: user.id, expiresAt: new Date(Date.now() + LINK_TOKEN_TTL_MS) } });
  return { url: `https://t.me/${env.TELEGRAM_BOT_USERNAME}?start=${token}` };
}

export async function unlinkTelegramAction() {
  const user = await requireUser();
  await unlinkTelegram({ userId: user.id });
  revalidatePath("/settings");
}

export async function setTelegramNotifyAction(on: boolean) {
  const user = await requireUser();
  await db.user.update({ where: { id: user.id }, data: { notifyTelegram: z.boolean().parse(on) } });
  revalidatePath("/settings");
}
