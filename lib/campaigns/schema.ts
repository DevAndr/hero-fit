import { z } from "zod";
import { safeHref } from "@/lib/alerts/rules";

export const NAME_MAX = 80;
export const TITLE_MAX = 60;
export const BODY_MAX = 300;

/** Чекбокс из FormData: «on»/«true» — включён, отсутствует — выключен. */
const checkbox = z.preprocess(
  (v) => v === true || v === "on" || v === "true",
  z.boolean(),
);

/** Пустая строка поля формы — «не задано». */
const emptyToUndefined = (v: unknown) =>
  typeof v === "string" && v.trim() === "" ? undefined : v;

export const campaignSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Введите название")
      .max(NAME_MAX, `Название — до ${NAME_MAX} символов`),
    condition: z.enum(
      ["INACTIVE", "NO_WORKOUT", "NEVER_TRAINED", "STREAK_LOST"],
      "Выберите условие",
    ),
    days: z.preprocess(
      emptyToUndefined,
      z.coerce
        .number("Укажите число дней")
        .int("Дни — целое число")
        .min(1, "От 1 до 90 дней")
        .max(90, "От 1 до 90 дней")
        .optional(),
    ),
    title: z
      .string()
      .trim()
      .min(1, "Введите заголовок")
      .max(TITLE_MAX, `Заголовок — до ${TITLE_MAX} символов`),
    body: z
      .string()
      .trim()
      .min(1, "Введите текст")
      .max(BODY_MAX, `Текст — до ${BODY_MAX} символов`),
    url: z
      .string()
      .trim()
      .min(1, "Введите ссылку")
      .max(500, "Слишком длинная ссылка"),
    push: checkbox,
    telegram: checkbox,
    hour: z.coerce
      .number("Укажите час")
      .int("Час — целое число")
      .min(8, "Час — от 8 до 21")
      .max(21, "Час — от 8 до 21"),
  })
  .superRefine((c, ctx) => {
    if (c.condition !== "STREAK_LOST" && c.days === undefined)
      ctx.addIssue({
        code: "custom",
        path: ["days"],
        message: "Укажите число дней",
      });
    if (!c.push && !c.telegram)
      ctx.addIssue({
        code: "custom",
        path: ["push"],
        message: "Выберите хотя бы один канал",
      });
    if (!c.url.startsWith("/") || !safeHref(c.url))
      ctx.addIssue({
        code: "custom",
        path: ["url"],
        message: "Ссылка — только /путь внутри приложения",
      });
  })
  .transform((c) => ({
    ...c,
    days: c.condition === "STREAK_LOST" ? null : (c.days ?? null),
  }));

export type CampaignInput = z.infer<typeof campaignSchema>;
