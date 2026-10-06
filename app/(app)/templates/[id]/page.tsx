import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app/app-shell";
import { TemplateEditor } from "@/components/templates/template-editor";
import { requireUser } from "@/lib/auth/dal";
import { listExercises } from "@/lib/exercises/queries";
import { getTemplateForEdit } from "@/lib/templates/queries";

export const metadata: Metadata = { title: "Редактирование шаблона" };

export default async function EditTemplatePage({ params }: PageProps<"/templates/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const [template, exercises] = await Promise.all([getTemplateForEdit(user.id, id), listExercises(user.id)]);
  if (!template) notFound();

  return (
    <>
      <PageHeader title="Редактирование шаблона" />
      <TemplateEditor key={template.id} template={template} exercises={exercises} />
    </>
  );
}
