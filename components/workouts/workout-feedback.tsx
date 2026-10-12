"use client";

import { useState, useTransition } from "react";
import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { rpeLabel } from "@/lib/workouts/feedback";
import { saveWorkoutFeedbackAction } from "@/lib/workouts/feedback-actions";
import { cn } from "@/lib/utils";

const LEVELS = Array.from({ length: 10 }, (_, i) => i + 1);
const NOTE_MAX = 500;

/** «Тяжесть 7 — Тяжело» и заметка — общий вид для клиента и тренера. */
function FeedbackSummary({ rpe, note }: { rpe: number; note: string | null }) {
  return (
    <div className="space-y-1">
      <p className="font-semibold tabular-nums">
        Тяжесть {rpe} — {rpeLabel(rpe)}
      </p>
      {note ? <p className="text-sm whitespace-pre-line text-muted-foreground">{note}</p> : null}
    </div>
  );
}

/** Оценка своей тренировки в сводке: тяжесть 1–10 и заметка; после сохранения — компактно с «Изменить». */
export function WorkoutFeedback({ workoutId, rpe, note }: { workoutId: string; rpe: number | null; note: string | null }) {
  const [saved, setSaved] = useState(rpe === null ? null : { rpe, note });
  const [editing, setEditing] = useState(rpe === null);
  const [value, setValue] = useState<number | null>(rpe);
  const [text, setText] = useState(note ?? "");
  const [pending, startTransition] = useTransition();

  const save = () => {
    if (value === null) return;
    startTransition(async () => {
      let res: Awaited<ReturnType<typeof saveWorkoutFeedbackAction>>;
      try {
        res = await saveWorkoutFeedbackAction(workoutId, { rpe: value, note: text });
      } catch {
        // Нет сети или сервер упал — без падения страницы: введённое остаётся в форме
        toast.error("Не удалось сохранить — проверьте связь");
        return;
      }
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setSaved({ rpe: res.rpe, note: res.note });
      setText(res.note ?? "");
      setEditing(false);
    });
  };

  // Отмена правки: вернуть сохранённое
  const cancel = () => {
    if (!saved) return;
    setValue(saved.rpe);
    setText(saved.note ?? "");
    setEditing(false);
  };

  return (
    <section aria-label="Как прошла тренировка?" className="space-y-3 rounded-xl border bg-card p-4">
      <h2 className="font-bold">Как прошла тренировка?</h2>
      {!editing && saved ? (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <FeedbackSummary rpe={saved.rpe} note={saved.note} />
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            Изменить
          </Button>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            <RadioGroup
              aria-label="Тяжесть"
              value={value}
              onValueChange={(v) => setValue(v as number)}
              className="grid grid-cols-5 gap-2 sm:grid-cols-10"
            >
              {LEVELS.map((n) => (
                <Radio.Root
                  key={n}
                  value={n}
                  aria-label={`Тяжесть ${n}`}
                  className={cn(
                    "flex h-10 items-center justify-center rounded-lg border text-sm font-semibold tabular-nums transition-colors outline-none",
                    "hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
                    "data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground",
                  )}
                >
                  {n}
                </Radio.Root>
              ))}
            </RadioGroup>
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {value === null ? "1 — очень легко, 10 — на пределе" : rpeLabel(value)}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`feedback-note-${workoutId}`}>Заметка</Label>
            <Textarea
              id={`feedback-note-${workoutId}`}
              value={text}
              maxLength={NOTE_MAX}
              rows={3}
              placeholder="Например, болела спина или плохо спал"
              onChange={(e) => setText(e.target.value)}
            />
            <p className="text-right text-xs text-muted-foreground tabular-nums">
              {text.length}/{NOTE_MAX}
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={save} disabled={value === null || pending}>
              Сохранить
            </Button>
            {saved ? (
              <Button variant="ghost" onClick={cancel} disabled={pending}>
                Отмена
              </Button>
            ) : null}
          </div>
        </>
      )}
    </section>
  );
}

const WELLBEING_LABEL = { GREAT: "отлично", OK: "нормально", TIRED: "устал" } as const;

/** Оценка клиента глазами тренера (только чтение): самочувствие из чек-ина и тяжесть; без них — ничего. */
export function CoachFeedbackNote({
  rpe,
  note,
  wellbeing = null,
}: {
  rpe: number | null;
  note: string | null;
  wellbeing?: keyof typeof WELLBEING_LABEL | null;
}) {
  if (rpe === null && wellbeing === null) return null;
  return (
    <section aria-label="Оценка клиента" className="space-y-2 rounded-xl border bg-card p-4">
      <h2 className="font-bold">Оценка клиента</h2>
      {wellbeing ? <p className="text-sm">Самочувствие: {WELLBEING_LABEL[wellbeing]}</p> : null}
      {rpe !== null ? <FeedbackSummary rpe={rpe} note={note} /> : null}
    </section>
  );
}
