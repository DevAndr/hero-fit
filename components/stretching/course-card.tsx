"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { EllipsisVertical, Loader2, Play, Route } from "lucide-react";
import { toast } from "sonner";
import { CourseStartDialog, DaysPicker } from "@/components/stretching/course-start-dialog";
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
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Progress } from "@/components/ui/progress";
import { COURSE_SESSIONS, type CourseSkill } from "@/lib/stretching/course";
import { abandonCourseAction, finishCourseAction, setCourseDaysAction, startCourseSessionAction } from "@/lib/stretching/course-actions";
import type { CourseView } from "@/lib/stretching/course-queries";
import { STRETCH_SKILLS } from "@/lib/stretching/skills";

const TITLE = "Курс «Сесть на шпагат»";
const cmText = (n: number) => `${String(n).replace(".", ",")} см`;

type Result = { ok: true } | { ok: false; error: string };

/** Карточка курса на /stretching: старт, прогресс и «Начать занятие», итог после 30-го занятия. */
export function CourseCard({ course, active }: { course: CourseView | null; active: boolean }) {
  const [start, setStart] = useState<{ skill: CourseSkill | null } | null>(null);
  const [dialog, setDialog] = useState<"days" | "abandon" | null>(null);
  const [days, setDays] = useState<number[]>([]);
  // Последние сохранённые дни: обновлённый проп с сервера может прийти позже закрытия диалога
  const [savedDays, setSavedDays] = useState<number[] | null>(null);
  const daysKey = course?.remindDays.join(",") ?? "";
  const [seenDaysKey, setSeenDaysKey] = useState(daysKey);
  if (seenDaysKey !== daysKey) {
    setSeenDaysKey(daysKey);
    setSavedDays(null);
  }
  const [pending, startTransition] = useTransition();

  const run = (fn: () => Promise<Result>, after?: () => void) =>
    startTransition(async () => {
      try {
        const res = await fn();
        if (!res.ok) return void toast.error(res.error);
        setDialog(null);
        after?.();
      } catch {
        toast.error("Не удалось сохранить — проверьте связь");
      }
    });

  return (
    <section aria-label={TITLE} className="space-y-3 rounded-xl border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <Route className="size-5 text-primary" aria-hidden />
          {TITLE}
        </h2>
        {course ? (
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Действия с курсом" />}>
              <EllipsisVertical />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem
                onClick={() => {
                  setDays(savedDays ?? course.remindDays);
                  setDialog("days");
                }}
              >
                Дни напоминаний
              </DropdownMenuItem>
              {/* на итоговой карточке курс уже пройден — бросать нечего */}
              {course.finished ? null : (
                <DropdownMenuItem variant="destructive" onClick={() => setDialog("abandon")}>
                  Бросить курс
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>

      {!course ? (
        <>
          <p className="text-sm text-muted-foreground">10 недель, 30 занятий: план по шагам, время удержания растёт само.</p>
          <Button onClick={() => setStart({ skill: null })}>Начать курс</Button>
        </>
      ) : course.finished ? (
        <>
          <p className="font-semibold">{STRETCH_SKILLS[course.skill].title} — курс пройден!</p>
          <p className="text-sm text-muted-foreground" data-testid="course-result">
            {course.startCm !== null && course.lastCm !== null ? `Было ${cmText(course.startCm)} → стало ${cmText(course.lastCm)} · ` : ""}
            {COURSE_SESSIONS} занятий · {course.weeks} нед.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button disabled={pending} onClick={() => run(() => finishCourseAction("maintain"))}>
              Закрепить
            </Button>
            <Button variant="outline" disabled={pending} onClick={() => run(() => finishCourseAction("again"), () => setStart({ skill: course.skill }))}>
              Пройти заново
            </Button>
            <Button variant="ghost" disabled={pending} onClick={() => run(() => finishCourseAction("done"))}>
              Закончить
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="font-semibold">{STRETCH_SKILLS[course.skill].title}</p>
          <p className="text-sm text-muted-foreground" data-testid="course-progress">
            {course.status === "MAINTENANCE"
              ? "Поддержка · занятия по плану этапа 5"
              : `Этап ${course.stage} из 5 · Занятие ${course.nextSession} из ${COURSE_SESSIONS}`}
          </p>
          <Progress
            aria-label="Пройдено занятий"
            value={course.status === "MAINTENANCE" ? 100 : Math.round(((course.nextSession - 1) / COURSE_SESSIONS) * 100)}
          />
          {course.lastCm !== null ? <p className="text-sm">Последний замер: {cmText(course.lastCm)}</p> : null}
          {active ? (
            <Link href="/training" className={buttonVariants()}>
              <Play />
              Продолжить тренировку
            </Link>
          ) : (
            <form action={startCourseSessionAction}>
              <Button type="submit">
                <Play />
                Начать занятие
              </Button>
            </form>
          )}
        </>
      )}

      {/* key — каждый открытый старт с чистой формой и выбранным видом */}
      {start ? <CourseStartDialog key={start.skill ?? "new"} open onOpenChange={(o) => !o && setStart(null)} skill={start.skill} /> : null}

      <Dialog open={dialog === "days"} onOpenChange={(o) => setDialog(o ? "days" : null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Дни напоминаний</DialogTitle>
          </DialogHeader>
          <DaysPicker value={days} onChange={setDays} />
          <DialogFooter>
            <Button disabled={pending} onClick={() => run(() => setCourseDaysAction(days), () => setSavedDays(days))}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={dialog === "abandon"} onOpenChange={(o) => setDialog(o ? "abandon" : null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Бросить курс?</AlertDialogTitle>
            <AlertDialogDescription>Цель и замеры останутся. Новый курс можно начать сразу.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Отмена</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={pending} onClick={() => run(abandonCourseAction)}>
              Бросить курс
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
