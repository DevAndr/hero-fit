import "server-only";
import { notFound } from "next/navigation";
import { requireUser, type CurrentUser } from "@/lib/auth/dal";
import { isEnabled } from "@/lib/flags/server";

export const CATALOG_OFF = "Каталог программ пока недоступен";

/** Флаг `program_catalog` смотрящего. */
export function catalogAllowed(userId: string): Promise<boolean> {
  return isEnabled("program_catalog", userId);
}

/** Страницы каталога: без флага — 404. */
export async function requireCatalog(): Promise<CurrentUser> {
  const user = await requireUser();
  if (!(await catalogAllowed(user.id))) notFound();
  return user;
}
