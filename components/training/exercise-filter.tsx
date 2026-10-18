"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { MuscleGroup } from "@/generated/prisma/enums";
import type { ExerciseItem } from "@/lib/exercises/queries";
import { RECOVERY_DOT } from "@/components/progress/body-map";
import { MUSCLE_GROUP_LABELS, MUSCLE_GROUPS } from "@/lib/muscle-groups";
import { recoveryHint, type GroupRecovery } from "@/lib/progress/recovery";
import { cn } from "@/lib/utils";

const RecoveryContext = createContext<Map<MuscleGroup, GroupRecovery> | null>(null);

/** Восстановление мышц для фильтра групп (точка и подсказка у каждой группы); без провайдера — без точек. */
export function MuscleRecoveryProvider({ recovery, children }: { recovery: GroupRecovery[]; children: ReactNode }) {
  const value = useMemo(() => new Map(recovery.map((r) => [r.group, r])), [recovery]);
  return <RecoveryContext value={value}>{children}</RecoveryContext>;
}

/** Поиск по названию + фильтр по группе мышц — общий для диалога выбора и каталога на ПК. */
/** initialGroup — фильтр группы при открытии (замена упражнения); reset() сбрасывает в «все». */
export function useExerciseFilter(exercises: ExerciseItem[], initialGroup: MuscleGroup | null = null) {
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<MuscleGroup | null>(initialGroup);

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
  const recovery = useContext(RecoveryContext);
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
      {/* shrink-0: в диалоге (flex-колонка) строка иначе сжимается и полоса прокрутки ложится на чипы */}
      <div className={cn("flex shrink-0 gap-1.5 overflow-x-auto pb-2 [scrollbar-width:thin]", className)}>
        {[null, ...MUSCLE_GROUPS].map((g) => {
          const r = g ? recovery?.get(g) : undefined;
          return (
            <button
              key={g ?? "all"}
              type="button"
              onClick={() => filter.setGroup(g)}
              aria-pressed={g === filter.group}
              className={cn(
                "flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm",
                g === filter.group ? "border-primary bg-primary/15 text-primary" : "text-muted-foreground",
              )}
              // title — описание кнопки для скринридеров, имя («Грудь») не меняется
              title={r ? recoveryHint(r) : undefined}
              data-recovery={r?.state}
            >
              {r ? <span aria-hidden className={cn("size-2 rounded-full", RECOVERY_DOT[r.state])} /> : null}
              {g ? MUSCLE_GROUP_LABELS[g] : "Все"}
            </button>
          );
        })}
      </div>
    </>
  );
}
