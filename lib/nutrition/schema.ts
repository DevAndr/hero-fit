import { z } from "zod";

const number = (min: number, max: number, message: string) =>
  z.preprocess((v) => (typeof v === "string" ? Number(v.replace(",", ".")) : v), z.number({ message }).min(min, message).max(max, message));

/** Анкета для нормы (`/nutrition`): все поля обязательны в форме; в базе — nullable (по желанию пользователя). */
export const nutritionProfileSchema = z.object({
  gender: z.enum(["MALE", "FEMALE"], { message: "Укажите пол" }),
  birthYear: z.preprocess(
    (v) => (typeof v === "string" ? Number(v) : v),
    z.number({ message: "Год рождения" }).int("Год рождения").refine((y) => y >= 1926 && y <= new Date().getFullYear() - 14, "Год рождения — не раньше 1926, возраст от 14 лет"),
  ),
  heightCm: number(120, 230, "Рост — от 120 до 230 см").pipe(z.number().int("Рост — целым числом")),
  weight: number(30, 300, "Вес — от 30 до 300 кг").transform((w) => Math.round(w * 10) / 10),
  activity: z.enum(["SEDENTARY", "LIGHT", "MODERATE", "HIGH", "VERY_HIGH"], { message: "Выберите активность" }),
  goal: z.enum(["LOSE", "MAINTAIN", "GAIN"], { message: "Выберите цель" }),
});

export type NutritionProfileInput = z.infer<typeof nutritionProfileSchema>;
