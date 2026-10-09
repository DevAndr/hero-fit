"use client";

import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { plural } from "@/lib/format";
import type { OnboardingProgram } from "@/lib/onboarding/queries";
import { createWorkoutAction } from "@/lib/workouts/actions";

const CAPTIONS: Record<string, string> = {
  "Full Body": "Для старта",
  Push: "Первый день Push/Pull/Legs",
  "5×5 — день A": "Силовая классика",
};

function ProgramButton({ program, featured }: { program: OnboardingProgram; featured: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex w-full items-center justify-between gap-3 rounded-xl border bg-background p-3 text-left transition-colors hover:border-primary/60 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-60 data-[featured=true]:border-primary/50"
      data-featured={featured}
    >
      <span>
        <span className="block font-bold">{program.name}</span>
        <span className="block text-xs text-muted-foreground">
          {featured ? null : `${CAPTIONS[program.name]} · `}
          {program.exercises} {plural(program.exercises, "упражнение", "упражнения", "упражнений")}
        </span>
      </span>
      {pending ? (
        <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
      ) : featured ? (
        <span className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary">Для старта</span>
      ) : null}
    </button>
  );
}

/** Финал экскурсии: готовая программа — тренировка открывается сразу (createWorkoutAction ставит отметку экскурсии). */
export function FirstWorkout({
  programs,
  disabled,
  onSelf,
  onLater,
}: {
  programs: OnboardingProgram[];
  /** Экскурсия закрывается — кнопки неактивны. */
  disabled: boolean;
  onSelf: () => void;
  onLater: () => void;
}) {
  return (
    <div className="space-y-3">
      {programs.length ? (
        <ul className="space-y-2">
          {programs.map((p, i) => (
            <li key={p.id}>
              <form action={createWorkoutAction}>
                <input type="hidden" name="source" value={`template:${p.id}`} />
                <input type="hidden" name="onboarding" value="1" />
                <ProgramButton program={p} featured={i === 0 && p.name === "Full Body"} />
              </form>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex flex-wrap justify-between gap-2">
        <Button type="button" variant="outline" disabled={disabled} onClick={onSelf}>
          Соберу сам
        </Button>
        <Button type="button" variant="ghost" disabled={disabled} onClick={onLater}>
          Не сейчас
        </Button>
      </div>
    </div>
  );
}
