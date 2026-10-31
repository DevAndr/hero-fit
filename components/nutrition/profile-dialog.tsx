"use client";

import { useActionState, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { selectOnFocus } from "@/components/ui/select-on-focus";
import { clearNutritionProfileAction, saveNutritionProfileAction, type NutritionFormState } from "@/lib/nutrition/actions";
import { ACTIVITY_LABELS, GOAL_LABELS, type ActivityLevel, type NutritionGoal } from "@/lib/nutrition/norm";
import type { NutritionView } from "@/lib/nutrition/queries";

const option = "flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm transition-colors hover:bg-muted has-data-checked:border-primary has-data-checked:bg-primary/10";
const GENDERS = [
  ["MALE", "Мужской"],
  ["FEMALE", "Женский"],
] as const;

function Errors({ list }: { list?: string[] }) {
  return list?.length ? <p className="text-sm text-destructive">{list[0]}</p> : null;
}

/** Анкета нормы: пол, год рождения, рост, вес (в журнал за сегодня), активность, цель; «Очистить данные питания». */
export function NutritionProfileDialog({ profile, label, variant = "default" }: { profile: NutritionView["profile"]; label: string; variant?: "default" | "outline" }) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [state, action, saving] = useActionState<NutritionFormState, FormData>(async (prev, formData) => {
    const result = await saveNutritionProfileAction(prev, formData);
    if (result.ok) setOpen(false);
    return result;
  }, {});
  const [clearing, startClear] = useTransition();
  const filled = profile.birthYear !== null || profile.heightCm !== null || profile.activity !== null || profile.goal !== null;

  const field = (name: "birthYear" | "heightCm" | "weight", text: string, value: number | null, mode: "numeric" | "decimal") => (
    <div className="space-y-1.5">
      <Label htmlFor={`nutrition-${name}`}>{text}</Label>
      <Input id={`nutrition-${name}`} name={name} inputMode={mode} defaultValue={state.values?.[name] ?? value ?? ""} className="max-w-32" {...selectOnFocus} />
      <Errors list={state.errors?.[name]} />
    </div>
  );

  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        {label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Данные для нормы</DialogTitle>
            <DialogDescription>Видите только вы. Вес попадёт в журнал взвешиваний за сегодня.</DialogDescription>
          </DialogHeader>
          <form action={action} className="space-y-4">
            <div className="space-y-1.5">
              <p className="text-sm font-medium">Пол</p>
              <RadioGroup name="gender" aria-label="Пол" defaultValue={state.values?.gender ?? profile.gender ?? undefined} className="grid-cols-2">
                {GENDERS.map(([value, text]) => (
                  <label key={value} className={option}>
                    <RadioGroupItem value={value} aria-label={text} />
                    {text}
                  </label>
                ))}
              </RadioGroup>
              <Errors list={state.errors?.gender} />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {field("birthYear", "Год рождения", profile.birthYear, "numeric")}
              {field("heightCm", "Рост, см", profile.heightCm, "numeric")}
              {field("weight", "Вес, кг", profile.weightKg, "decimal")}
            </div>
            <div className="space-y-1.5">
              <p className="text-sm font-medium">Активность</p>
              <RadioGroup name="activity" aria-label="Активность" defaultValue={state.values?.activity ?? profile.activity ?? undefined} className="grid-cols-1">
                {(Object.keys(ACTIVITY_LABELS) as ActivityLevel[]).map((a) => (
                  <label key={a} className={option}>
                    <RadioGroupItem value={a} aria-label={ACTIVITY_LABELS[a].label} />
                    <span>
                      {ACTIVITY_LABELS[a].label} <span className="text-muted-foreground">— {ACTIVITY_LABELS[a].hint}</span>
                    </span>
                  </label>
                ))}
              </RadioGroup>
              <Errors list={state.errors?.activity} />
            </div>
            <div className="space-y-1.5">
              <p className="text-sm font-medium">Цель</p>
              <RadioGroup name="goal" aria-label="Цель" defaultValue={state.values?.goal ?? profile.goal ?? undefined} className="grid-cols-3">
                {(Object.keys(GOAL_LABELS) as NutritionGoal[]).map((g) => (
                  <label key={g} className={option}>
                    <RadioGroupItem value={g} aria-label={GOAL_LABELS[g]} />
                    {GOAL_LABELS[g]}
                  </label>
                ))}
              </RadioGroup>
              <Errors list={state.errors?.goal} />
            </div>
            <DialogFooter className="gap-2 sm:justify-between">
              {filled ? (
                <Button type="button" variant="ghost" onClick={() => setConfirm(true)}>
                  Очистить данные питания
                </Button>
              ) : (
                <span />
              )}
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2 className="animate-spin" /> : null}
                Сохранить
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Очистить данные питания?</AlertDialogTitle>
            <AlertDialogDescription>Рост, год рождения, активность и цель удалятся. Пол и журнал веса останутся.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={clearing}>Отмена</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={clearing}
              onClick={() =>
                startClear(async () => {
                  await clearNutritionProfileAction();
                  setConfirm(false);
                  setOpen(false);
                })
              }
            >
              Очистить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
