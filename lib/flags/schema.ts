import { z } from "zod";

export const MAX_FLAG_USERS = 100;

const PERCENT = "Процент — от 0 до 100";

/** Одна правка флага из админки: переключатель, процент, добавить/убрать пользователя. */
export const flagPatchSchema = z.object({
  enabled: z.boolean().optional(),
  percent: z.number({ error: PERCENT }).int(PERCENT).min(0, PERCENT).max(100, PERCENT).optional(),
  addUser: z.string().trim().min(1, "Введите логин или ник").max(40, "Слишком длинный логин").optional(),
  removeUserId: z.string().min(1).optional(),
});
export type FlagPatch = z.infer<typeof flagPatchSchema>;
