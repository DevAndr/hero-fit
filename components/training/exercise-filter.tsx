"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { MuscleGroup } from "@/generated/prisma/enums";
import type { ExerciseItem } from "@/lib/exercises/queries";
import { MUSCLE_GROUP_LABELS, MUSCLE_GROUPS } from "@/lib/muscle-groups";
import { cn } from "@/lib/utils";

/** Поиск по названию + фильтр по группе мышц — общий для диалога выбора и каталога на ПК. */
export function useExerciseFilter(exercises: ExerciseItem[]) {
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<MuscleGroup | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return exercises.filter(
      (e) => (!q || e.name.toLowerCase().includes(q)) && (!group || e.muscleGroups.includes(group)),
    );
  }, [exercises, query, group]);

  const reset = () => {
    setQuery("");
    setGroup(null);
  };

  return { query, setQuery, group, setGroup, filtered, reset };
}

export function ExerciseFilterControls({
  filter,
  className,
}: {
  filter: ReturnType<typeof useExerciseFilter>;
  className?: string;
}) {
  return (
    <>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={filter.query}
          onChange={(e) => filter.setQuery(e.target.value)}
          placeholder="Поиск"
          className="pl-8"
          aria-label="Поиск упражнения"
        />
      </div>
      <div className={cn("flex gap-1.5 overflow-x-auto pb-1", className)}>
        {[null, ...MUSCLE_GROUPS].map((g) => (
          <button
            key={g ?? "all"}
            type="button"
            onClick={() => filter.setGroup(g)}
            aria-pressed={g === filter.group}
            className={cn(
              "shrink-0 rounded-full border px-2.5 py-0.5 text-xs",
              g === filter.group ? "border-primary bg-primary/15 text-primary" : "text-muted-foreground",
            )}
          >
            {g ? MUSCLE_GROUP_LABELS[g] : "Все"}
          </button>
        ))}
      </div>
    </>
  );
}
