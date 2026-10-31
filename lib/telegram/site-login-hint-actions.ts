"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";

/** «Скрыть» на карточке «Задайте пароль» — насовсем. */
export async function hideSiteLoginHintAction() {
  const user = await requireUser();
  await db.user.update({ where: { id: user.id }, data: { siteLoginHintHiddenAt: new Date() } });
  revalidatePath("/dashboard");
}
