import "server-only";
import { notFound } from "next/navigation";
import { requireUser, type CurrentUser } from "@/lib/auth/dal";
import { isEnabled } from "@/lib/flags/server";

export const SHOP_OFF = "Магазин пока недоступен";

/** Флаг `shop` смотрящего. */
export function shopAllowed(userId: string): Promise<boolean> {
  return isEnabled("shop", userId);
}

/** Страницы магазина: без флага — 404. */
export async function requireShop(): Promise<CurrentUser> {
  const user = await requireUser();
  if (!(await shopAllowed(user.id))) notFound();
  return user;
}
