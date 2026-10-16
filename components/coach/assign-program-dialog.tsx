"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { selectOnFocus } from "@/components/ui/select-on-focus";
import { programPreview, type ProgramRule } from "@/lib/coach/program";
import { assignProgramAction, getProgramBasesAction } from "@/lib/coach/program-actions";
import { addDays, weekdayOf } from "@/lib/dates";

type Program = { id: string; name: string; rule: ProgramRule };
type Base = { templateId: string; templateName: string; exerciseId: string; exerciseName: string; weight: string };

const fmtDay = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", timeZone: "UTC" });
const dayLabel = (d: string) => fmtDay.format(new Date(`${d}T12:00:00Z`));
const num = (v: string) => Number(v.replace(",", ".")) || 0;
const kg = (n: number) => `${n.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} кг`;

/** «Назначить программу»: шаг 1 — программа и понедельник старта, шаг 2 — базовые веса. */
export function AssignProgramButton({ clientId, programs, today, activeName }: { clientId: string; programs: Program[]; today: string; activeName: string | null }) {
  const thisMonday = addDays(today, -weekdayOf(today));
  const nextMonday = addDays(thisMonday, 7);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [programId, setProgramId] = useState(programs[0]?.id ?? "");
  const [startDate, setStartDate] = useState(nextMonday);
  const [bases, setBases] = useState<Base[]>([]);
  const [pending, startTransition] = useTransition();
  const program = programs.find((p) => p.id === programId);

  const next = () =>
    startTransition(async () => {
      const result = await getProgramBasesAction(clientId, programId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setBases(result.bases.map((b) => ({ ...b, weight: b.weight ? String(b.weight).replace(".", ",") : "0" })));
      setStep(2);
    });
  const assign = () =>
    startTransition(async () => {
      const result = await assignProgramAction(clientId, {
        programId,
        startDate,
        bases: bases.map((b) => ({ templateId: b.templateId, exerciseId: b.exerciseId, weight: num(b.weight) })),
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Программа назначена");
      setOpen(false);
      setStep(1);
    });

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        Назначить программу
      </Button>
      <Dialog open={open} onOpenChange={(v) => (setOpen(v), v || setStep(1))}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Назначить программу</DialogTitle>
          </DialogHeader>
          {programs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Сначала создайте программу в разделе «Программы».</p>
          ) : step === 1 ? (
            <>
              <div className="grid gap-1.5">
                <Label htmlFor="program-pick">Программа</Label>
                <Select items={programs.map((p) => ({ value: p.id, label: p.name }))} value={programId || null} onValueChange={(v: string | null) => setProgramId(v ?? "")}>
                  <SelectTrigger id="program-pick" aria-label="Программа" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {programs.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="program-start">Старт</Label>
                <Select
                  items={[
                    { value: thisMonday, label: `с этой недели (${dayLabel(thisMonday)})` },
                    { value: nextMonday, label: `со следующей (${dayLabel(nextMonday)})` },
                  ]}
                  value={startDate}
                  onValueChange={(v: string | null) => v && setStartDate(v)}
                >
                  <SelectTrigger id="program-start" aria-label="Старт" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={thisMonday}>с этой недели ({dayLabel(thisMonday)})</SelectItem>
                    <SelectItem value={nextMonday}>со следующей ({dayLabel(nextMonday)})</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {activeName ? <p className="text-sm text-streak">Текущая программа «{activeName}» завершится</p> : null}
              <DialogFooter>
                <Button type="button" disabled={!program || pending} onClick={next}>
                  {pending ? <Loader2 className="animate-spin" /> : null}
                  Дальше
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">Базовый вес — с него начнётся неделя 1. Своим весом — 0.</p>
              {bases.length === 0 ? <p className="text-sm text-muted-foreground">В шаблонах программы нет силовых упражнений.</p> : null}
              <ul className="space-y-2">
                {bases.map((b, i) => {
                  const final = program ? programPreview(program.rule, { weight: num(b.weight), fromWeek: 1 }).at(-1)?.weight ?? 0 : 0;
                  return (
                    <li key={`${b.templateId}:${b.exerciseId}`} className="grid grid-cols-[1fr_5.5rem] items-center gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{b.exerciseName}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {b.templateName}
                          {num(b.weight) > 0 ? ` · финал ${kg(final)}` : ""}
                        </p>
                      </div>
                      <Input
                        {...selectOnFocus}
                        inputMode="decimal"
                        aria-label={`База, ${b.exerciseName} (${b.templateName})`}
                        value={b.weight}
                        onChange={(e) => setBases((prev) => prev.map((x, j) => (j === i ? { ...x, weight: e.target.value } : x)))}
                        className="text-center tabular-nums"
                      />
                    </li>
                  );
                })}
              </ul>
              <DialogFooter>
                <Button type="button" variant="ghost" disabled={pending} onClick={() => setStep(1)}>
                  Назад
                </Button>
                <Button type="button" disabled={pending} onClick={assign}>
                  {pending ? <Loader2 className="animate-spin" /> : null}
                  Назначить
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
