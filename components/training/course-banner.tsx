"use client";

import { useState, useTransition } from "react";
import { Loader2, Route } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { selectOnFocus } from "@/components/ui/select-on-focus";
import { logStretchMeasurementAction } from "@/lib/goals/stretch-actions";
import { COURSE_SESSIONS } from "@/lib/stretching/course";

export type CourseInfo = {
  session: number;
  stage: number;
  maintenance: boolean;
  /** Занятие с замером и цель-навык ещё есть. */
  measure: { goalId: string; measureLabel: string } | null;
};

/** Занятие курса «Сесть на шпагат» в редакторе: строка курса, разминка, плашка замера (не блокирует завершение). */
export function CourseBanner({ course }: { course: CourseInfo }) {
  const [measureOpen, setMeasureOpen] = useState(true);
  const [value, setValue] = useState("");
  const [pending, startTransition] = useTransition();

  const save = (goalId: string) =>
    startTransition(async () => {
      const cm = Number(value.trim().replace(",", "."));
      if (!value.trim() || !Number.isFinite(cm)) return void toast.error("Укажите замер от 0 до 200 см");
      try {
        const res = await logStretchMeasurementAction(goalId, cm);
        if (!res.ok) return void toast.error(res.error);
        setMeasureOpen(false);
        toast.success(res.achieved ? "🎯 Цель достигнута: шпагат!" : "Замер записан");
      } catch {
        toast.error("Не удалось сохранить — проверьте связь");
      }
    });

  return (
    <section aria-label="Занятие курса" className="space-y-2 rounded-xl border bg-card p-4">
      <p className="flex items-center gap-2 font-semibold" data-testid="course-line">
        <Route className="size-4 text-primary" aria-hidden />
        {course.maintenance ? "Курс: поддержка" : `Курс: этап ${course.stage} · занятие ${course.session} из ${COURSE_SESSIONS}`}
      </p>
      <p className="text-sm text-muted-foreground">Разомнитесь 5 минут: ходьба, махи ногами. Не до боли</p>
      {course.measure && measureOpen ? (
        <div role="region" aria-label="Замер: см до пола" className="space-y-2 rounded-lg border border-primary/40 bg-primary/5 p-3">
          <p className="text-sm font-medium">Замер: см до пола</p>
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              save(course.measure!.goalId);
            }}
          >
            <Input aria-label="Замер, см" inputMode="decimal" placeholder="см" value={value} onChange={(e) => setValue(e.target.value)} className="max-w-28" {...selectOnFocus} />
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              Сохранить
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setMeasureOpen(false)}>
              Пропустить
            </Button>
          </form>
          <p className="text-xs text-muted-foreground">Мерка: {course.measure.measureLabel}, после разминки</p>
        </div>
      ) : null}
    </section>
  );
}
