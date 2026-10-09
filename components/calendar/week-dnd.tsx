"use client";

import { type ReactNode } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type KeyboardCoordinateGetter,
  type Modifier,
  type ScreenReaderInstructions,
} from "@dnd-kit/core";
import type { CalendarEvent } from "@/components/calendar/calendar-view";
import { minutesOf, timeOf } from "@/lib/plans/match";
import { dayLabel } from "@/lib/plans/view";

const SLOT_MIN = 30;

/** Можно ли таскать: только планы, не выполненные. */
export const canDrag = (e: CalendarEvent) => e.kind === "plan" && e.status !== "done" && !e.coachName;

/** По вертикали — шаг слота (30 мин). */
const snapToSlots =
  (slotPx: number): Modifier =>
  ({ transform }) => ({ ...transform, y: Math.round(transform.y / slotPx) * slotPx });

/** Клавиатура: ↑↓ — на слот, ←→ — на колонку дня. */
const coordinates =
  (slotPx: number): KeyboardCoordinateGetter =>
  (event, { currentCoordinates }) => {
    const column = document.querySelector("[data-day-column]")?.getBoundingClientRect().width ?? 0;
    switch (event.code) {
      case "ArrowUp":
        return { ...currentCoordinates, y: currentCoordinates.y - slotPx };
      case "ArrowDown":
        return { ...currentCoordinates, y: currentCoordinates.y + slotPx };
      case "ArrowLeft":
        return { ...currentCoordinates, x: currentCoordinates.x - column };
      case "ArrowRight":
        return { ...currentCoordinates, x: currentCoordinates.x + column };
    }
    return undefined;
  };

/** Указателем — колонка под курсором; с клавиатуры — колонка, на которую больше всего заходит блок. */
const collision: CollisionDetection = (args) => (args.pointerCoordinates ? pointerWithin(args) : rectIntersection(args));

const instructions: ScreenReaderInstructions = {
  draggable: "Чтобы перенести тренировку, нажмите пробел, стрелками вверх и вниз меняйте время, влево и вправо — день, пробел — положить, Escape — отменить.",
};

/** Новые дата и время по сдвигу блока: колонка под ним и сдвиг по вертикали в слотах. */
export function dropTarget(event: CalendarEvent, overDate: string, deltaY: number, slotPx: number) {
  const start = minutesOf(event.time) + Math.round(deltaY / slotPx) * SLOT_MIN;
  const clamped = Math.min(24 * 60 - SLOT_MIN, Math.max(0, start));
  return { date: overDate, time: timeOf(clamped) };
}

export function WeekDnd({
  events,
  slotPx,
  onMove,
  children,
}: {
  events: CalendarEvent[];
  slotPx: number;
  onMove: (event: CalendarEvent, target: { date: string; time: string }) => void;
  children: ReactNode;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    // Enter оставляем для открытия карточки — перенос с клавиатуры начинается пробелом
    useSensor(KeyboardSensor, {
      coordinateGetter: coordinates(slotPx),
      keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space", "Enter"] },
    }),
  );
  const find = (id: string | number) => events.find((e) => e.key === id);
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Переносим «${find(active.id)?.title ?? ""}».`,
    onDragOver: () => undefined,
    onDragMove: () => undefined,
    onDragEnd: ({ over }) => (over ? `Тренировка перенесена на ${dayLabel(String(over.id))}.` : "Перенос отменён."),
    onDragCancel: () => "Перенос отменён.",
  };

  const end = ({ active, over, delta }: DragEndEvent) => {
    const e = find(active.id);
    if (!e || !over) return;
    const target = dropTarget(e, String(over.id), delta.y, slotPx);
    if (target.date !== e.date || target.time !== e.time) onMove(e, target);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collision}
      modifiers={[snapToSlots(slotPx)]}
      onDragEnd={end}
      accessibility={{ announcements, screenReaderInstructions: instructions }}
    >
      {children}
    </DndContext>
  );
}

/** Колонка дня — цель для переноса. */
export function useDayDrop(date: string) {
  return useDroppable({ id: date });
}

/** Обёртка события: перетаскивание (если можно) + смещение при переносе. */
export function DraggableEvent({ event, render }: { event: CalendarEvent; render: (props: DraggableProps) => ReactNode }) {
  const { setNodeRef, attributes, listeners, transform, isDragging } = useDraggable({ id: event.key, disabled: !canDrag(event) });
  return render({
    ref: setNodeRef,
    dragProps: canDrag(event) ? { ...attributes, ...listeners, "aria-roledescription": "перетаскиваемая тренировка" } : {},
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    isDragging,
  });
}

export type DraggableProps = {
  ref: (node: HTMLElement | null) => void;
  dragProps: Record<string, unknown>;
  transform: string | undefined;
  isDragging: boolean;
};
