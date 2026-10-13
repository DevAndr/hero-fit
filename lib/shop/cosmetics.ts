import { flagOn, type FlagState } from "@/lib/flags/eval";
import { itemByCode } from "@/lib/shop/catalog";

/** Косметика игрока, готовая к показу: коды, существующие в каталоге; флаг владельца выключен — всё null. */
export type Cosmetics = { avatar: string | null; frame: string | null; nickColor: string | null };

export type CosmeticsRow = { id: string; avatarCode?: string | null; frameCode?: string | null; nickColorCode?: string | null };

/** Поля пользователя для Prisma select. */
export const COSMETIC_SELECT = { avatarCode: true, frameCode: true, nickColorCode: true } as const;

export const NO_COSMETICS: Cosmetics = { avatar: null, frame: null, nickColor: null };

const known = (code: string | null | undefined, kind: "avatar" | "frame" | "nickColor") =>
  itemByCode(code)?.kind === kind ? code ?? null : null;

/** Флаг `shop` — по владельцу косметики; неизвестный (удалённый из каталога) код — вид по умолчанию. */
export function visibleCosmetics(row: CosmeticsRow, shop: FlagState | null): Cosmetics {
  if (!flagOn("shop", shop, row.id)) return NO_COSMETICS;
  return {
    avatar: known(row.avatarCode, "avatar"),
    frame: known(row.frameCode, "frame"),
    nickColor: known(row.nickColorCode, "nickColor"),
  };
}
