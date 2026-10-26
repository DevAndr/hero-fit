import { z } from "zod";
import { safeHref } from "./rules";

export const BODY_MAX = 500;
export const TITLE_MAX = 80;
export const CTA_LABEL_MAX = 30;

/** Пустая строка поля формы — «не задано». */
const optionalText = (max: number, message: string) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.string().trim().max(max, message).optional());

const isoDate = z.string().refine((s) => !Number.isNaN(Date.parse(s)), "Неверная дата");

/** Оповещение из формы /admin/alerts; даты — ISO (в UTC переводит браузер админа). */
export const alertInputSchema = z
  .object({
    kind: z.enum(["BANNER", "POPUP"]),
    tone: z.enum(["INFO", "WARNING", "CRITICAL"]),
    title: optionalText(TITLE_MAX, `Заголовок — до ${TITLE_MAX} символов`),
    body: z.string().trim().min(1, "Введите текст").max(BODY_MAX, `Текст — до ${BODY_MAX} символов`),
    ctaLabel: optionalText(CTA_LABEL_MAX, `Подпись кнопки — до ${CTA_LABEL_MAX} символов`),
    ctaHref: optionalText(500, "Слишком длинная ссылка"),
    dismiss: z.enum(["NEVER", "SESSION", "FOREVER"]),
    audience: z.enum(["ALL", "USERS", "COACHES"]).default("ALL"),
    startsAt: isoDate,
    endsAt: z.preprocess((v) => (v === "" || v === null ? undefined : v), isoDate.optional()),
  })
  .superRefine((a, ctx) => {
    if (a.kind === "POPUP" && !a.title) ctx.addIssue({ code: "custom", path: ["title"], message: "Заголовок обязателен для попапа" });
    if (a.kind === "POPUP" && a.dismiss === "NEVER")
      ctx.addIssue({ code: "custom", path: ["dismiss"], message: "Попап нельзя сделать незакрываемым" });
    if (a.endsAt && Date.parse(a.endsAt) <= Date.parse(a.startsAt))
      ctx.addIssue({ code: "custom", path: ["endsAt"], message: "Конец показа — позже начала" });
    if (!a.ctaLabel !== !a.ctaHref)
      ctx.addIssue({ code: "custom", path: ["ctaHref"], message: "Укажите и подпись, и ссылку кнопки" });
    if (a.ctaHref && !safeHref(a.ctaHref)) ctx.addIssue({ code: "custom", path: ["ctaHref"], message: "Ссылка — /путь или https://" });
  });

export type AlertInput = z.infer<typeof alertInputSchema>;
