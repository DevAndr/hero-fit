"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck } from "lucide-react";
import { ChestDialog } from "@/components/progress/chest-dialog";
import { Button } from "@/components/ui/button";
import { unitText } from "@/lib/club/tasks";
import type { ClubTaskView } from "@/lib/club/tasks-queries";
import { openClubTaskChestAction } from "@/lib/club/task-actions";
import { plural } from "@/lib/format";
import { cn } from "@/lib/utils";

const dateFormat = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" });

function when(t: ClubTaskView) {
  if (t.cancelled) return "Отменено";
  if (!t.started) return `стартует ${dateFormat.format(new Date(t.startsAt))}`;
  if (t.daysLeft <= 0) return `до ${dateFormat.format(new Date(new Date(t.endsAt).getTime() - 1))}`;
  return `осталось ${t.daysLeft} ${plural(t.daysLeft, "день", "дня", "дней")}`;
}

/** Число в единицах задания без слова («6 420», часы — из минут). */
const amount = (t: ClubTaskView, n: number) => (t.type === "HOURS" ? (n / 60).toLocaleString("ru-RU", { maximumFractionDigits: 1 }) : n.toLocaleString("ru-RU"));

function ChestButton({ task }: { task: ClubTaskView }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [taken, setTaken] = useState(false);
  if (!task.chest || task.chest.state === "opened") return null;
  if (task.chest.state === "expired") return <p className="text-sm text-muted-foreground">Сундук истёк</p>;
  if (task.chest.state === "wait") return <p className="text-sm text-muted-foreground">Откроется с понедельника</p>;
  // После открытия прячется только кнопка: диалог с наградой должен остаться смонтированным
  return (
    <>
      {taken ? null : (
        <Button size="sm" className="bg-amber-400 hover:bg-amber-300" onClick={() => setOpen(true)}>
          Открыть сундук
        </Button>
      )}
      <ChestDialog
        open={open}
        onOpenChange={(next, opened) => {
          setOpen(next);
          if (!next && opened) router.refresh();
        }}
        title="Сундук задания"
        description={`Награда за задание: ${task.title}`}
        openedDescription="Новые задания клуба — на этой вкладке"
        onOpen={() => openClubTaskChestAction(task.id)}
        onOpened={() => setTaken(true)}
      />
    </>
  );
}

function TaskCard({ task }: { task: ClubTaskView }) {
  const [names, setNames] = useState(false);
  const pct = task.progress ? Math.min(100, Math.round((task.progress.done / task.progress.target) * 100)) : 0;
  return (
    <article aria-label={task.title} className="space-y-3 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-semibold break-words">{task.title}</h3>
          <p className="text-xs text-muted-foreground">{when(task)}</p>
        </div>
        {task.completed ? (
          <span className="flex items-center gap-1 text-sm font-semibold text-xp">
            <CircleCheck className="size-4" aria-hidden />
            Выполнено
          </span>
        ) : null}
      </div>
      {task.progress ? (
        <div className="space-y-1">
          <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
            <div className={cn("h-full rounded-full", task.completed ? "bg-xp" : "bg-primary")} style={{ width: `${pct}%` }} />
          </div>
          <p className="text-sm tabular-nums">
            {amount(task, task.progress.done)} / {amount(task, task.progress.target)}
            <span className="text-muted-foreground"> · {unitText(task.type, task.progress.target).replace(/^[\d\s,]+/, "")}</span>
          </p>
        </div>
      ) : null}
      {task.mine ? (
        <p className="text-sm">
          Твой вклад: {task.mine.share} %
          {!task.completed && !task.mine.eligible ? <span className="text-muted-foreground"> · до сундука — 1 тренировка по заданию</span> : null}
          {!task.completed && task.mine.eligible ? <span className="text-muted-foreground"> · сундук — после выполнения</span> : null}
        </p>
      ) : null}
      {task.top.length ? (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Лучшие вкладчики</p>
          <ol aria-label="Лучшие вкладчики" className="space-y-0.5 text-sm">
            {task.top.map((m, i) => (
              <li key={i} className={cn("flex justify-between gap-2", m.me && "font-semibold")}>
                <span className="min-w-0 truncate">{m.nickname}</span>
                <span className="tabular-nums">{m.share} %</span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
      {task.completedCount !== null ? (
        <div className="text-sm">
          <button type="button" className="text-muted-foreground underline-offset-4 hover:underline" onClick={() => setNames((v) => !v)} aria-expanded={names}>
            Выполнили: {task.completedCount}
          </button>
          {names && task.completedNames?.length ? <p className="mt-1 break-words">{task.completedNames.join(", ")}</p> : null}
        </div>
      ) : null}
      <ChestButton task={task} />
    </article>
  );
}

/** Вкладка «Задания»: активные и стартующие, архив. */
export function ClubTasks({ active, archive }: { active: ClubTaskView[]; archive: ClubTaskView[] }) {
  return (
    <div className="space-y-4">
      {active.length ? (
        active.map((t) => <TaskCard key={t.id} task={t} />)
      ) : (
        <p className="text-sm text-muted-foreground">Активных заданий нет — их объявляет админ клуба.</p>
      )}
      {archive.length ? (
        <section aria-label="Архив" className="space-y-2">
          <h2 className="font-bold">Архив</h2>
          {archive.map((t) => (
            <TaskCard key={t.id} task={t} />
          ))}
        </section>
      ) : null}
    </div>
  );
}
