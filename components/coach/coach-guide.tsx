"use client";

import { useTransition } from "react";
import Link from "next/link";
import { CheckCircle2, Circle, Lock, X } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import type { coachGuide } from "@/lib/coach/guide";
import { setCoachGuideHiddenAction } from "@/lib/coach/guide-actions";
import { cn } from "@/lib/utils";

type Guide = ReturnType<typeof coachGuide>;

/** «Первые шаги тренера»: прогресс и ссылка «Сделать» у каждого невыполненного шага. */
export function CoachGuide({ guide }: { guide: Guide }) {
  const [pending, startTransition] = useTransition();
  return (
    <section aria-label="Первые шаги" className="space-y-3 rounded-xl border border-primary/30 bg-card p-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="font-bold">
            Первые шаги · {guide.done} из {guide.total}
          </h2>
          <div
            role="progressbar"
            aria-label="Первые шаги выполнены"
            aria-valuemin={0}
            aria-valuemax={guide.total}
            aria-valuenow={guide.done}
            className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"
          >
            <div className="h-full rounded-full bg-primary" style={{ width: `${(guide.done / guide.total) * 100}%` }} />
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Скрыть первые шаги"
          disabled={pending}
          onClick={() => startTransition(() => setCoachGuideHiddenAction(true))}
        >
          <X />
        </Button>
      </div>
      <ol className="space-y-2">
        {guide.steps.map((s) => (
          <li key={s.key} aria-label={s.title} className="flex items-start gap-3">
            {s.done ? (
              <CheckCircle2 aria-label="Сделано" className="mt-0.5 size-5 shrink-0 text-primary" />
            ) : s.locked ? (
              <Lock aria-hidden className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
            ) : (
              <Circle aria-hidden className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
            )}
            <div className="min-w-0 flex-1">
              <p className={cn("text-sm font-medium", s.done && "text-muted-foreground line-through")}>{s.title}</p>
              {s.done ? null : <p className="text-xs text-muted-foreground">{s.locked ?? s.hint}</p>}
            </div>
            {s.href ? (
              <Link href={s.href} className={buttonVariants({ variant: "outline", size: "sm" })}>
                Сделать
              </Link>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Вернуть скрытые «Первые шаги». */
export function ShowCoachGuide() {
  const [pending, startTransition] = useTransition();
  return (
    <Button variant="link" size="sm" disabled={pending} onClick={() => startTransition(() => setCoachGuideHiddenAction(false))}>
      Первые шаги
    </Button>
  );
}
