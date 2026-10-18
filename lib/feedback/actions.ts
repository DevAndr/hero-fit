"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { alertAdminsAboutFeedback } from "./admin-alert";
import { FEEDBACK_DAILY_MAX } from "./rules";
import { feedbackSchema } from "./schema";

type Result = { ok: true } | { ok: false; error: string };

const DAY = 24 * 60 * 60 * 1000;

/** Обращение из /feedback: проверка, лимит за сутки, запись с контекстом, сигнал админам. */
export async function submitFeedbackAction(input: unknown): Promise<Result> {
  const user = await requireUser();
  const parsed = feedbackSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Проверьте поля" };
  const recent = await db.feedback.count({ where: { userId: user.id, createdAt: { gt: new Date(Date.now() - DAY) } } });
  if (recent >= FEEDBACK_DAILY_MAX) return { ok: false, error: "Слишком много обращений — попробуйте завтра" };
  const { kind, body, page } = parsed.data;
  await db.feedback.create({
    data: {
      userId: user.id,
      kind,
      body,
      page: page ?? null,
      version: process.env.APP_VERSION ?? null,
      userAgent: (await headers()).get("user-agent")?.slice(0, 300) ?? null,
    },
  });
  // Ответ пользователю не ждёт Telegram
  alertAdminsAboutFeedback(kind).catch((e) => console.error("[feedback] admin alert failed", e));
  revalidatePath("/feedback");
  return { ok: true };
}
