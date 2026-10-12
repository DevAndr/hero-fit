import "server-only";
import { notFound } from "next/navigation";
import { requireUser, type CurrentUser } from "@/lib/auth/dal";
import { isEnabled } from "@/lib/flags/server";

export const CLUBS_OFF = "Клубы пока недоступны";

/** Флаг `clubs` смотрящего. */
export function clubsAllowed(userId: string): Promise<boolean> {
  return isEnabled("clubs", userId);
}

/** Страницы клубов: без флага — 404. */
export async function requireClubs(): Promise<CurrentUser> {
  const user = await requireUser();
  if (!(await clubsAllowed(user.id))) notFound();
  return user;
}
