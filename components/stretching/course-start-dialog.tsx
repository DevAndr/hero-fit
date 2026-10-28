"use client";

import { useState, useTransition } from "react";
import { Radio } from "@base-ui/react/radio";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup } from "@/components/ui/radio-group";
import { selectOnFocus } from "@/components/ui/select-on-focus";
import { COURSE_SKILLS, isCourseSkill, type CourseSkill } from "@/lib/stretching/course";
import { startCourseAction } from "@/lib/stretching/course-actions";
import { SPLIT_CAUTION } from "@/lib/stretching/seed-data";
import { STRETCH_SKILLS } from "@/lib/stretching/skills";
import { cn } from "cn";

const DAY_NAMES = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];
export const DEFAULT_DAYS = [0, 2, 4];

/** Дни напоминаний: 0 = пн … 6 = вс; можно снять все. */
export function DaysPicker({ value, onChange }: { value: number[]; onChange: (days: number[]) => void }) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-sm font-medium">Дни напоминаний</legend>
      <div className="flex flex-wrap gap-3">
        {DAY_NAMES.map((name, day) => (
          <Label key={name} className="flex items-center gap-1.5 font-normal">
            <Checkbox
              checked={value.includes(day)}
              onCheckedChange={(on) => onChange(on ? [...value, day].sort((a, b) => a - b) : value.filter((d) => d !== day))}
            />
            {name}
          </Label>
        ))}
      </div>
    </fieldset>
  );
}

/** Старт курса: вид шпагата, дни напоминаний, стартовый замер (обязателен). */
export function CourseStartDialog({ open, onOpenChange, skill: initialSkill }: { open: boolean; onOpenChange: (open: boolean) => void; skill?: CourseSkill | null }) {
  const [skill, setSkill] = useState<CourseSkill | null>(initialSkill ?? null);
  const [days, setDays] = useState<number[]>(DEFAULT_DAYS);
  const [cm, setCm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () =>
    startTransition(async () => {
      if (!skill) return setError("Выберите вид шпагата");
      const value = Number(cm.trim().replace(",", "."));
      if (!cm.trim() || !Number.isFinite(value)) return setError("Укажите замер от 0,5 до 200 см");
      try {
        const res = await startCourseAction({ skill, remindDays: days, cm: value });
        if (res.ok) onOpenChange(false);
        else setError(res.error);
      } catch {
        setError("Не удалось сохранить — проверьте связь");
      }
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Начать курс</DialogTitle>
          <DialogDescription>30 занятий за 10 недель: время удержания растёт от этапа к этапу.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Вид</p>
            <RadioGroup aria-label="Вид шпагата" value={skill ?? ""} onValueChange={(v) => isCourseSkill(String(v)) && setSkill(v as CourseSkill)} className="flex flex-col gap-1">
              {COURSE_SKILLS.map((k) => (
                <Radio.Root
                  key={k}
                  value={k}
                  aria-label={STRETCH_SKILLS[k].title}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-left text-sm transition-colors outline-none",
                    "hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
                    "data-checked:border-primary data-checked:bg-primary/10",
                  )}
                >
                  {STRETCH_SKILLS[k].title}
                </Radio.Root>
              ))}
            </RadioGroup>
          </div>
          <DaysPicker value={days} onChange={setDays} />
          <div className="space-y-1.5">
            <Label htmlFor="course-start-cm">Сейчас, см до пола</Label>
            <Input id="course-start-cm" inputMode="decimal" placeholder="см" value={cm} onChange={(e) => setCm(e.target.value)} className="max-w-28" {...selectOnFocus} />
            <p className="text-xs text-muted-foreground">Мерка — {STRETCH_SKILLS[skill ?? "SPLIT_SIDE"].measure}, после разминки</p>
          </div>
          <p className="text-sm text-muted-foreground">{SPLIT_CAUTION}</p>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              Начать курс
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
