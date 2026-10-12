"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { queueGoal } from "@/lib/analytics/queue";
import { safeRedirectPath } from "@/lib/auth/redirect";
import { ensureCoachCode } from "@/lib/coach/queries";
import { db } from "@/lib/db";
import { nicknameKey } from "@/lib/social/league";
import { RELEASES } from "@/lib/changelog/releases";
import { latestReleaseId } from "@/lib/changelog/view";
import { env } from "@/lib/env";
import { sendMail } from "@/lib/mail";
import { ACCESS_COOKIE, clearAuthCookies, REFRESH_COOKIE, writeAuthCookies } from "@/lib/auth/cookies";
import { burnPasswordCheck, hashPassword, verifyPassword } from "@/lib/auth/password";
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  siteLoginSchema,
} from "@/lib/auth/schemas";
import { requireUser } from "@/lib/auth/dal";
import { recordLoginFailure, recordLoginSuccess, throttleKeys, throttleLock } from "@/lib/auth/throttle";
import { throttleMessage } from "@/lib/auth/throttle-rules";
import { createSession, revokeAllUserSessions, revokeSession, sessionEmbedded } from "@/lib/auth/session";
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

async function startSession(userId: string) {
  const tokens = await createSession(userId, await clientMeta());
  writeAuthCookies(await cookies(), tokens);
}

// ───────────────────────────── Регистрация ─────────────────────────────

export async function registerAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData, PASSWORD_FIELDS);
  const parsed = registerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: z.flattenError(parsed.error).fieldErrors, values };

  const { login, email, name, password, coach, nickname } = parsed.data;
  const coachProfile = coach && nickname ? { isCoach: true, nickname, nicknameKey: nicknameKey(nickname) } : {};

  const taken = await db.user.findFirst({
    where: { OR: [{ login }, { email }] },
    select: { login: true, email: true },
  });
  const nickTaken = coachProfile.nicknameKey
    ? await db.user.findFirst({ where: { nicknameKey: coachProfile.nicknameKey }, select: { id: true } })
    : null;
  if (taken || nickTaken) {
    return {
      values,
      errors: {
        login: taken?.login === login ? ["Этот логин уже занят"] : undefined,
        email: taken?.email === email ? ["Этот email уже зарегистрирован"] : undefined,
        nickname: nickTaken ? ["Этот ник уже занят"] : undefined,
      },
    };
  }

  let userId: string;
  try {
    const user = await db.user.create({
      data: { login, email, name, passwordHash: await hashPassword(password), privacyAcceptedAt: new Date(), ...coachProfile,
        onboardedAt: env.ONBOARDING_TOUR === "off" ? new Date() : null,
        changelogSeen: latestReleaseId(RELEASES), // новому всё в новинку — без точки «Что нового»
      },
      select: { id: true },
    });
    userId = user.id;
  } catch (e) {
    // Гонка двух одновременных регистраций — подстраховка unique-индексом.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { values, message: coach ? "Логин, email или ник уже заняты" : "Логин или email уже заняты" };
    }
    throw e;
  }

  await startSession(userId);
  await queueGoal("signup");
  if (coach) {
    // Тренер — сразу в кабинет клиентов с готовой ссылкой-приглашением
    await ensureCoachCode(userId);
    await queueGoal("coach_enabled");
    redirect("/coach");
  }
  redirect(safeRedirectPath(formData.get("next")));
}

// ───────────────────────────── Вход ─────────────────────────────

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData, PASSWORD_FIELDS);
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: z.flattenError(parsed.error).fieldErrors, values };

  const { identifier, password } = parsed.data;
  // Подбор пароля: в блокировке не проверяем даже верный пароль
  const keys = throttleKeys(identifier, (await headers()).get("x-real-ip"));
  const locked = await throttleLock(keys);
  if (locked) return { values, message: throttleMessage(locked) };

  const user = await db.user.findFirst({
    where: { OR: [{ login: identifier }, { email: identifier }] },
    select: { id: true, passwordHash: true },
  });

  // Аккаунт из Telegram без пароля — как неизвестный пользователь (то же время ответа)
  if (!user?.passwordHash) {
    await burnPasswordCheck(password);
    await recordLoginFailure(keys);
    return { values, message: "Неверный логин или пароль" };
  }
  if (!(await verifyPassword(user.passwordHash, password))) {
    await recordLoginFailure(keys);
    return { values, message: "Неверный логин или пароль" };
  }

  await recordLoginSuccess(keys);
  await startSession(user.id);
  redirect(safeRedirectPath(formData.get("next")));
}

// ───────────────────────────── Выход ─────────────────────────────

export async function logoutAction() {
  const store = await cookies();
  const access = await verifyAccessToken(store.get(ACCESS_COOKIE)?.value);
  const refresh = await verifyRefreshToken(store.get(REFRESH_COOKIE)?.value);
  const sessionId = access?.sessionId ?? refresh?.sessionId;

  const embedded = await sessionEmbedded(sessionId);
  if (sessionId) await revokeSession(sessionId);
  clearAuthCookies(store, { embedded });
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

  if (user?.email) {
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

// ───────────────────────────── Вход на сайте (аккаунт из Telegram) ─────────────────────────────

/** Аккаунт без пароля (создан в Telegram Mini App) задаёт email и пароль — и входит на сайте как обычно. */
export async function setSiteLoginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const values = formValues(formData, PASSWORD_FIELDS);
  const parsed = siteLoginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: z.flattenError(parsed.error).fieldErrors, values };

  const me = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { passwordHash: true } });
  if (me.passwordHash) return { values, message: "Пароль уже задан" };

  const taken = { values, errors: { email: ["Этот email уже зарегистрирован"] } };
  if (await db.user.findFirst({ where: { email: parsed.data.email, NOT: { id: user.id } }, select: { id: true } })) return taken;
  try {
    await db.user.update({
      where: { id: user.id },
      data: { email: parsed.data.email, passwordHash: await hashPassword(parsed.data.password) },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return taken;
    throw e;
  }
  // Без revalidatePath: блок пропал бы вместе с сообщением об успехе (он только для аккаунтов без пароля)
  return { success: true, message: "Теперь можно входить на сайте по email и паролю" };
}
