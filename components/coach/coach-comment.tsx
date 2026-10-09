"use client";

import { useState, useTransition } from "react";
import { Loader2, MessageSquarePlus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { deleteCoachCommentAction, saveCoachCommentAction } from "@/lib/coach/comment-actions";
import { COMMENT_MAX } from "@/lib/coach/comments";

type Comment = { id: string; text: string } | null;

/**
 * Редактор тренера: общий комментарий (exercise = null) или заметка к упражнению.
 * Заметка свёрнута под кнопкой «Заметка», общий комментарий — сразу поле.
 */
export function CoachCommentEditor({
  clientId,
  workoutId,
  workoutExerciseId,
  exerciseName,
  comment,
}: {
  clientId: string;
  workoutId: string;
  workoutExerciseId: string | null;
  /** Название упражнения — для подписей заметки; null — общий комментарий. */
  exerciseName: string | null;
  comment: Comment;
}) {
  const note = exerciseName !== null;
  const [editing, setEditing] = useState(!note && !comment);
  const [text, setText] = useState(comment?.text ?? "");
  const [pending, startTransition] = useTransition();
  const label = note ? `Заметка к «${exerciseName}»` : "Комментарий тренера";
  const what = note ? "заметку" : "комментарий";

  const save = () =>
    startTransition(async () => {
      const result = await saveCoachCommentAction(clientId, workoutId, workoutExerciseId, text);
      if (result.ok) setEditing(false);
      else toast.error(result.error);
    });
  const remove = () =>
    startTransition(async () => {
      if (!comment) return;
      const result = await deleteCoachCommentAction(clientId, comment.id);
      if (result.ok) {
        setText("");
        setEditing(!note);
      } else toast.error(result.error);
    });

  if (editing) {
    const id = `comment-${workoutExerciseId ?? "general"}`;
    return (
      <form
        className="mt-3 grid gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Label htmlFor={id} className={note ? "sr-only" : undefined}>
          {label}
        </Label>
        <Textarea id={id} value={text} maxLength={COMMENT_MAX} rows={note ? 2 : 3} onChange={(e) => setText(e.target.value)} placeholder={note ? "Техника, вес, на что обратить внимание" : "Как прошла тренировка, что дальше"} />
        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={pending || !text.trim()} aria-label={note ? "Сохранить заметку" : undefined}>
            {pending ? <Loader2 className="animate-spin" /> : null}
            Сохранить
          </Button>
          {note || comment ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => {
                setText(comment?.text ?? "");
                setEditing(false);
              }}
            >
              Отмена
            </Button>
          ) : null}
        </div>
      </form>
    );
  }

  if (!comment) {
    return (
      <Button type="button" size="sm" variant="ghost" className="mt-2" onClick={() => setEditing(true)} aria-label={label}>
        <MessageSquarePlus />
        Заметка
      </Button>
    );
  }

  return (
    <div className="mt-3 rounded-lg bg-muted/60 p-3 text-sm">
      <p className="whitespace-pre-line">{comment.text}</p>
      <div className="mt-2 flex gap-1">
        <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setEditing(true)} aria-label={`Изменить ${what}`}>
          <Pencil />
          Изменить
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={remove} aria-label={`Удалить ${what}`}>
          <Trash2 />
          Удалить
        </Button>
      </div>
    </div>
  );
}
