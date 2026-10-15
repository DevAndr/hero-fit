"use client";

import { Fragment, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Loader2, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { selectOnFocus } from "@/components/ui/select-on-focus";
import { Textarea } from "@/components/ui/textarea";
import { ExercisePicker } from "@/components/training/exercise-picker";
import { parseNumber } from "@/components/training/workout-state";
import type { MuscleGroup } from "@/generated/prisma/enums";
import type { ExerciseItem } from "@/lib/exercises/queries";
import { MUSCLE_GROUP_LABELS } from "@/lib/muscle-groups";
import { saveTemplateAction } from "@/lib/templates/actions";
import { progressionHint } from "@/lib/templates/progression";
import { useFlag } from "@/components/flags/flags-provider";
import { SupersetHeader, SupersetLabel, SupersetLink, SupersetPart } from "@/components/training/superset-frame";
import { canLink, groupLabels, groupSize, link, normalizeGroups, unlink } from "@/lib/workouts/supersets";
import type { TemplateForEdit } from "@/lib/templates/queries";

type Item = {
  key: string;
  exercise: { id: string; name: string; muscleGroups: MuscleGroup[]; archived: boolean; isBodyweight: boolean };
  targetSets: string;
  targetReps: string;
  targetWeight: string;
  restSec: string;
  /** Своя прогрессия: шаг, кг. */
  step: string;
  /** Суперсет/круг (lib/workouts/supersets.ts). */
  group: number | null;
};

let seq = 0;
const key = () => `t${seq++}`;
const str = (n: number | null | undefined) => (n ? String(n) : "");

function fromTemplate(template?: TemplateForEdit): Item[] {
  return (template?.exercises ?? []).map((e) => ({
    key: key(),
    exercise: { ...e.exercise, archived: Boolean(e.exercise.archivedAt) },
    targetSets: String(e.targetSets),
    targetReps: str(e.targetReps),
    targetWeight: str(e.targetWeight),
    restSec: String(e.restSec ?? e.exercise.defaultRestSec),
    step: str(e.step).replace(".", ","),
    group: e.supersetGroup,
  }));
}

function NumberCell({
  label,
  value,
  onChange,
  decimal,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  decimal?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-muted-foreground">
      {label}
      <Input
        {...selectOnFocus}
        inputMode={decimal ? "decimal" : "numeric"}
        value={value}
        placeholder="—"
        onChange={(e) => onChange(e.target.value)}
        className="h-9 text-center text-sm tabular-nums"
      />
    </label>
  );
}

export function TemplateEditor({ template, exercises }: { template?: TemplateForEdit; exercises: ExerciseItem[] }) {
  const router = useRouter();
  const [name, setName] = useState(template?.name ?? "");
  const [description, setDescription] = useState(template?.description ?? "");
  const [items, setRawItems] = useState<Item[]>(() => fromTemplate(template));
  const [errors, setErrors] = useState<Record<string, string[] | undefined>>({});
  const [pending, startTransition] = useTransition();
  const formatsOn = useFlag("workout_formats");
  const labels = groupLabels(items);
  // Список поменялся — группы суперсетов без «дыр» и одиночек
  const setItems = (fn: (cur: Item[]) => Item[]) => setRawItems((cur) => normalizeGroups(fn(cur)));

  const update = (k: string, patch: Partial<Item>) =>
    setItems((cur) => cur.map((i) => (i.key === k ? { ...i, ...patch } : i)));

  const move = (index: number, delta: -1 | 1) =>
    setItems((cur) => {
      const next = [...cur];
      const to = index + delta;
      if (to < 0 || to >= next.length) return cur;
      [next[index], next[to]] = [next[to], next[index]];
      return next;
    });

  const add = (picked: ExerciseItem[]) =>
    setItems((cur) => [
      ...cur,
      ...picked.map((e) => ({
        key: key(),
        exercise: { id: e.id, name: e.name, muscleGroups: e.muscleGroups, archived: false, isBodyweight: e.isBodyweight },
        targetSets: "3",
        targetReps: "",
        targetWeight: "",
        restSec: String(e.defaultRestSec),
        step: "",
        group: null,
      })),
    ]);

  const save = () =>
    startTransition(async () => {
      const result = await saveTemplateAction(template?.id ?? null, {
        name,
        description,
        exercises: items.map((i) => ({
          exerciseId: i.exercise.id,
          targetSets: Math.round(parseNumber(i.targetSets)),
          targetReps: Math.round(parseNumber(i.targetReps)) || null,
          targetWeight: parseNumber(i.targetWeight) || null,
          restSec: Math.round(parseNumber(i.restSec)),
          step: parseNumber(i.step) || null,
          group: i.group,
        })),
      });
      if (result.ok) {
        toast.success(template ? "Шаблон сохранён" : "Шаблон создан");
        router.push("/templates");
      } else {
        setErrors(result.errors ?? {});
        if (result.error) toast.error(result.error);
      }
    });

  const toErrors = (m?: string[]) => m?.map((message) => ({ message }));

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <FieldGroup className="rounded-xl border bg-card p-4">
        <Field data-invalid={Boolean(errors.name) || undefined}>
          <FieldLabel htmlFor="template-name">Название</FieldLabel>
          <Input
            id="template-name"
            value={name}
            maxLength={80}
            placeholder="Например, «Моя тренировка на грудь»"
            onChange={(e) => setName(e.target.value)}
            aria-invalid={Boolean(errors.name) || undefined}
          />
          <FieldError errors={toErrors(errors.name)} />
        </Field>
        <Field>
          <FieldLabel htmlFor="template-description">Описание</FieldLabel>
          <Textarea
            id="template-description"
            value={description}
            rows={2}
            maxLength={300}
            placeholder="Необязательно"
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
      </FieldGroup>

      {items.map((item, index) => (
        <Fragment key={item.key}>
          {formatsOn && item.group !== null && items[index - 1]?.group !== item.group ? (
            <SupersetHeader size={groupSize(items, index)} />
          ) : null}
          <SupersetPart grouped={formatsOn && item.group !== null}>
            <section aria-label={item.exercise.name} className="rounded-xl border bg-card p-4">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <h3 className="flex items-center gap-2 font-semibold">
                    <span className="text-muted-foreground tabular-nums">{index + 1}.</span>
                    <span>
                      {formatsOn ? <SupersetLabel label={labels[index]} /> : null}
                      {item.exercise.name}
                    </span>
                    {item.exercise.archived ? <Badge variant="destructive">удалено</Badge> : null}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {item.exercise.muscleGroups.map((g) => MUSCLE_GROUP_LABELS[g]).join(" · ")}
                  </p>
                </div>
                <Button variant="ghost" size="icon-sm" disabled={index === 0} onClick={() => move(index, -1)} aria-label="Выше">
                  <ArrowUp />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={index === items.length - 1}
                  onClick={() => move(index, 1)}
                  aria-label="Ниже"
                >
                  <ArrowDown />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setItems((cur) => cur.filter((i) => i.key !== item.key))}
                  aria-label={`Убрать «${item.exercise.name}»`}
                >
                  <Trash2 />
                </Button>
              </div>
              <div className="mt-3 grid grid-cols-4 gap-2">
                <NumberCell label="Подходы" value={item.targetSets} onChange={(v) => update(item.key, { targetSets: v })} />
                <NumberCell label="Повторы" value={item.targetReps} onChange={(v) => update(item.key, { targetReps: v })} />
                <NumberCell label="Вес, кг" decimal value={item.targetWeight} onChange={(v) => update(item.key, { targetWeight: v })} />
                <NumberCell label="Отдых, с" value={item.restSec} onChange={(v) => update(item.key, { restSec: v })} />
              </div>
              <div className="mt-2 grid grid-cols-4 items-end gap-2">
                <NumberCell label="Шаг, кг" decimal value={item.step} onChange={(v) => update(item.key, { step: v })} />
                <p className="col-span-3 pb-2 text-xs text-muted-foreground">
                  {progressionHint(
                    {
                      targetSets: Math.round(parseNumber(item.targetSets)) || 1,
                      targetReps: Math.round(parseNumber(item.targetReps)) || null,
                      targetWeight: parseNumber(item.targetWeight) || null,
                      step: parseNumber(item.step) || null,
                    },
                    { bodyweight: item.exercise.isBodyweight },
                  ) ?? "Шаг — вес растёт сам, когда цель выполнена"}
                </p>
              </div>
            </section>
          </SupersetPart>
          {formatsOn && items[index + 1] ? (
            <SupersetLink
              names={[item.exercise.name, items[index + 1].exercise.name]}
              linked={item.group !== null && items[index + 1].group === item.group}
              canLink={canLink(items, index)}
              onLink={() => setItems((cur) => link(cur, index))}
              onUnlink={() => setItems((cur) => unlink(cur, index))}
            />
          ) : null}
        </Fragment>
      ))}

      {errors.exercises ? <FieldError errors={toErrors(errors.exercises)} /> : null}

      <ExercisePicker exercises={exercises} alreadyAdded={new Set(items.map((i) => i.exercise.id))} onAdd={add} />

      <Button size="lg" className="w-full" onClick={save} disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : <Save />}
        Сохранить шаблон
      </Button>
    </div>
  );
}
