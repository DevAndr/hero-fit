"use client";

import { useState, type ReactNode } from "react";
import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
  type ScreenReaderInstructions,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { DragPreview, type CatalogDragData } from "@/components/training/exercise-catalog";
import type { ExerciseState } from "@/components/training/workout-state";
import type { ExerciseItem } from "@/lib/exercises/queries";
import { MUSCLE_GROUP_LABELS } from "@/lib/muscle-groups";
import { cn } from "@/lib/utils";

const LIST_ID = "workout-list";

const isCatalog = (data: unknown): data is CatalogDragData => (data as CatalogDragData | undefined)?.type === "catalog";
const groupsLabel = (groups: ExerciseItem["muscleGroups"]) => groups.map((g) => MUSCLE_GROUP_LABELS[g]).join(" · ");

/**
 * Из каталога — только по указателю, и блок под ним важнее контейнера списка.
 * Внутри списка — блок, ближайший к указателю (блоки высокие: центр перетаскиваемого блока
 * может быть далеко от курсора). С клавиатуры указателя нет — ближайший центр.
 */
const collisionDetection: CollisionDetection = (args) => {
  if (isCatalog(args.active.data.current)) {
    const hits = pointerWithin(args);
    const block = hits.find((h) => h.id !== LIST_ID);
    return block ? [block] : hits;
  }
  const blocks = args.droppableContainers.filter((c) => c.id !== LIST_ID);
  const pointer = args.pointerCoordinates;
  if (!pointer) return closestCenter({ ...args, droppableContainers: blocks });
  const pointerRect = { top: pointer.y, left: pointer.x, bottom: pointer.y, right: pointer.x, width: 0, height: 0 };
  return closestCenter({ ...args, collisionRect: pointerRect, droppableContainers: blocks });
};

/** Куда встанет упражнение из каталога: до или после блока под ним, либо в конец (пустое место списка). */
function insertionIndex({ active, over }: DragMoveEvent, keys: string[]) {
  if (!over) return null;
  if (over.id === LIST_ID) return keys.length;
  const index = keys.indexOf(String(over.id));
  if (index < 0) return null;
  const rect = active.rect.current.translated;
  if (!rect) return index;
  return rect.top + rect.height / 2 > over.rect.top + over.rect.height / 2 ? index + 1 : index;
}

const instructions: ScreenReaderInstructions = {
  draggable:
    "Чтобы переставить упражнение, нажмите пробел или Enter, двигайте стрелками вверх и вниз, снова пробел — поставить, Escape — отменить.",
};

export function WorkoutDnd({
  exercises,
  onReorder,
  onDropFromCatalog,
  children,
}: {
  exercises: ExerciseState[];
  onReorder: (key: string, toIndex: number) => void;
  onDropFromCatalog: (exercise: ExerciseItem, index: number) => void;
  children: (dropIndex: number | null) => ReactNode;
}) {
  const [active, setActive] = useState<{ name: string; detail: string } | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const keys = exercises.map((e) => e.key);
  const nameOf = (id: string | number, data?: unknown) =>
    isCatalog(data) ? data.exercise.name : (exercises.find((e) => e.key === id)?.exercise.name ?? "упражнение");

  const sensors = useSensors(
    // Небольшой порог: клик по «+» и полям ввода не превращается в перетаскивание
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const announcements: Announcements = {
    onDragStart: ({ active: a }) => `Взято: ${nameOf(a.id, a.data.current)}.`,
    onDragOver: ({ active: a, over }) =>
      over && !isCatalog(a.data.current) && over.id !== LIST_ID
        ? `${nameOf(a.id)} — позиция ${keys.indexOf(String(over.id)) + 1} из ${keys.length}.`
        : undefined,
    onDragEnd: ({ active: a, over }) =>
      over ? `${nameOf(a.id, a.data.current)} — поставлено.` : `${nameOf(a.id, a.data.current)} — отменено.`,
    onDragCancel: ({ active: a }) => `Перетаскивание отменено: ${nameOf(a.id, a.data.current)}.`,
  };

  const onDragStart = ({ active: a }: DragStartEvent) => {
    const data = a.data.current;
    if (isCatalog(data)) setActive({ name: data.exercise.name, detail: groupsLabel(data.exercise.muscleGroups) });
    else {
      const item = exercises.find((e) => e.key === a.id);
      if (item) setActive({ name: item.exercise.name, detail: `${item.sets.length} подх.` });
    }
  };

  const onDragMove = (event: DragMoveEvent) => {
    if (isCatalog(event.active.data.current)) setDropIndex(insertionIndex(event, keys));
  };

  const onDragEnd = (event: DragEndEvent) => {
    const data = event.active.data.current;
    if (isCatalog(data)) {
      const index = insertionIndex(event, keys);
      if (index !== null) onDropFromCatalog(data.exercise, index);
    } else if (event.over && event.over.id !== event.active.id) {
      const toIndex = keys.indexOf(String(event.over.id));
      if (toIndex >= 0) onReorder(String(event.active.id), toIndex);
    }
    reset();
  };

  const reset = () => {
    setActive(null);
    setDropIndex(null);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      accessibility={{ announcements, screenReaderInstructions: instructions }}
      onDragStart={onDragStart}
      onDragMove={onDragMove}
      onDragEnd={onDragEnd}
      onDragCancel={reset}
    >
      <SortableContext items={keys} strategy={verticalListSortingStrategy}>
        {children(dropIndex)}
      </SortableContext>
      <DragOverlay dropAnimation={null}>{active ? <DragPreview {...active} /> : null}</DragOverlay>
    </DndContext>
  );
}

/** Контейнер списка — цель для упражнений из каталога (в т. ч. пустой список). */
export function ExerciseDropList({ empty, children }: { empty: boolean; children: ReactNode }) {
  const { setNodeRef, isOver, active } = useDroppable({ id: LIST_ID });
  const fromCatalog = isCatalog(active?.data.current);

  return (
    <div ref={setNodeRef} data-testid="workout-drop-list" className="space-y-4 lg:min-h-40 lg:pb-4">
      {children}
      {empty ? (
        <div
          className={cn(
            "hidden h-40 items-center justify-center rounded-xl border-2 border-dashed text-sm text-muted-foreground lg:flex",
            fromCatalog && "border-primary/60 text-foreground",
            fromCatalog && isOver && "bg-primary/10",
          )}
        >
          Перетащите упражнения сюда из каталога справа
        </div>
      ) : null}
    </div>
  );
}

/**
 * Линия «встанет сюда» при перетаскивании из каталога — посередине промежутка между блоками.
 * Нулевой высоты и без отступа: блоки не сдвигаются, иначе цель под курсором «прыгала» бы.
 */
export function DropIndicator() {
  return (
    <div className="relative h-0 mb-0!" aria-hidden>
      <div
        data-testid="drop-indicator"
        className="absolute inset-x-0 -top-2.5 h-1 rounded-full bg-primary shadow-[0_0_10px] shadow-primary/60"
      />
    </div>
  );
}

/** Блок упражнения, который можно таскать за ручку (ручка — только на ПК). */
export function SortableItem({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: (handle: ReactNode) => ReactNode;
}) {
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id });

  const handle = (
    <button
      type="button"
      ref={setActivatorNodeRef}
      {...attributes}
      {...listeners}
      aria-label={`Переставить «${label}»`}
      aria-roledescription="перетаскиваемое упражнение"
      className="-ml-1 hidden cursor-grab touch-none rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground active:cursor-grabbing lg:block"
    >
      <GripVertical className="size-4" />
    </button>
  );

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(isDragging && "opacity-40")}
    >
      {children(handle)}
    </div>
  );
}
