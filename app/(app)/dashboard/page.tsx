import type { Metadata } from "next";
import { PageHeader } from "@/components/app/app-shell";
import { requireUser } from "@/lib/auth/dal";

export const metadata: Metadata = { title: "Личный кабинет" };

// Временная страница: полноценный дашборд — отдельным этапом.
export default async function DashboardPage() {
  const user = await requireUser();
  return <PageHeader title={`Привет, ${user.name ?? user.login}!`} description="Дашборд с прогрессом появится на одном из следующих этапов." />;
}
