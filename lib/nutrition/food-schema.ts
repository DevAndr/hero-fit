import { z } from "zod";

const toNumber = (v: unknown) => (typeof v === "string" ? (v.trim() === "" ? undefined : Number(v.replace(",", "."))) : v);

const grams = (label: string) =>
  z.preprocess(
    (v) => toNumber(v) ?? null,
    z
      .number({ message: `${label} — число` })
      .min(0, `${label} — от 0 до 500 г`)
      .max(500, `${label} — от 0 до 500 г`)
      .transform((g) => Math.round(g * 10) / 10)
      .nullable(),
  );

/** Запись дневника из формы: пустые Б/Ж/У → null, запятая — разделитель. Дата проверяется отдельно (parseDiaryDate). */
export const foodEntrySchema = z.object({
  meal: z.enum(["BREAKFAST", "LUNCH", "DINNER", "SNACK"], { message: "Выберите приём пищи" }),
  name: z.string().trim().min(1, "Введите название").max(80, "Название — до 80 символов"),
  kcal: z.preprocess(toNumber, z.number({ message: "Укажите калории" }).int("Калории — целым числом").min(0, "Калории — от 0 до 5000").max(5000, "Калории — от 0 до 5000")),
  protein: grams("Белки"),
  fat: grams("Жиры"),
  carbs: grams("Углеводы"),
});

export type FoodEntryInput = z.infer<typeof foodEntrySchema>;
