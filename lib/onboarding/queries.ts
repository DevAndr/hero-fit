import "server-only";
import { db } from "@/lib/db";

/** Встроенные программы финала экскурсии — в этом порядке. */
const NAMES = ["Full Body", "Push", "5×5 — день A"];

export type OnboardingProgram = { id: string; name: string; exercises: number };

export async function getOnboardingPrograms(): Promise<OnboardingProgram[]> {
  const rows = await db.workoutTemplate.findMany({
    where: { userId: null, name: { in: NAMES } },
    select: { id: true, name: true, _count: { select: { exercises: true } } },
  });
  return rows
    .map((r) => ({ id: r.id, name: r.name, exercises: r._count.exercises }))
    .sort((a, b) => NAMES.indexOf(a.name) - NAMES.indexOf(b.name));
}
