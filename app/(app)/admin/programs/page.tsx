import type { Metadata } from "next";
import { PageHeader } from "@/components/app/app-shell";
import { AdminProgramList } from "@/components/admin/program-list";
import { requireAdmin } from "@/lib/auth/admin";
import { requireCatalog } from "@/lib/catalog/access";
import { listForAdmin } from "@/lib/catalog/queries";

export const metadata: Metadata = { title: "Программы каталога" };

/** Модерация каталога программ (только ADMIN_LOGINS и под флагом program_catalog, иначе 404): снять и вернуть. */
export default async function AdminProgramsPage() {
  await requireAdmin();
  await requireCatalog();
  const programs = await listForAdmin();
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader title="Программы каталога" description="Опубликованные программы тренеров: снять с причиной или вернуть." />
      <AdminProgramList programs={programs} />
    </div>
  );
}
