"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { updateFeedbackAction } from "@/lib/feedback/admin-actions";
import { KIND_LABEL, STATUS_LABEL, type FeedbackKind, type FeedbackStatus } from "@/lib/feedback/rules";
import { NOTE_MAX } from "@/lib/feedback/schema";
import { FeedbackStatusBadge } from "./feedback-status";

export type FeedbackAdminItem = {
  id: string;
  author: string;
  kind: FeedbackKind;
  body: string;
  status: FeedbackStatus;
  adminNote: string | null;
  page: string | null;
  version: string | null;
  userAgent: string | null;
  /** дата в поясе админа — считает сервер */
  when: string;
};

const STATUSES: FeedbackStatus[] = ["NEW", "IN_PROGRESS", "DONE", "REJECTED"];

export function AdminFeedbackCard({ item }: { item: FeedbackAdminItem }) {
  const [status, setStatus] = useState(item.status);
  const [note, setNote] = useState(item.adminNote ?? "");
  const [pending, startTransition] = useTransition();
  const save = () =>
    startTransition(async () => {
      const r = await updateFeedbackAction(item.id, { status, adminNote: note });
      if (!r.ok) return void toast.error(r.error);
      toast.success("Сохранено");
    });

  return (
    <article aria-label={`Обращение от ${item.author}`} className="space-y-3 rounded-xl border bg-card p-4">
      <header className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          <span className="font-medium text-foreground">{item.author}</span> · {KIND_LABEL[item.kind]} · {item.when}
        </span>
        <FeedbackStatusBadge status={item.status} />
      </header>
      <p className="text-sm break-words whitespace-pre-line">{item.body}</p>
      <div className="space-y-0.5 text-xs text-muted-foreground">
        {item.page ? <p>Страница: {item.page}</p> : null}
        {item.version ? <p>Версия: {item.version}</p> : null}
        {item.userAgent ? <p className="break-all">{item.userAgent}</p> : null}
      </div>
      <form
        className="space-y-3 border-t pt-3"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <RadioGroup aria-label="Статус" value={status} onValueChange={(v) => setStatus(v as FeedbackStatus)} className="flex flex-wrap gap-x-4 gap-y-1.5">
          {STATUSES.map((s) => (
            <label key={s} className="flex cursor-pointer items-center gap-2 text-sm">
              <RadioGroupItem value={s} aria-label={STATUS_LABEL[s]} />
              {STATUS_LABEL[s]}
            </label>
          ))}
        </RadioGroup>
        <div className="space-y-1.5">
          <Label htmlFor={`note-${item.id}`}>Заметка (видна только админам)</Label>
          <Textarea id={`note-${item.id}`} rows={2} maxLength={NOTE_MAX} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">«Сделано» и «Отклонено» — автору придёт уведомление.</p>
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : null}
            Сохранить
          </Button>
        </div>
      </form>
    </article>
  );
}
