import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app/app-shell";
import { BurnCard } from "@/components/nutrition/burn-card";
import { DayNav } from "@/components/nutrition/day-nav";
import { DaySummary } from "@/components/nutrition/day-summary";
import { MealBlock } from "@/components/nutrition/meal-block";
import { NormCard } from "@/components/nutrition/norm-card";
import { requireUser } from "@/lib/auth/dal";
import { dayKey, safeTimeZone } from "@/lib/daily-login";
import { isEnabled } from "@/lib/flags/server";
import { dayTotals, MEALS, parseDiaryDate } from "@/lib/nutrition/diary";
import { getDiaryDay, getRecentFoods } from "@/lib/nutrition/food-queries";
import { getNutritionView } from "@/lib/nutrition/queries";

export const metadata: Metadata = { title: "Питание" };

export default async function NutritionPage({ searchParams }: PageProps<"/nutrition">) {
  const user = await requireUser();
  if (!(await isEnabled("nutrition", user.id))) notFound();
  const tz = safeTimeZone(user.timeZone);
  const now = new Date();
  const today = dayKey(now, tz);
  const date = parseDiaryDate((await searchParams).date, today);
  const [view, day, recents] = await Promise.all([getNutritionView(user.id, tz, now), getDiaryDay(user.id, date), getRecentFoods(user.id, today)]);
  const totals = dayTotals(day.entries);
  return (
    <div className="space-y-4">
      <PageHeader title="Питание" description="Дневник, норма калорий и расход на тренировках" />
      <DayNav date={date} today={today} />
      <DaySummary total={totals.total} norm={view.norm} profile={view.profile} macros={view.macros} />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {MEALS.map((meal) => (
          <MealBlock
            key={meal}
            meal={meal}
            entries={day.entries.filter((e) => e.meal === meal)}
            totals={totals.byMeal[meal]}
            date={date}
            isToday={date === today}
            canRepeat={day.yesterdayMeals.includes(meal)}
            recents={recents}
            macros={view.macros}
          />
        ))}
      </div>
      <NormCard view={view} />
      <BurnCard view={view} timeZone={tz} />
    </div>
  );
}
