"use client";

import { useState, useTransition } from "react";
import { EllipsisVertical, Loader2, Target, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { DeadlinePicker } from "@/components/goals/deadline-picker";
import { GoalChestButton } from "@/components/goals/goal-chest-button";
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
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { deleteGoalAction, updateGoalDeadlineAction } from "@/lib/goals/actions";
import { deadlineText, goalValueText } from "@/lib/goals/rules";
import type { GoalView } from "@/lib/goals/queries";
import { cn } from "@/lib/utils";

export type GoalCardData = Pick<GoalView, "id" | "type" | "metric" | "title" | "target" | "current" | "progress" | "pace" | "deadline" | "status" | "chestOpenedAt">;

/** Полоса прогресса цели (общая для страницы, дашборда и тренера). */
export function GoalBar({ goal }: { goal: Pick<GoalCardData, "title" | "progress" | "status"> }) {
  const pct = Math.round(goal.progress * 100);
  return (
    <div
      role="progressbar"
      aria-label={`Прогресс: ${goal.title}`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      className="h-2 w-full overflow-hidden rounded-full bg-muted"
    >
      <div className={cn("h-full rounded-full", goal.status === "ACHIEVED" ? "bg-xp" : "bg-primary")} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function GoalCard({ goal, today, readOnly = false }: { goal: GoalCardData; today: string; readOnly?: boolean }) {
  const achieved = goal.status === "ACHIEVED";
  return (
    <article aria-label={goal.title} className={cn("space-y-3 rounded-xl border bg-card p-4", achieved && "border-xp")}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <Target className={cn("mt-0.5 size-4 shrink-0", achieved ? "text-xp" : "text-primary")} />
          <h3 className="font-bold">{goal.title}</h3>
        </div>
        {!readOnly && !achieved ? <GoalMenu goal={goal} today={today} /> : null}
      </div>
      <GoalBar goal={goal} />
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm">
        <span className="tabular-nums">
          {achieved ? "Цель достигнута" : `${goalValueText(goal, goal.current, goal.target)} · ${Math.round(goal.progress * 100)} %`}
        </span>
        {!achieved && goal.deadline ? <span className="text-muted-foreground">{deadlineText(goal.deadline, today)}</span> : null}
      </div>
      {!achieved && goal.pace === "behind" ? (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <TriangleAlert className="size-3.5" />
          Отстаёшь от темпа
        </p>
      ) : null}
      {achieved && !readOnly ? <GoalChestButton goalId={goal.id} title={goal.title} available={!goal.chestOpenedAt} /> : null}
    </article>
  );
}

function GoalMenu({ goal, today }: { goal: GoalCardData; today: string }) {
  const [dialog, setDialog] = useState<"deadline" | "delete" | null>(null);
  const [deadline, setDeadline] = useState(goal.deadline);
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  const run = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>) =>
    startTransition(async () => {
      try {
        const res = await fn();
        if (res.ok) setDialog(null);
        else if (dialog === "deadline") setError(res.error);
        else toast.error(res.error);
      } catch {
        toast.error("Не удалось сохранить — проверьте связь");
      }
    });

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Действия с целью" />}>
          <EllipsisVertical />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={() => {
              setDeadline(goal.deadline);
              setError(undefined);
              setDialog("deadline");
            }}
          >
            Перенести срок
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={() => setDialog("delete")}>
            Удалить
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={dialog === "deadline"} onOpenChange={(o) => setDialog(o ? "deadline" : null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Срок цели</DialogTitle>
          </DialogHeader>
          <DeadlinePicker value={deadline} onChange={setDeadline} today={today} error={error} />
          <DialogFooter>
            <Button disabled={pending} onClick={() => run(() => updateGoalDeadlineAction(goal.id, deadline))}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={dialog === "delete"} onOpenChange={(o) => setDialog(o ? "delete" : null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить цель «{goal.title}»?</AlertDialogTitle>
            <AlertDialogDescription>Прогресс не потеряется — он считается из тренировок, но сундука за эту цель не будет.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Отмена</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={pending} onClick={() => run(() => deleteGoalAction(goal.id))}>
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
