"use client";

import { useId, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { saveCoachNoteAction } from "@/lib/coach/note-actions";
import { NOTE_MAX } from "@/lib/coach/notes";

/** Личная заметка тренера о клиенте во вкладке «Обзор»: видит только тренер. */
export function CoachNote({ clientId, initialText, initialUpdatedAt, timeZone }: { clientId: string; initialText: string; initialUpdatedAt: string | null; timeZone: string }) {
  const id = useId();
  const [text, setText] = useState(initialText);
  const [saved, setSaved] = useState(initialText);
  const [updatedAt, setUpdatedAt] = useState(initialUpdatedAt);
  const [pending, startTransition] = useTransition();
  const dirty = text.trim() !== saved;

  const save = () =>
    startTransition(async () => {
      const result = await saveCoachNoteAction(clientId, text);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const clean = text.trim();
      setText(clean);
      setSaved(clean);
      setUpdatedAt(result.updatedAt);
      toast.success(clean ? "Заметка сохранена" : "Заметка удалена");
    });

  return (
    <section aria-label="Заметки" className="space-y-2 rounded-xl border bg-card p-4">
      <label htmlFor={id} className="font-bold">
        Заметки
      </label>
      <Textarea
        id={id}
        value={text}
        maxLength={NOTE_MAX}
        rows={4}
        readOnly={pending}
        onChange={(e) => setText(e.target.value)}
        placeholder="Цели, травмы со слов клиента, инвентарь, договорённости — видите только вы"
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {updatedAt ? `Изменено ${new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", timeZone }).format(new Date(updatedAt))} · ` : ""}
          Клиент может получить заметку в выгрузке своих данных
        </p>
        <Button type="button" size="sm" disabled={!dirty || pending} onClick={save}>
          {pending ? <Loader2 className="animate-spin" /> : null}
          Сохранить
        </Button>
      </div>
    </section>
  );
}
