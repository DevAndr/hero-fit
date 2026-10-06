"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { sendMail } from "@/lib/mail";
import { ACCESS_COOKIE, clearAuthCookies, REFRESH_COOKIE, writeAuthCookies } from "@/lib/auth/cookies";
import { burnPasswordCheck, hashPassword, verifyPassword } from "@/lib/auth/password";
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from "@/lib/auth/schemas";
import { createSession, revokeAllUserSessions, revokeSession } from "@/lib/auth/session";
import { hashToken, randomToken, verifyAccessToken, verifyRefreshToken } from "@/lib/auth/tokens";

export type FormState = {
  errors?: Record<string, string[] | undefined>;
  message?: string;
  success?: boolean;
  /** Введённые значения (без паролей) — React сбрасывает форму после action. */
  values?: Record<string, string>;
};

const RESET_TTL_MS = 60 * 60 * 1000;

function formValues(formData: FormData, omit: string[] = []) {
  const values: Record<string, string> = {};
  for (const [key, value] of formData) {
    if (typeof value === "string" && !omit.includes(key) && !key.startsWith("$")) values[key] = value;
  }
  return values;
}

const PASSWORD_FIELDS = ["password", "confirmPassword"];

async function clientMeta() {
  const h = await headers();
  return {
    userAgent: h.get("user-agent"),
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip"),
  };
}

/** Разрешаем редирект только на внутренние пути. */
function safeRedirectPath(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return "/dashboard";
  return value;
}

async function startSession(userId: string) {
  const tokens = await createSession(userId, await clientMeta());
  writeAuthCookies(await cookies(), tokens);
}

// ───────────────────────────── Регистрация ─────────────────────────────

export async function registerAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData, PASSWORD_FIELDS);
  const parsed = registerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: z.flattenError(parsed.error).fieldErrors, values };

  const { login, email, name, password } = parsed.data;

  const taken = await db.user.findFirst({
    where: { OR: [{ login }, { email }] },
    select: { login: true, email: true },
  });
  if (taken) {
    return {
      values,
      errors: {
        login: taken.login === login ? ["Этот логин уже занят"] : undefined,
        email: taken.email === email ? ["Этот email уже зарегистрирован"] : undefined,
      },
    };
  }

  let userId: string;
  try {
    const user = await db.user.create({
      data: { login, email, name, passwordHash: await hashPassword(password) },
      select: { id: true },
    });
    userId = user.id;
  } catch (e) {
    // Гонка двух одновременных регистраций — подстраховка unique-индексом.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { values, message: "Логин или email уже заняты" };
    }
    throw e;
  }

  await startSession(userId);
  redirect("/dashboard");
}

// ───────────────────────────── Вход ─────────────────────────────

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData, PASSWORD_FIELDS);
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: z.flattenError(parsed.error).fieldErrors, values };

  const { identifier, password } = parsed.data;
  const user = await db.user.findFirst({
    where: { OR: [{ login: identifier }, { email: identifier }] },
    select: { id: true, passwordHash: true },
  });

  if (!user) {
    await burnPasswordCheck(password);
    return { values, message: "Неверный логин или пароль" };
  }
  if (!(await verifyPassword(user.passwordHash, password))) {
    return { values, message: "Неверный логин или пароль" };
  }

  await startSession(user.id);
  redirect(safeRedirectPath(formData.get("next")));
}

// ───────────────────────────── Выход ─────────────────────────────

export async function logoutAction() {
  const store = await cookies();
  const access = await verifyAccessToken(store.get(ACCESS_COOKIE)?.value);
  const refresh = await verifyRefreshToken(store.get(REFRESH_COOKIE)?.value);
  const sessionId = access?.sessionId ?? refresh?.sessionId;

  if (sessionId) await revokeSession(sessionId);
  clearAuthCookies(store);
  redirect("/login");
}

// ───────────────────────────── Восстановление пароля ─────────────────────────────

export async function forgotPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData);
  const parsed = forgotPasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: z.flattenError(parsed.error).fieldErrors, values };

  const user = await db.user.findUnique({
    where: { email: parsed.data.email },
    select: { id: true, email: true },
  });

  if (user) {
    const token = randomToken();
    await db.$transaction([
      // Действует только последняя ссылка.
      db.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      }),
      db.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: hashToken(token),
          expiresAt: new Date(Date.now() + RESET_TTL_MS),
        },
      }),
    ]);

    const link = new URL(`/reset-password?token=${token}`, env.APP_URL).toString();
    await sendMail({
      to: user.email,
      subject: "Hero Fit — восстановление пароля",
      text: `Чтобы задать новый пароль, перейдите по ссылке (действует 1 час): ${link}`,
      html: `<p>Чтобы задать новый пароль, перейдите по ссылке (действует 1 час):</p><p><a href="${link}">${link}</a></p>`,
    });
  }

  // Одинаковый ответ, чтобы нельзя было проверить, зарегистрирован ли email.
  return {
    success: true,
    message: "Если аккаунт с таким email существует, мы отправили на него ссылку для сброса пароля.",
  };
}

export async function resetPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = resetPasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: z.flattenError(parsed.error).fieldErrors };

  const { token, password } = parsed.data;
  const record = await db.passwordResetToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!record || record.usedAt || record.expiresAt <= new Date()) {
    return { message: "Ссылка недействительна или устарела. Запросите новую." };
  }

  const passwordHash = await hashPassword(password);
  const claimed = await db.$transaction(async (tx) => {
    const { count } = await tx.passwordResetToken.updateMany({
      where: { id: record.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (count === 0) return false;
    await tx.user.update({ where: { id: record.userId }, data: { passwordHash } });
    return true;
  });
  if (!claimed) return { message: "Ссылка уже использована. Запросите новую." };

  // После смены пароля выкидываем все устройства.
  await revokeAllUserSessions(record.userId);
  clearAuthCookies(await cookies());
  redirect("/login?reset=1");
}
