import "server-only";
import { env } from "@/lib/env";
import { sendAdminTelegram } from "@/lib/errors/notify";
import { FEEDBACK_ALERTS_HOURLY, feedbackAlertText, type FeedbackKind } from "./rules";

const HOUR = 3_600_000;
/** Отправленные за час — в памяти процесса: лавина обращений не превращается в лавину сообщений. */
const sent: number[] = [];

/** Новое обращение — админам в Telegram (без текста и автора). */
export async function alertAdminsAboutFeedback(kind: FeedbackKind, now = Date.now()) {
  while (sent.length && now - sent[0] > HOUR) sent.shift();
  if (sent.length >= FEEDBACK_ALERTS_HOURLY) return;
  sent.push(now);
  await sendAdminTelegram(feedbackAlertText(kind, env.APP_URL));
}
