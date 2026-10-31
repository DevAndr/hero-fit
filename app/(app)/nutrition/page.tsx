import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app/app-shell";
import { BurnCard } from "@/components/nutrition/burn-card";
import { NormCard } from "@/components/nutrition/norm-card";
import { requireUser } from "@/lib/auth/dal";
import { safeTimeZone } from "@/lib/daily-login";
import { isEnabled } from "@/lib/flags/server";
import { getNutritionView } from "@/lib/nutrition/queries";

export const metadata: Metadata = { title: "Питание" };

export default async function NutritionPage() {
  const user = await requireUser();
  if (!(await isEnabled("nutrition", user.id))) notFound();
  const tz = safeTimeZone(user.timeZone);
  const view = await getNutritionView(user.id, tz, new Date());
  return (
    <div className="space-y-4">
      <PageHeader title="Питание" description="Норма калорий и расход на тренировках" />
      <NormCard view={view} />
      <BurnCard view={view} timeZone={tz} />
    </div>
  );
}
