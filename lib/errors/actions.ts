"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/admin";
import { db } from "@/lib/db";

/** «Решено» / «Открыть снова» в /admin/errors; повтор решённой ошибки откроет её сам (recordError). */
export async function resolveErrorAction(id: string, resolved: boolean) {
  await requireAdmin();
  await db.errorGroup.updateMany({ where: { id }, data: { resolvedAt: resolved ? new Date() : null } });
  revalidatePath("/admin/errors");
  revalidatePath(`/admin/errors/${id}`);
}
