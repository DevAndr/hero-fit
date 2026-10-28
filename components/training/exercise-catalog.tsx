"use client";

import { useDraggable } from "@dnd-kit/core";
import { Check, GripVertical, Plus } from "lucide-react";
import { FavoriteButton, stop } from "@/components/exercises/favorites";
import { Button } from "@/components/ui/button";
import { ExerciseFilterControls, useExerciseFilter } from "@/components/training/exercise-filter";
import type { ExerciseItem } from "@/lib/exercises/queries";
import { areaLabels } from "@/lib/exercises/area";
import { cn } from "@/lib/utils";

export const CATALOG_PREFIX = "catalog:";
export type CatalogDragData = { type: "catalog"; exercise: ExerciseItem };

/** Каталог упражнений справа (только ПК): тащить в тренировку или добавить кнопкой «+». */
export function ExerciseCatalog({
  exercises,
  alreadyAdded,
  onAdd,
}: {
  exercises: ExerciseItem[];
  alreadyAdded: Set<string>;
  onAdd: (exercise: ExerciseItem) => void;
}) {
  const filter = useExerciseFilter(exercises);

  return (
    <aside
      aria-label="Каталог упражнений"
      className="sticky top-20 hidden max-h-[calc(100dvh-6.5rem)] flex-col gap-3 rounded-xl border bg-card p-4 lg:flex"
    >
      <div>
        <h2 className="font-bold">Упражнения</h2>
        <p className="text-xs text-muted-foreground">Перетащите в тренировку или нажмите «+»</p>
      </div>
      <ExerciseFilterControls filter={filter} className="flex-wrap overflow-visible" />
      <ul className="-mx-2 min-h-0 flex-1 space-y-1 overflow-y-auto px-2" aria-label="Каталог">
        {filter.filtered.map((e) => (
          <CatalogItem key={e.id} exercise={e} added={alreadyAdded.has(e.id)} onAdd={onAdd} />
        ))}
        {filter.filtered.length === 0 ? (
          <li className="py-8 text-center text-sm text-muted-foreground">Ничего не найдено</li>
        ) : null}
      </ul>
    </aside>
  );
}

function CatalogItem({
  exercise,
  added,
  onAdd,
}: {
  exercise: ExerciseItem;
  added: boolean;
  onAdd: (exercise: ExerciseItem) => void;
}) {
  const { setNodeRef, listeners, isDragging } = useDraggable({
    id: CATALOG_PREFIX + exercise.id,
    data: { type: "catalog", exercise } satisfies CatalogDragData,
  });

  return (
    // Только мышь/тач: с клавиатуры добавляют кнопкой «+» (тащить через две колонки стрелками неудобно).
    <li
      ref={setNodeRef}
      {...listeners}
      data-testid="catalog-item"
      className={cn(
        "group flex cursor-grab touch-none items-center gap-2 rounded-lg border border-transparent px-2 py-1.5 select-none hover:border-border hover:bg-muted active:cursor-grabbing",
        isDragging && "opacity-40",
      )}
    >
      <GripVertical className="size-4 shrink-0 text-muted-foreground/60 group-hover:text-muted-foreground" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{exercise.name}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {areaLabels(exercise).join(" · ")}
        </span>
        {added ? (
          <span className="flex items-center gap-1 text-xs text-primary">
            <Check className="size-3" />в тренировке
          </span>
        ) : null}
      </span>
      <FavoriteButton exercise={exercise} />
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Добавить «${exercise.name}»`}
        onKeyDown={stop}
        onClick={() => onAdd(exercise)}
      >
        <Plus />
      </Button>
    </li>
  );
}

/** Карточка под курсором при перетаскивании (из каталога и внутри списка). */
export function DragPreview({ name, detail }: { name: string; detail?: string }) {
  return (
    <div className="flex w-72 cursor-grabbing items-center gap-2 rounded-lg border border-primary bg-card px-3 py-2 shadow-lg">
      <GripVertical className="size-4 shrink-0 text-primary" />
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold">{name}</span>
        {detail ? <span className="block truncate text-xs text-muted-foreground">{detail}</span> : null}
      </span>
    </div>
  );
}
