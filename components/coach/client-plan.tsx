"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CalendarPlus } from "lucide-react";
import { toast } from "sonner";
import { ScopeChoice } from "@/components/calendar/plan-dialog";
import { AssignDialog, type AssignDialogState, type AssignTemplate } from "@/components/coach/assign-dialog";
import { ClientTargets } from "@/components/coach/client-targets";
import { CopyPlanButton, type CopyRecipient } from "@/components/coach/copy-plan-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { deleteAssignmentAction } from "@/lib/coach/plan-actions";
import type { ClientTemplateTargets } from "@/lib/coach/target-queries";
import type { PlanScope } from "@/lib/plans/edit";
import { cn } from "@/lib/utils";

export type ClientPlanItem = {
  key: string;
  title: string;
  date: string;
  time: string;
  durationMin: number;
  templateId: string | null;
  recurring: boolean;
  status: "done" | "missed" | "today" | "planned" | "skipped";
  workoutId?: string;
};

const STATUS: Record<ClientPlanItem["status"], { label: string; className: string }> = {
  done: { label: "выполнено", className: "bg-primary/15 text-primary" },
  skipped: { label: "пропущено клиентом", className: "bg-muted text-muted-foreground" },
  missed: { label: "не сделано", className: "bg-destructive/15 text-destructive" },
  today: { label: "сегодня", className: "bg-streak/15 text-streak" },
  planned: { label: "запланировано", className: "bg-muted text-muted-foreground" },
};

const dayFormat = new Intl.DateTimeFormat("ru-RU", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const fmt = (date: string) => dayFormat.format(new Date(`${date}T12:00:00Z`));

/** Вкладка «План» карточки клиента: назначить, ближайшие 2 недели, задания по шаблонам, прошлые 4 недели со статусами. */
export function ClientPlan({
  clientId,
  today,
  base,
  templates,
  upcoming,
  past,
  targets,
  timeZone,
  copy,
}: {
  clientId: string;
  /** «Скопировать план» — есть что копировать и кому. */
  copy: { summary: string; recipients: CopyRecipient[] } | null;
  today: string;
  targets: ClientTemplateTargets[];
  timeZone: string;
  base: string;
  templates: AssignTemplate[];
  upcoming: ClientPlanItem[];
  past: ClientPlanItem[];
}) {
  const [dialog, setDialog] = useState<AssignDialogState | null>(null);
  const [removing, setRemoving] = useState<ClientPlanItem | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setDialog({ mode: "create", date: today })}>
          <CalendarPlus />
          Назначить
        </Button>
        {copy ? <CopyPlanButton sourceId={clientId} summary={copy.summary} recipients={copy.recipients} /> : null}
      </div>
      <PlanSection
        title="Ближайшие 2 недели"
        empty="Ничего не назначено."
        items={upcoming}
        base={base}
        onEdit={(item) => setDialog({ mode: "edit", item })}
        onDelete={setRemoving}
      />
      <ClientTargets clientId={clientId} timeZone={timeZone} templates={targets} />
      <PlanSection title="Прошлые 4 недели" empty="Назначений не было." items={past} base={base} />
      <AssignDialog clientId={clientId} state={dialog} templates={templates} onClose={() => setDialog(null)} />
      <RemoveDialog clientId={clientId} item={removing} onClose={() => setRemoving(null)} />
    </div>
  );
}

function PlanSection({
  title,
  empty,
  items,
  base,
  onEdit,
  onDelete,
}: {
  title: string;
  empty: string;
  items: ClientPlanItem[];
  base: string;
  onEdit?: (item: ClientPlanItem) => void;
  onDelete?: (item: ClientPlanItem) => void;
}) {
  return (
    <section aria-label={title} className="space-y-2 rounded-xl border bg-card p-4">
      <h2 className="font-bold">{title}</h2>
      {items.length ? (
        <ul className="divide-y divide-border/60">
          {items.map((item) => {
            const s = STATUS[item.status];
            const editable = onEdit && (item.status === "planned" || item.status === "today");
            return (
              <li key={item.key} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span>
                  <span className="block font-medium">{item.title}</span>
                  <span className="text-xs text-muted-foreground">{`${fmt(item.date)}, ${item.time}`}</span>
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  {item.status === "done" && item.workoutId ? (
                    <Link href={`${base}/workouts/${item.workoutId}`} className={cn("rounded-full px-2 py-0.5 text-xs font-medium hover:underline", s.className)}>
                      {s.label}
                    </Link>
                  ) : (
                    <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", s.className)}>{s.label}</span>
                  )}
                  {editable ? (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => onEdit(item)}>
                        Изменить
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => onDelete?.(item)}>
                        Удалить
                      </Button>
                    </>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{empty}</p>
      )}
    </section>
  );
}

function RemoveDialog({ clientId, item, onClose }: { clientId: string; item: ClientPlanItem | null; onClose: () => void }) {
  const [pending, startTransition] = useTransition();
  const remove = (scope: PlanScope) =>
    startTransition(async () => {
      if (!item) return;
      const result = await deleteAssignmentAction(clientId, item.key, scope);
      if (result.ok) onClose();
      else toast.error(result.error);
    });
  return (
    <Dialog open={item !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        {item?.recurring ? (
          <ScopeChoice verb="Удалить" pending={pending} onChoose={remove} onCancel={onClose} />
        ) : (
          <div className="grid gap-4">
            <DialogTitle>{`Удалить «${item?.title ?? ""}»?`}</DialogTitle>
            <div className="flex justify-end gap-2">
              <Button variant="outline" disabled={pending} onClick={onClose}>
                Отмена
              </Button>
              <Button variant="destructive" disabled={pending} onClick={() => remove("one")}>
                Удалить
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
