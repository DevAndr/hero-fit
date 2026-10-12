import "server-only";
import { notFound } from "next/navigation";
import { requireUser, type CurrentUser } from "@/lib/auth/dal";

/** Только админ (ADMIN_LOGINS); остальным — 404: существование админки не раскрываем. */
export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (!user.isAdmin) notFound();
  return user;
}
