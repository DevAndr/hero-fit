import type { Metadata } from "next";
import { PageHeader } from "@/components/app/app-shell";
import { ProgramLibrary } from "@/components/coach/program-editor";
import { requireCoach } from "@/lib/coach/access";
import { getCoachPrograms } from "@/lib/coach/program-queries";
import { db } from "@/lib/db";
import { listExercises } from "@/lib/exercises/queries";

export const metadata: Metadata = { title: "Программы" };

export default async function CoachProgramsPage() {
  const coach = await requireCoach();
  const [programs, templates, exercises] = await Promise.all([
    getCoachPrograms(coach.id),
    db.workoutTemplate.findMany({ where: { userId: coach.id }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    listExercises(coach.id),
  ]);
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader title="Программы" description="Циклы на несколько недель: вес растёт по неделям, с разгрузками" />
      <ProgramLibrary programs={programs} templates={templates} exercises={exercises} />
    </div>
  );
}
