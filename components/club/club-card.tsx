import Link from "next/link";
import { Building2 } from "lucide-react";
import type { ClubDashboard } from "@/lib/club/dashboard";
import { unitText } from "@/lib/club/tasks";
import type { ClubTaskView } from "@/lib/club/tasks-queries";
import { cn } from "@/lib/utils";

const dashed =
  "flex h-full items-center gap-3 rounded-xl border border-dashed p-4 text-sm text-muted-foreground transition-colors hover:border-primary/50";

/** Карточка «Клуб» на дашборде: участнику — место недели, задание и сундук; иначе — заявка или призыв. */
export function ClubCard({ data }: { data: ClubDashboard }) {
  if (data.kind !== "member") {
    return (
      <section aria-label="Клуб">
        <Link href={data.kind === "pending" ? "/clubs?list=1" : "/clubs"} className={dashed}>
          <Building2 className="size-5 shrink-0 text-primary" />
          <span>
            <span className="block font-semibold text-foreground">Клуб зала</span>
            {data.kind === "pending"
              ? `Заявка на клуб «${data.name}» на проверке.`
              : "Найдите свой зал и соревнуйтесь с теми, кто тренируется рядом."}
          </span>
        </Link>
      </section>
    );
  }
  const { club, task } = data;
  const href = task || data.chest ? `/clubs/${club.id}?tab=tasks` : `/clubs/${club.id}`;
  return (
    <section aria-label="Клуб">
      <Link href={href} className="flex h-full items-center gap-3 rounded-xl border bg-card p-4 transition-colors hover:border-primary/50">
        <span className="flex size-10 shrink-0 items-center justify-center self-start rounded-lg bg-primary/10 text-primary">
          <Building2 className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">
            {club.name} · {club.city}
          </span>
          <span className="block text-sm text-muted-foreground tabular-nums">
            {data.place
              ? `${data.place}-е место из ${data.ranked} на этой неделе`
              : `На этой неделе вы ещё не в рейтинге · в клубе ${data.members}`}
          </span>
          {task ? <TaskLine task={task} /> : null}
          {data.chest ? <span className="mt-1 block text-xs font-semibold text-xp">Сундук ждёт</span> : null}
        </span>
      </Link>
    </section>
  );
}

const amount = (t: ClubTaskView, n: number) =>
  t.type === "HOURS" ? (n / 60).toLocaleString("ru-RU", { maximumFractionDigits: 1 }) : n.toLocaleString("ru-RU");

/** Задание в карточке: название, полоса и «N дн.». */
function TaskLine({ task }: { task: ClubTaskView }) {
  const progress = task.progress;
  const pct = progress ? Math.min(100, Math.round((progress.done / progress.target) * 100)) : 0;
  return (
    <span className="mt-2 block space-y-1">
      <span className="block truncate text-xs">{task.title}</span>
      {progress ? (
        <span className="block h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
          <span className={cn("block h-full rounded-full", task.completed ? "bg-xp" : "bg-primary")} style={{ width: `${pct}%` }} />
        </span>
      ) : null}
      <span className="block text-xs text-muted-foreground tabular-nums">
        {progress
          ? `${amount(task, progress.done)} / ${amount(task, progress.target)}${unitText(task.type, progress.target).replace(/^[\d\s,]+/, " ")}`
          : null}
        {task.completed ? " · выполнено" : task.started ? ` · ${task.daysLeft} дн.` : " · ещё не началось"}
      </span>
    </span>
  );
}
