"use client";

import { useState, useTransition } from "react";
import { EllipsisVertical, Pencil, PersonStanding, Timer, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ExerciseFormDialog } from "@/components/exercises/exercise-form-dialog";
import { FavoriteButton } from "@/components/exercises/favorites";
import { deleteExerciseAction } from "@/lib/exercises/actions";
import type { ExerciseItem } from "@/lib/exercises/queries";
import { MUSCLE_GROUP_LABELS } from "@/lib/muscle-groups";

export function ExerciseCard({ exercise }: { exercise: ExerciseItem }) {
  const own = exercise.userId !== null;
  const [primary, ...secondary] = exercise.muscleGroups;

  return (
    <div className="flex items-start gap-3 rounded-xl border bg-card p-4">
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex items-center gap-2">
          <h3 className="truncate font-semibold">{exercise.name}</h3>
          {own ? <Badge variant="outline" className="shrink-0 border-primary/40 text-primary">моё</Badge> : null}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {primary ? <Badge>{MUSCLE_GROUP_LABELS[primary]}</Badge> : null}
          {secondary.map((g) => (
            <Badge key={g} variant="secondary">
              {MUSCLE_GROUP_LABELS[g]}
            </Badge>
          ))}
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Timer className="size-3.5" />
            отдых {exercise.defaultRestSec} с
          </span>
          {exercise.isBodyweight ? (
            <span className="flex items-center gap-1">
              <PersonStanding className="size-3.5" />
              свой вес
            </span>
          ) : null}
        </div>
        {exercise.description ? (
          <p className="line-clamp-2 text-sm text-muted-foreground">{exercise.description}</p>
        ) : null}
      </div>
      <FavoriteButton exercise={exercise} />
      {own ? <ExerciseActions exercise={exercise} /> : null}
    </div>
  );
}

function ExerciseActions({ exercise }: { exercise: ExerciseItem }) {
  const [editOpen, setEditOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const remove = () =>
    startTransition(async () => {
      const result = await deleteExerciseAction(exercise.id);
      if (result.ok) {
        toast.success(`«${exercise.name}» удалено`);
        setConfirmOpen(false);
      } else {
        toast.error(result.message);
      }
    });

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Действия" />}>
          <EllipsisVertical />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onClick={() => setEditOpen(true)}>
            <Pencil />
            Редактировать
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={() => setConfirmOpen(true)}>
            <Trash2 />
            Удалить
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ExerciseFormDialog exercise={exercise} open={editOpen} onOpenChange={setEditOpen} />

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить «{exercise.name}»?</AlertDialogTitle>
            <AlertDialogDescription>
              Упражнение пропадёт из списка и шаблонов для новых тренировок. История прошедших тренировок и рекорды
              сохранятся.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Отмена</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={remove} disabled={pending}>
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
