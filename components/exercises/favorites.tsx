"use client";

import { createContext, useCallback, useContext, useMemo, useState, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Star } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { toggleFavoriteAction } from "@/lib/exercises/actions";
import type { ExerciseItem } from "@/lib/exercises/queries";
import { cn } from "@/lib/utils";

type Favorites = { has: (id: string) => boolean; toggle: (exercise: Pick<ExerciseItem, "id">) => void };

const FavoritesContext = createContext<Favorites | null>(null);

/**
 * ★ Избранное на странице: общий набор для всех списков (каталог ПК, диалог выбора, замена) — отметка в одном
 * видна в другом. Сначала меняется набор, затем сервер; ошибка — откат и тост. Порядок списка до перезагрузки не меняется.
 */
export function FavoritesProvider({
  exercises,
  refreshAfterSave = false,
  children,
}: {
  exercises: Pick<ExerciseItem, "id" | "favorite">[];
  /** Перерисовать страницу после сохранения (/exercises — секция «Избранное»); в тренировке — нет: список не прыгает. */
  refreshAfterSave?: boolean;
  children: ReactNode;
}) {
  const router = useRouter();
  const [ids, setIds] = useState(() => new Set(exercises.filter((e) => e.favorite).map((e) => e.id)));

  const set = useCallback((id: string, on: boolean) => setIds((prev) => {
    if (prev.has(id) === on) return prev;
    const next = new Set(prev);
    if (on) next.add(id);
    else next.delete(id);
    return next;
  }), []);

  const toggle = useCallback(
    (exercise: Pick<ExerciseItem, "id">) => {
      const on = !ids.has(exercise.id);
      set(exercise.id, on);
      const fail = (message: string) => {
        set(exercise.id, !on);
        toast.error(message);
      };
      toggleFavoriteAction(exercise.id, on).then(
        (result) => {
          if (!result.ok) fail("Не удалось сохранить избранное");
          else if (refreshAfterSave) router.refresh();
        },
        () => fail(navigator.onLine ? "Не удалось сохранить избранное" : "Нет сети — не удалось сохранить"),
      );
    },
    [ids, set, refreshAfterSave, router],
  );

  const value = useMemo<Favorites>(() => ({ has: (id) => ids.has(id), toggle }), [ids, toggle]);
  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>;
}

/** Вне провайдера — признак из загруженного списка, отметить нельзя. */
export function useFavorites(): Favorites | null {
  return useContext(FavoritesContext);
}

export const isFavorite = (favorites: Favorites | null, exercise: Pick<ExerciseItem, "id" | "favorite">) =>
  favorites ? favorites.has(exercise.id) : exercise.favorite;

/** Клик, нажатие и клавиши не уходят строке: она сама кнопка выбора или ручка перетаскивания (Enter/пробел — KeyboardSensor). */
export const stop = (e: MouseEvent | PointerEvent | KeyboardEvent) => e.stopPropagation();

export function FavoriteButton({ exercise, className }: { exercise: Pick<ExerciseItem, "id" | "name" | "favorite">; className?: string }) {
  const favorites = useFavorites();
  if (!favorites) return null;
  const on = favorites.has(exercise.id);
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-pressed={on}
      aria-label={on ? `Убрать из избранного: ${exercise.name}` : `В избранное: ${exercise.name}`}
      onPointerDown={stop}
      onKeyDown={stop}
      onClick={(e) => {
        stop(e);
        favorites.toggle(exercise);
      }}
      className={cn("shrink-0", on ? "text-xp" : "text-muted-foreground", className)}
    >
      <Star className={cn(on && "fill-current")} />
    </Button>
  );
}
