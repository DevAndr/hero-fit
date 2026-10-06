"use client";

import { useActionState, useState, type ReactElement } from "react";
import { Loader2, Star } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { MuscleGroup } from "@/generated/prisma/enums";
import { saveExerciseAction, type ExerciseFormState } from "@/lib/exercises/actions";
import type { ExerciseItem } from "@/lib/exercises/queries";
import { MUSCLE_GROUP_LABELS, MUSCLE_GROUPS } from "@/lib/muscle-groups";
import { cn } from "@/lib/utils";

const REST_PRESETS = [45, 60, 90, 120, 180];

const toErrors = (messages?: string[]) => messages?.map((message) => ({ message }));

/** Неконтролируемый (с trigger) или контролируемый (open/onOpenChange) диалог. */
export function ExerciseFormDialog({
  exercise,
  trigger,
  open: controlledOpen,
  onOpenChange,
}: {
  exercise?: ExerciseItem;
  trigger?: ReactElement;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [innerOpen, setInnerOpen] = useState(false);
  const open = controlledOpen ?? innerOpen;
  const setOpen = onOpenChange ?? setInnerOpen;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger ? <DialogTrigger render={trigger} /> : null}
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{exercise ? "Редактировать упражнение" : "Новое упражнение"}</DialogTitle>
          <DialogDescription>Укажите группы мышц — по ним строится статистика.</DialogDescription>
        </DialogHeader>
        {/* Форма монтируется заново при каждом открытии — состояние сбрасывается. */}
        {open ? <ExerciseForm exercise={exercise} onDone={() => setOpen(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function ExerciseForm({ exercise, onDone }: { exercise?: ExerciseItem; onDone: () => void }) {
  const [groups, setGroups] = useState<MuscleGroup[]>(exercise?.muscleGroups ?? []);
  const [rest, setRest] = useState(String(exercise?.defaultRestSec ?? 90));

  const [state, action, pending] = useActionState(
    async (prev: ExerciseFormState, formData: FormData) => {
      const result = await saveExerciseAction(prev, formData);
      if (result.success) {
        toast.success(exercise ? "Упражнение обновлено" : "Упражнение добавлено");
        onDone();
      }
      return result;
    },
    {},
  );

  const toggle = (group: MuscleGroup) =>
    setGroups((current) => (current.includes(group) ? current.filter((g) => g !== group) : [...current, group]));

  const makePrimary = (group: MuscleGroup) =>
    setGroups((current) => [group, ...current.filter((g) => g !== group)]);

  return (
    <form action={action} noValidate>
      {exercise ? <input type="hidden" name="id" value={exercise.id} /> : null}
      {groups.map((g) => (
        <input key={g} type="hidden" name="muscleGroups" value={g} />
      ))}

      <FieldGroup>
        {state.message ? <p className="text-sm text-destructive">{state.message}</p> : null}

        <Field data-invalid={Boolean(state.errors?.name) || undefined}>
          <FieldLabel htmlFor="exercise-name">Название</FieldLabel>
          <Input
            id="exercise-name"
            name="name"
            defaultValue={exercise?.name}
            placeholder="Например, жим гантелей сидя"
            aria-invalid={Boolean(state.errors?.name) || undefined}
            autoFocus
          />
          <FieldError errors={toErrors(state.errors?.name)} />
        </Field>

        <FieldSet data-invalid={Boolean(state.errors?.muscleGroups) || undefined}>
          <FieldLegend variant="label">Группы мышц</FieldLegend>
          <FieldDescription>
            Первая выбранная — основная <Star className="inline size-3 fill-current text-primary" />. Нажмите на звезду,
            чтобы сделать группу основной.
          </FieldDescription>
          <div className="flex flex-wrap gap-2">
            {MUSCLE_GROUPS.map((group) => {
              const index = groups.indexOf(group);
              const selected = index >= 0;
              return (
                <span
                  key={group}
                  className={cn(
                    "inline-flex items-center overflow-hidden rounded-full border text-sm transition-colors",
                    selected ? "border-primary bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {selected ? (
                    <button
                      type="button"
                      onClick={() => makePrimary(group)}
                      className="py-1 pl-2.5"
                      aria-label={`Сделать «${MUSCLE_GROUP_LABELS[group]}» основной`}
                    >
                      <Star className={cn("size-3.5", index === 0 ? "fill-current" : "opacity-40")} />
                    </button>
                  ) : null}
                  <button
                    type="button"
                    aria-pressed={selected}
                    onClick={() => toggle(group)}
                    className={cn("py-1 pr-3", selected ? "pl-1.5" : "pl-3")}
                  >
                    {MUSCLE_GROUP_LABELS[group]}
                  </button>
                </span>
              );
            })}
          </div>
          <FieldError errors={toErrors(state.errors?.muscleGroups)} />
        </FieldSet>

        <Field data-invalid={Boolean(state.errors?.defaultRestSec) || undefined}>
          <FieldLabel htmlFor="exercise-rest">Отдых между подходами, сек</FieldLabel>
          <div className="flex flex-wrap gap-2">
            <Input
              id="exercise-rest"
              name="defaultRestSec"
              type="number"
              inputMode="numeric"
              min={0}
              max={600}
              step={5}
              value={rest}
              onChange={(e) => setRest(e.target.value)}
              className="w-24"
              aria-invalid={Boolean(state.errors?.defaultRestSec) || undefined}
            />
            {REST_PRESETS.map((sec) => (
              <Button
                key={sec}
                type="button"
                size="sm"
                variant={rest === String(sec) ? "secondary" : "ghost"}
                onClick={() => setRest(String(sec))}
                className="h-9"
              >
                {sec}
              </Button>
            ))}
          </div>
          <FieldError errors={toErrors(state.errors?.defaultRestSec)} />
        </Field>

        <Field orientation="horizontal">
          <Checkbox id="exercise-bw" name="isBodyweight" defaultChecked={exercise?.isBodyweight} />
          <FieldLabel htmlFor="exercise-bw" className="font-normal">
            Со своим весом (подтягивания, отжимания…)
          </FieldLabel>
        </Field>

        <Field data-invalid={Boolean(state.errors?.description) || undefined}>
          <FieldLabel htmlFor="exercise-description">Описание / техника</FieldLabel>
          <Textarea
            id="exercise-description"
            name="description"
            defaultValue={exercise?.description ?? ""}
            rows={3}
            placeholder="Необязательно"
          />
          <FieldError errors={toErrors(state.errors?.description)} />
        </Field>
      </FieldGroup>

      <DialogFooter className="mt-6">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : null}
          {exercise ? "Сохранить" : "Добавить"}
        </Button>
      </DialogFooter>
    </form>
  );
}
