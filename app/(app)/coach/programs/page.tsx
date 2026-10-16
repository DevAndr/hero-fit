import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app/app-shell";
import { ProgramLibrary } from "@/components/coach/program-editor";
import { requireCoach } from "@/lib/coach/access";
import { getCoachPrograms } from "@/lib/coach/program-queries";
import { db } from "@/lib/db";
import { isEnabled } from "@/lib/flags/server";

export const metadata: Metadata = { title: "Программы" };

export default async function CoachProgramsPage() {
  const coach = await requireCoach();
  if (!(await isEnabled("coach_programs", coach.id))) notFound();
  const [programs, templates] = await Promise.all([
    getCoachPrograms(coach.id),
    db.workoutTemplate.findMany({ where: { userId: coach.id }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader title="Программы" description="Циклы на несколько недель: вес растёт по неделям, с разгрузками" />
      <ProgramLibrary programs={programs} templates={templates} />
    </div>
  );
}
