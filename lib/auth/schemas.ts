import { z } from "zod";
import { nicknameSchema } from "@/lib/social/league";

const login = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "Логин — минимум 3 символа")
  .max(32, "Логин — максимум 32 символа")
  .regex(/^[a-z0-9_.-]+$/, "Только латинские буквы, цифры, «_», «.», «-»")
  // tg<цифры> — логины аккаунтов из Telegram Mini App
  .refine((v) => !/^tg\d+(_\d+)?$/.test(v), "Этот логин зарезервирован");

const email = z.string().trim().toLowerCase().pipe(z.email("Некорректный email"));

export const password = z
  .string()
  .min(8, "Пароль — минимум 8 символов")
  .max(128, "Пароль — максимум 128 символов")
  .regex(/[a-zа-яё]/, "Нужна хотя бы одна строчная буква")
  .regex(/[A-ZА-ЯЁ]/, "Нужна хотя бы одна заглавная буква")
  .regex(/\d/, "Нужна хотя бы одна цифра");

const passwordsMatch = (d: { password: string; confirmPassword: string }) =>
  d.password === d.confirmPassword;
const mismatch = { path: ["confirmPassword"], message: "Пароли не совпадают" };

export const registerSchema = z
  .object({
    login,
    email,
    name: z
      .string()
      .trim()
      .max(50, "Имя — максимум 50 символов")
      .transform((v) => v || undefined),
    password,
    confirmPassword: z.string(),
    // 152-ФЗ: отдельное согласие на обработку персональных данных (галочка на форме)
    consent: z.literal("on", { error: "Без согласия на обработку данных зарегистрироваться нельзя" }),
    // «Я тренер» — сразу режим тренера; клиенты видят тренера по нику, поэтому ник обязателен
    coach: z
      .literal("on")
      .optional()
      .transform((v) => v === "on"),
    nickname: z.string().optional(),
  })
  .refine(passwordsMatch, mismatch)
  .superRefine((d, ctx) => {
    if (!d.coach) return;
    const nick = nicknameSchema.safeParse(d.nickname ?? "");
    if (!nick.success) ctx.addIssue({ code: "custom", path: ["nickname"], message: nick.error.issues[0]?.message ?? "Проверьте ник" });
  })
  .transform((d) => ({ ...d, nickname: d.coach ? nicknameSchema.parse(d.nickname) : undefined }));

export const loginSchema = z.object({
  identifier: z.string().trim().toLowerCase().min(1, "Введите логин или email"),
  password: z.string().min(1, "Введите пароль"),
});

export const forgotPasswordSchema = z.object({ email });

/** «Вход на сайте» для аккаунта из Telegram: email и пароль по тем же правилам, что при регистрации. */
export const siteLoginSchema = z
  .object({ email, password, confirmPassword: z.string() })
  .refine(passwordsMatch, mismatch);

export const resetPasswordSchema = z
  .object({
    token: z.string().min(1, "Ссылка недействительна"),
    password,
    confirmPassword: z.string(),
  })
  .refine(passwordsMatch, mismatch);
