import { MessageSquareText } from "lucide-react";
import type { CommentView } from "@/lib/coach/comments-queries";

/** Клиенту: заметка тренера в блоке упражнения. */
export function CoachExerciseNote({ comment }: { comment: CommentView }) {
  return (
    <p className="mt-3 flex gap-2 rounded-lg bg-primary/10 p-3 text-sm">
      <MessageSquareText className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
      <span className="whitespace-pre-line">{`Тренер: ${comment.text}`}</span>
    </p>
  );
}

/** Общий блок «Комментарий тренера» под сводкой: children — текст (клиенту) или редактор (тренеру). */
export function CoachCommentSection({ children, caption }: { children: React.ReactNode; caption?: string }) {
  return (
    <section aria-label="Комментарий тренера" className="mt-6 rounded-xl border border-primary/40 bg-primary/5 p-4">
      <h2 className="flex items-center gap-2 font-bold">
        <MessageSquareText className="size-4 text-primary" aria-hidden />
        {caption ?? "Комментарий тренера"}
      </h2>
      {children}
    </section>
  );
}
