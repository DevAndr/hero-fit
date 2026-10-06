import "server-only";
import nodemailer from "nodemailer";
import { env } from "@/lib/env";

type Mail = { to: string; subject: string; text: string; html?: string };

const transport = env.SMTP_HOST
  ? nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
    })
  : null;

/** Без SMTP_HOST письма выводятся в консоль сервера — удобно для разработки. */
export async function sendMail(mail: Mail) {
  if (!transport) {
    console.info(`\n[mail] → ${mail.to}\n  ${mail.subject}\n  ${mail.text}\n`);
    return;
  }
  await transport.sendMail({ from: env.MAIL_FROM, ...mail });
}
