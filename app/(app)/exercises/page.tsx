import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Search, SearchX, Star } from "lucide-react";
import { PageHeader } from "@/components/app/app-shell";
import { ExerciseCard } from "@/components/exercises/exercise-card";
import { FavoritesProvider } from "@/components/exercises/favorites";
import { ExerciseFormDialog } from "@/components/exercises/exercise-form-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { MuscleGroup } from "@/generated/prisma/enums";
import { requireUser } from "@/lib/auth/dal";
import { listExercises, type ExerciseItem } from "@/lib/exercises/queries";
import { MUSCLE_GROUP_LABELS, MUSCLE_GROUPS } from "@/lib/muscle-groups";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Упражнения" };

/** `favorites` — только избранные (★). */
type PageGroup = MuscleGroup | "favorites";

function parseGroup(value: string | string[] | undefined): PageGroup | undefined {
  if (value === "favorites") return "favorites";
  return typeof value === "string" && (MUSCLE_GROUPS as string[]).includes(value) ? (value as MuscleGroup) : undefined;
}

function filterHref(q: string, group?: PageGroup) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (group) params.set("group", group);
  const query = params.toString();
  return query ? `/exercises?${query}` : "/exercises";
}

/** Без фильтра по группе — сначала «Избранное», затем секции по основной группе мышц в порядке справочника. */
function groupByPrimary(exercises: ExerciseItem[]) {
  const favorites = exercises.filter((e) => e.favorite);
  return [
    ...(favorites.length ? [{ key: "favorites", title: "Избранное", items: favorites }] : []),
    ...MUSCLE_GROUPS.map((group) => ({
      key: group,
      title: MUSCLE_GROUP_LABELS[group],
      items: exercises.filter((e) => e.muscleGroups[0] === group),
    })).filter((section) => section.items.length > 0),
  ];
}

export default async function ExercisesPage({ searchParams }: PageProps<"/exercises">) {
  const user = await requireUser();
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim().slice(0, 80) : "";
  const group = parseGroup(params.group);

  const all = await listExercises(user.id, { q: q || undefined, group: group === "favorites" ? undefined : group });
  const exercises = group === "favorites" ? all.filter((e) => e.favorite) : all;
  const sections = group
    ? [{ key: group, title: group === "favorites" ? "Избранное" : MUSCLE_GROUP_LABELS[group], items: exercises }]
    : groupByPrimary(exercises);

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
          {[undefined, "favorites" as const, ...MUSCLE_GROUPS].map((g) => (
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
              {g === "favorites" ? (
                <span className="flex items-center gap-1.5">
                  <Star aria-hidden className="size-3.5" />
                  Избранное
                </span>
              ) : g ? (
                MUSCLE_GROUP_LABELS[g]
              ) : (
                "Все"
              )}
            </Link>
          ))}
        </div>
      </div>

      {exercises.length === 0 && group === "favorites" && !q ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-16 text-center">
          <Star className="size-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Отмечайте ★ упражнения, которые делаете чаще всего</p>
        </div>
      ) : exercises.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-16 text-center">
          <SearchX className="size-10 text-muted-foreground" />
          <p className="font-semibold">Ничего не найдено</p>
          <p className="text-sm text-muted-foreground">Измените запрос или добавьте своё упражнение.</p>
        </div>
      ) : (
        <FavoritesProvider exercises={all}>
          <div className="space-y-8">
            {sections.map(({ key, title, items }) => (
              <section key={key} className="space-y-3" aria-label={title}>
                <h2 className="flex items-baseline gap-2 text-lg font-bold">
                  {title}
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
        </FavoritesProvider>
      )}
    </>
  );
}
