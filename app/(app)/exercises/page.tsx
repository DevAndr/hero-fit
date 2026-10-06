import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Search, SearchX } from "lucide-react";
import { PageHeader } from "@/components/app/app-shell";
import { ExerciseCard } from "@/components/exercises/exercise-card";
import { ExerciseFormDialog } from "@/components/exercises/exercise-form-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { MuscleGroup } from "@/generated/prisma/enums";
import { requireUser } from "@/lib/auth/dal";
import { listExercises, type ExerciseItem } from "@/lib/exercises/queries";
import { MUSCLE_GROUP_LABELS, MUSCLE_GROUPS } from "@/lib/muscle-groups";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Упражнения" };

function parseGroup(value: string | string[] | undefined): MuscleGroup | undefined {
  return typeof value === "string" && (MUSCLE_GROUPS as string[]).includes(value) ? (value as MuscleGroup) : undefined;
}

function filterHref(q: string, group?: MuscleGroup) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (group) params.set("group", group);
  const query = params.toString();
  return query ? `/exercises?${query}` : "/exercises";
}

/** Без фильтра по группе — секции по основной группе мышц в порядке справочника. */
function groupByPrimary(exercises: ExerciseItem[]) {
  return MUSCLE_GROUPS.map((group) => ({
    group,
    items: exercises.filter((e) => e.muscleGroups[0] === group),
  })).filter((section) => section.items.length > 0);
}

export default async function ExercisesPage({ searchParams }: PageProps<"/exercises">) {
  const user = await requireUser();
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim().slice(0, 80) : "";
  const group = parseGroup(params.group);

  const exercises = await listExercises(user.id, { q: q || undefined, group });
  const sections = group ? [{ group, items: exercises }] : groupByPrimary(exercises);

  return (
    <>
      <PageHeader
        title="Упражнения"
        description="Встроенная база и ваши упражнения"
        actions={
          <ExerciseFormDialog
            trigger={
              <Button>
                <Plus />
                Новое упражнение
              </Button>
            }
          />
        }
      />

      <div className="mb-6 space-y-3">
        <form action="/exercises" className="relative max-w-md">
          {group ? <input type="hidden" name="group" value={group} /> : null}
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input name="q" type="search" defaultValue={q} placeholder="Поиск по названию" className="pl-8" />
        </form>

        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
          {[undefined, ...MUSCLE_GROUPS].map((g) => (
            <Link
              key={g ?? "all"}
              href={filterHref(q, g)}
              aria-current={g === group ? "true" : undefined}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1 text-sm transition-colors",
                g === group
                  ? "border-primary bg-primary/15 text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {g ? MUSCLE_GROUP_LABELS[g] : "Все"}
            </Link>
          ))}
        </div>
      </div>

      {exercises.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-16 text-center">
          <SearchX className="size-10 text-muted-foreground" />
          <p className="font-semibold">Ничего не найдено</p>
          <p className="text-sm text-muted-foreground">Измените запрос или добавьте своё упражнение.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {sections.map(({ group: g, items }) => (
            <section key={g} className="space-y-3">
              <h2 className="flex items-baseline gap-2 text-lg font-bold">
                {MUSCLE_GROUP_LABELS[g]}
                <span className="text-sm font-normal text-muted-foreground">{items.length}</span>
              </h2>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {items.map((exercise) => (
                  <ExerciseCard key={exercise.id} exercise={exercise} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
