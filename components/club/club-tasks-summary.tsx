import Link from "next/link";
import { CircleCheck, ListChecks } from "lucide-react";
import type { FinishClubTask } from "@/lib/club/tasks-apply";

/** «Задания клуба» в сводке: что эта тренировка внесла и что выполнила. */
export function ClubTasksSummary({ tasks, readOnly = false }: { tasks: FinishClubTask[]; readOnly?: boolean }) {
  return (
    <section aria-label="Задания клуба" className="mt-4 space-y-2 rounded-xl border bg-card p-4">
      <h2 className="flex items-center gap-2 font-bold">
        <ListChecks className="size-4 text-primary" aria-hidden />
        Задания клуба
      </h2>
      <ul className="space-y-1.5 text-sm">
        {tasks.map((t) => (
          <li key={t.taskId} className="flex flex-wrap items-baseline gap-x-2">
            <span className="min-w-0 break-words">{t.title}</span>
            <span className="font-semibold text-primary">+{t.amountText}</span>
            {t.clubCompleted ? (
              <span className="flex items-center gap-1 font-semibold text-xp">
                <CircleCheck className="size-4" aria-hidden />
                Клуб выполнил задание!
              </span>
            ) : t.completed ? (
              <span className="flex items-center gap-1 font-semibold text-xp">
                <CircleCheck className="size-4" aria-hidden />
                Задание выполнено!
              </span>
            ) : null}
          </li>
        ))}
      </ul>
      {!readOnly && tasks.some((t) => t.completed) ? (
        <Link href="/clubs" className="inline-block text-sm font-medium text-primary underline-offset-4 hover:underline">
          Сундук — на странице клуба
        </Link>
      ) : null}
    </section>
  );
}
