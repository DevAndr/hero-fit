import "server-only";

import { isEnabled } from "@/lib/flags/server";

/** Курс доступен при двух флагах: сама растяжка и курс. */
export async function courseAllowed(userId: string): Promise<boolean> {
  const [stretching, course] = await Promise.all([isEnabled("stretching", userId), isEnabled("stretch_course", userId)]);
  return stretching && course;
}
