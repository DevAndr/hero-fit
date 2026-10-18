"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { submitFeedbackAction } from "@/lib/feedback/actions";
import { KIND_LABEL, type FeedbackKind } from "@/lib/feedback/rules";
import { BODY_MAX } from "@/lib/feedback/schema";

const KINDS: FeedbackKind[] = ["BUG", "IDEA", "OTHER"];

/** Форма обращения; page — откуда открыли (?from=, сервер оставит только свой путь). */
export function FeedbackForm({ page }: { page?: string }) {
  const [kind, setKind] = useState<FeedbackKind>("IDEA");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // Двойной клик: второе нажатие приходит раньше, чем кнопка станет disabled
  const busy = useRef(false);

  const submit = () => {
    if (busy.current) return;
    busy.current = true;
    startTransition(async () => {
      try {
        const r = await submitFeedbackAction({ kind, body, page });
        if (!r.ok) return void setError(r.error);
        setError(null);
        setBody("");
        toast.success("Спасибо! Обращение отправлено");
      } finally {
        busy.current = false;
      }
    });
  };

  return (
    <form
      aria-label="Новое обращение"
      className="space-y-4 rounded-xl border bg-card p-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <RadioGroup aria-label="Тип" value={kind} onValueChange={(v) => setKind(v as FeedbackKind)} className="flex flex-wrap gap-x-4 gap-y-1.5">
        {KINDS.map((k) => (
          <label key={k} className="flex cursor-pointer items-center gap-2 text-sm">
            <RadioGroupItem value={k} aria-label={KIND_LABEL[k]} />
            {KIND_LABEL[k]}
          </label>
        ))}
      </RadioGroup>
      <div className="space-y-1.5">
        <div className="flex justify-between">
          <Label htmlFor="feedback-body">Сообщение</Label>
          <span className="text-xs text-muted-foreground">
            {body.length}/{BODY_MAX}
          </span>
        </div>
        <Textarea
          id="feedback-body"
          rows={5}
          maxLength={BODY_MAX}
          placeholder={kind === "BUG" ? "Что произошло и что вы ожидали увидеть?" : "Что хотелось бы улучшить или добавить?"}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <Send />}
          Отправить
        </Button>
      </div>
    </form>
  );
}
