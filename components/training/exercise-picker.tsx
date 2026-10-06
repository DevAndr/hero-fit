"use client";

import { useMemo, useState } from "react";
import { Check, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { MuscleGroup } from "@/generated/prisma/enums";
import type { ExerciseItem } from "@/lib/exercises/queries";
import { MUSCLE_GROUP_LABELS, MUSCLE_GROUPS } from "@/lib/muscle-groups";
import { cn } from "@/lib/utils";

export function ExercisePicker({
  exercises,
  alreadyAdded,
  onAdd,
}: {
  exercises: ExerciseItem[];
  alreadyAdded: Set<string>;
  onAdd: (items: ExerciseItem[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<MuscleGroup | null>(null);
  const [selected, setSelected] = useState<string[]>([]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return exercises.filter(
      (e) => (!q || e.name.toLowerCase().includes(q)) && (!group || e.muscleGroups.includes(group)),
    );
  }, [exercises, query, group]);

  const toggle = (id: string) =>
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const reset = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setSelected([]);
      setQuery("");
      setGroup(null);
    }
  };

  const confirm = () => {
    const byId = new Map(exercises.map((e) => [e.id, e]));
    onAdd(selected.map((id) => byId.get(id)!).filter(Boolean));
    reset(false);
  };

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogTrigger
        render={
          <Button variant="outline" size="lg" className="w-full border-dashed">
            <Plus />
            Добавить упражнение
          </Button>
        }
      />
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Добавить упражнения</DialogTitle>
          <DialogDescription>Выберите одно или несколько — порядок выбора сохранится.</DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск"
            className="pl-8"
            aria-label="Поиск упражнения"
          />
        </div>
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1">
          {[null, ...MUSCLE_GROUPS].map((g) => (
            <button
              key={g ?? "all"}
              type="button"
              onClick={() => setGroup(g)}
              aria-pressed={g === group}
              className={cn(
                "shrink-0 rounded-full border px-2.5 py-0.5 text-xs",
                g === group ? "border-primary bg-primary/15 text-primary" : "text-muted-foreground",
              )}
            >
              {g ? MUSCLE_GROUP_LABELS[g] : "Все"}
            </button>
          ))}
        </div>

        <ul className="-mx-4 min-h-0 flex-1 overflow-y-auto px-4" aria-label="Список упражнений">
          {filtered.map((e) => {
            const index = selected.indexOf(e.id);
            return (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => toggle(e.id)}
                  aria-pressed={index >= 0}
                  className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-muted"
                >
                  <span
                    className={cn(
                      "flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-bold",
                      index >= 0 && "border-primary bg-primary text-primary-foreground",
                    )}
                  >
                    {index >= 0 ? index + 1 : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{e.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {e.muscleGroups.map((g) => MUSCLE_GROUP_LABELS[g]).join(" · ")}
                    </span>
                  </span>
                  {alreadyAdded.has(e.id) ? (
                    <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                      <Check className="size-3.5" />в тренировке
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
          {filtered.length === 0 ? (
            <li className="py-8 text-center text-sm text-muted-foreground">Ничего не найдено</li>
          ) : null}
        </ul>

        <DialogFooter>
          <Button onClick={confirm} disabled={selected.length === 0}>
            Добавить{selected.length ? ` (${selected.length})` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
