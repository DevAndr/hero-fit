import "server-only";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/admin";
import type { CurrentUser } from "@/lib/auth/dal";
import { isEnabled } from "@/lib/flags/server";

/** Админ приложения с включённым флагом campaigns; остальным — 404. */
export async function requireCampaignAdmin(): Promise<CurrentUser> {
  const me = await requireAdmin();
  if (!(await isEnabled("campaigns", me.id))) notFound();
  return me;
}
