"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { requireUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { queueGoal } from "@/lib/analytics/queue";
import { SHOP_OFF, shopAllowed } from "@/lib/shop/access";
import { itemByCode, type ItemKind } from "@/lib/shop/catalog";
import { canBuy, canEquip } from "@/lib/shop/rules";

const FIELD = {
  avatar: "avatarCode",
  frame: "frameCode",
  nickColor: "nickColorCode",
  theme: "themeCode",
} as const satisfies Record<ItemKind, string>;

class Rejected extends Error {}

/** Покупка за монеты: списание, предмет и запись в журнале — одной транзакцией. */
export async function buyItemAction(code: string): Promise<{ ok: true; coins: number } | { ok: false; error: string }> {
  const user = await requireUser();
  if (!(await shopAllowed(user.id))) return { ok: false, error: SHOP_OFF };
  const item = typeof code === "string" ? itemByCode(code) : null;
  if (!item) return { ok: false, error: "Нет в продаже" };

  try {
    const coins = await db.$transaction(async (tx) => {
      const [row, owned] = await Promise.all([
        tx.user.findUnique({ where: { id: user.id }, select: { coins: true } }),
        tx.userItem.findUnique({ where: { userId_code: { userId: user.id, code } }, select: { id: true } }),
      ]);
      const check = canBuy(item, !!owned, row?.coins ?? 0);
      if (!check.ok) throw new Rejected(check.error);
      const price = item.price;
      // условное списание: при параллельной покупке на одну сумму второй updateMany вернёт 0
      const paid = await tx.user.updateMany({
        where: { id: user.id, coins: { gte: price } },
        data: { coins: { decrement: price } },
      });
      if (paid.count === 0) throw new Rejected("Не хватает монет");
      await tx.userItem.create({ data: { userId: user.id, code, source: "shop" } });
      await tx.coinTx.create({
        data: { userId: user.id, amount: -price, reason: "PURCHASE", key: `buy:${code}`, meta: { code } },
      });
      const after = await tx.user.findUnique({ where: { id: user.id }, select: { coins: true } });
      return after?.coins ?? 0;
    });
    await queueGoal("shop_buy");
    revalidatePath("/", "layout"); // баланс в меню профиля
    return { ok: true, coins };
  } catch (e) {
    if (e instanceof Rejected) return { ok: false, error: e.message };
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { ok: false, error: "Уже куплено" };
    throw e;
  }
}

/** Надеть предмет своего вида; `null` — снять (вид по умолчанию). */
export async function equipItemAction(kind: ItemKind, code: string | null): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  if (!(await shopAllowed(user.id))) return { ok: false, error: SHOP_OFF };
  if (typeof kind !== "string" || !Object.hasOwn(FIELD, kind)) return { ok: false, error: "Неизвестный вид" };
  const field = FIELD[kind];

  if (code !== null && typeof code !== "string") return { ok: false, error: "Это нельзя надеть" };
  if (code !== null) {
    const item = itemByCode(code);
    const owned = item ? !!(await db.userItem.findUnique({ where: { userId_code: { userId: user.id, code } }, select: { id: true } })) : false;
    if (!canEquip(item, kind, owned)) return { ok: false, error: "Это нельзя надеть" };
  }
  await db.user.update({ where: { id: user.id }, data: { [field]: code } });
  revalidatePath("/", "layout");
  return { ok: true };
}
