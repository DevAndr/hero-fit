import type { Metadata } from "next";
import { PageHeader } from "@/components/app/app-shell";
import { TemplateEditor } from "@/components/templates/template-editor";
import { requireUser } from "@/lib/auth/dal";
import { listExercises } from "@/lib/exercises/queries";

export const metadata: Metadata = { title: "Новый шаблон" };

export default async function NewTemplatePage() {
  const user = await requireUser();
  const exercises = await listExercises(user.id);
  return (
    <>
      <PageHeader title="Новый шаблон" />
      <TemplateEditor exercises={exercises} />
    </>
  );
}
