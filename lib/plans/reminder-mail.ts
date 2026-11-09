import "server-only";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { sendMail } from "@/lib/mail";
import type { Occurrence } from "./expand";
import { planReminderMail } from "./reminders";

/** Письмо-напоминание о разовой тренировке, если пользователь попросил (PlanEntry.emailReminder). Никогда не бросает. */
export async function sendPlanReminderMail(
  userId: string,
  o: Pick<Occurrence, "key" | "title" | "time" | "date">,
  today: string,
): Promise<void> {
  if (!o.key.startsWith("e:")) return;
  try {
    const entry = await db.planEntry.findFirst({
      where: { id: o.key.slice(2), userId, emailReminder: true },
      select: { user: { select: { email: true } } },
    });
    const to = entry?.user.email;
    if (!to) return;
    await sendMail({ to, ...planReminderMail(o, today, env.APP_URL) });
  } catch (e) {
    console.error("[plan-reminder] письмо не отправлено", e);
  }
}
