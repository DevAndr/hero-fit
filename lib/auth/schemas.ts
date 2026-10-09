import { z } from "zod";

const login = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "Логин — минимум 3 символа")
  .max(32, "Логин — максимум 32 символа")
  .regex(/^[a-z0-9_.-]+$/, "Только латинские буквы, цифры, «_», «.», «-»");

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
  })
  .refine(passwordsMatch, mismatch);

export const loginSchema = z.object({
  identifier: z.string().trim().toLowerCase().min(1, "Введите логин или email"),
  password: z.string().min(1, "Введите пароль"),
});

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z
  .object({
    token: z.string().min(1, "Ссылка недействительна"),
    password,
    confirmPassword: z.string(),
  })
  .refine(passwordsMatch, mismatch);
