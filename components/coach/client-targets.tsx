"use client";

import { useState, useTransition } from "react";
import { Dumbbell, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { saveTargetsAction } from "@/lib/coach/target-actions";
import { parseTargetInput } from "@/lib/coach/targets";
import type { ClientTemplateTargets } from "@/lib/coach/target-queries";
import { plural } from "@/lib/format";

type Row = { sets: string; reps: string; weight: string; step: string };

const str = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n).replace(".", ","));
const num = (n: number) => n.toLocaleString("ru-RU", { maximumFractionDigits: 2 });

/** Вкладка «План»: задания клиенту по назначенным шаблонам тренера. */
export function ClientTargets({ clientId, timeZone, templates }: { clientId: string; timeZone: string; templates: ClientTemplateTargets[] }) {
  const [open, setOpen] = useState<ClientTemplateTargets | null>(null);
  if (!templates.length) return null;
  return (
    <section aria-label="Задания по шаблонам" className="space-y-2 rounded-xl border bg-card p-4">
      <h2 className="font-bold">Задания по шаблонам</h2>
      <p className="text-sm text-muted-foreground">Подходы, повторы и вес для клиента — подставятся при запуске шаблона.</p>
      <ul className="divide-y divide-border/60">
        {templates.map((t) => {
          const set = t.exercises.filter((e) => e.target).length;
          const progressing = t.exercises.filter((e) => e.target?.step && e.target.weight !== null).length;
          return (
            <li key={t.templateId} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="text-sm">
                <span className="font-semibold">{t.name}</span>
                {" · "}
                <span className="text-muted-foreground">
                  {set ? `задано ${set} из ${t.exercises.length} ${plural(t.exercises.length, "упражнения", "упражнений", "упражнений")}` : "заданий нет"}
                  {progressing ? ` · прогрессия у ${progressing}` : null}
                </span>
              </span>
              <Button size="sm" variant="outline" onClick={() => setOpen(t)} aria-label={`Задания: ${t.name}`}>
                <Dumbbell />
                Задания
              </Button>
            </li>
          );
        })}
      </ul>
      <Dialog open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="sm:max-w-lg">
          {open ? <TargetsForm key={open.templateId} clientId={clientId} timeZone={timeZone} template={open} onDone={() => setOpen(null)} /> : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}

function TargetsForm({
  clientId,
  timeZone,
  template,
  onDone,
}: {
  clientId: string;
  timeZone: string;
  template: ClientTemplateTargets;
  onDone: () => void;
}) {
  // Исходные строки — чтобы отправить только изменённые: пока диалог открыт, прогрессия могла сдвинуть вес
  const [initial] = useState<Record<string, Row>>(() =>
    Object.fromEntries(template.exercises.map((e) => [e.exerciseId, { sets: str(e.target?.sets), reps: str(e.target?.reps), weight: str(e.target?.weight), step: str(e.target?.step) }])),
  );
  const [rows, setRows] = useState(initial);
  const [pending, startTransition] = useTransition();
  const day = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", timeZone });
  const update = (id: string, patch: Partial<Row>) => setRows((r) => ({ ...r, [id]: { ...r[id], ...patch } }));

  const save = () =>
    startTransition(async () => {
      const changed = template.exercises.filter((e) => {
        const r = rows[e.exerciseId];
        const o = initial[e.exerciseId];
        return r.sets !== o.sets || r.reps !== o.reps || r.weight !== o.weight || r.step !== o.step;
      });
      if (!changed.length) {
        onDone();
        return;
      }
      const items = changed.map((e) => {
        const r = rows[e.exerciseId];
        return {
          exerciseId: e.exerciseId,
          sets: parseTargetInput(r.sets, { int: true }),
          reps: parseTargetInput(r.reps, { int: true }),
          weight: parseTargetInput(r.weight),
          step: parseTargetInput(r.step),
        };
      });
      const bad = changed.find((_, i) => [items[i].sets, items[i].reps, items[i].weight, items[i].step].some((n) => Number.isNaN(n)));
      if (bad) {
        toast.error(`Проверьте числа: «${bad.name}»`);
        return;
      }
      const result = await saveTargetsAction(clientId, template.templateId, items);
      if (result.ok) onDone();
      else toast.error(result.error);
    });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <DialogHeader>
        <DialogTitle>{`Задания: ${template.name}`}</DialogTitle>
      </DialogHeader>
      <p className="mt-2 text-sm text-muted-foreground">Пустое поле — как без задания (подсказка серым).</p>
      <ul className="mt-4 max-h-[60vh] space-y-4 overflow-y-auto">
        {template.exercises.map((e) => {
          const r = rows[e.exerciseId];
          const first = e.last?.sets[0];
          return (
            <li key={e.exerciseId}>
              <p className="text-sm font-semibold">{e.name}</p>
              <div className="mt-1.5 grid grid-cols-4 gap-2">
                <Field label="Подходы" exercise={e.name} value={r.sets} placeholder={String(e.template.sets)} onChange={(v) => update(e.exerciseId, { sets: v })} />
                <Field
                  label="Повторы"
                  exercise={e.name}
                  value={r.reps}
                  placeholder={str(e.template.reps ?? first?.reps) || "—"}
                  onChange={(v) => update(e.exerciseId, { reps: v })}
                />
                {/* Своим весом — отягощение, как «доп. кг» в редакторе тренировки */}
                <Field
                  label={e.isBodyweight ? "Доп. кг" : "Вес, кг"}
                  exercise={e.name}
                  decimal
                  value={r.weight}
                  placeholder={str(first?.weight ?? e.template.weight) || (e.isBodyweight ? "0" : "—")}
                  onChange={(v) => update(e.exerciseId, { weight: v })}
                />
                <Field label="Шаг, кг" exercise={e.name} decimal value={r.step} placeholder="—" onChange={(v) => update(e.exerciseId, { step: v })} />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {e.last && first
                  ? `в прошлый раз: ${first.weight ? `${num(first.weight)} × ${first.reps}` : `${first.reps} ${plural(first.reps, "повтор", "повтора", "повторов")}`} · ${e.last.sets.length} ${plural(e.last.sets.length, "подход", "подхода", "подходов")}${e.last.date ? `, ${day.format(new Date(e.last.date))}` : ""}`
                  : "ещё не выполнялось"}
              </p>
              {e.target?.step && e.target.weight !== null ? (
                <p className="text-xs text-primary">
                  {`прогрессия: +${num(e.target.step)} кг за успешную тренировку · неудач подряд: ${e.target.fails}`}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
      <DialogFooter className="mt-4">
        <Button type="button" variant="outline" disabled={pending} onClick={onDone}>
          Отмена
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : null}
          Сохранить
        </Button>
      </DialogFooter>
    </form>
  );
}

function Field({
  label,
  exercise,
  value,
  placeholder,
  onChange,
  decimal,
}: {
  label: string;
  exercise: string;
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
  decimal?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-muted-foreground">
      <span aria-hidden>{label}</span>
      <Input
        aria-label={`${label}: ${exercise}`}
        inputMode={decimal ? "decimal" : "numeric"}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 text-center text-sm tabular-nums"
      />
    </label>
  );
}
