"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Play } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { selectOnFocus } from "@/components/ui/select-on-focus";
import { getCatalogBasesAction, startCatalogProgramAction } from "@/lib/catalog/actions";
import { NEEDS_REPLACE, PROGRAM_UNAVAILABLE } from "@/lib/catalog/rules";
import { programPreview, type ProgramRule } from "@/lib/coach/program";
import { addDays, weekdayOf } from "@/lib/dates";

type Base = { templateId: string; templateName: string; exerciseId: string; name: string; weight: string };

const fmtDay = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", timeZone: "UTC" });
const dayLabel = (d: string) => fmtDay.format(new Date(`${d}T12:00:00Z`));
const num = (v: string) => Number(v.replace(",", ".")) || 0;
const kg = (n: number) => `${n.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} кг`;

/**
 * «Начать программу» из каталога: шаг 1 — понедельник старта, шаг 2 — базовые веса. Идёт своя/каталожная
 * программа — подтверждение «Заменить программу «…»?»; от тренера — кнопка недоступна (blocked).
 */
export function StartProgramButton({
  programId,
  rule,
  today,
  activeName,
  blocked,
}: {
  programId: string;
  rule: ProgramRule;
  today: string;
  /** Идущая своя/каталожная программа — её заменит запуск. */
  activeName: string | null;
  /** Пояснение, почему запустить нельзя (идёт программа от тренера). */
  blocked: string | null;
}) {
  const router = useRouter();
  const thisMonday = addDays(today, -weekdayOf(today));
  const nextMonday = addDays(thisMonday, 7);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [startDate, setStartDate] = useState(nextMonday);
  const [bases, setBases] = useState<Base[]>([]);
  const [confirm, setConfirm] = useState(false);
  const [pending, startTransition] = useTransition();

  const next = () =>
    startTransition(async () => {
      const result = await getCatalogBasesAction(programId);
      if (!result) {
        toast.error(PROGRAM_UNAVAILABLE);
        return;
      }
      setBases(result.map((b) => ({ ...b, weight: b.weight ? String(b.weight).replace(".", ",") : "0" })));
      setStep(2);
    });
  const start = (replace: boolean) =>
    startTransition(async () => {
      const result = await startCatalogProgramAction(programId, {
        startDate,
        replace,
        bases: bases.map((b) => ({ templateId: b.templateId, exerciseId: b.exerciseId, weight: num(b.weight) })),
      });
      if (!result.ok) {
        if (result.error === NEEDS_REPLACE) {
          setOpen(false);
          setConfirm(true);
        } else toast.error(result.error);
        return;
      }
      toast.success("Программа начата");
      setOpen(false);
      setConfirm(false);
      setStep(1);
      router.push(`/calendar?date=${startDate}`);
    });

  return (
    <>
      <div className="space-y-1">
        <Button type="button" disabled={blocked !== null} onClick={() => setOpen(true)}>
          <Play />
          Начать программу
        </Button>
        {blocked ? <p className="text-sm text-muted-foreground">{blocked}</p> : null}
      </div>
      <Dialog open={open} onOpenChange={(v) => (setOpen(v), v || setStep(1))}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Начать программу</DialogTitle>
          </DialogHeader>
          {step === 1 ? (
            <>
              <div className="grid gap-1.5">
                <Label htmlFor="catalog-start">Старт</Label>
                <Select
                  items={[
                    { value: thisMonday, label: `с этой недели (${dayLabel(thisMonday)})` },
                    { value: nextMonday, label: `со следующей (${dayLabel(nextMonday)})` },
                  ]}
                  value={startDate}
                  onValueChange={(v: string | null) => v && setStartDate(v)}
                >
                  <SelectTrigger id="catalog-start" aria-label="Старт" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={thisMonday}>с этой недели ({dayLabel(thisMonday)})</SelectItem>
                    <SelectItem value={nextMonday}>со следующей ({dayLabel(nextMonday)})</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <p className="text-sm text-muted-foreground">Тренировки программы появятся в календаре, шаблоны дней — в ваших шаблонах.</p>
              <DialogFooter>
                <Button type="button" disabled={pending} onClick={next}>
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
                  const final = programPreview(rule, { weight: num(b.weight), fromWeek: 1 }).at(-1)?.weight ?? 0;
                  return (
                    <li key={`${b.templateId}:${b.exerciseId}`} className="grid grid-cols-[1fr_5.5rem] items-center gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{b.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {b.templateName}
                          {num(b.weight) > 0 ? ` · финал ${kg(final)}` : ""}
                        </p>
                      </div>
                      <Input
                        {...selectOnFocus}
                        inputMode="decimal"
                        aria-label={`База, ${b.name} (${b.templateName})`}
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
                <Button type="button" disabled={pending} onClick={() => start(false)}>
                  {pending ? <Loader2 className="animate-spin" /> : null}
                  Начать
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{activeName ? `Заменить программу «${activeName}»?` : "Заменить текущую программу?"}</AlertDialogTitle>
            <AlertDialogDescription>Текущая программа завершится: будущие тренировки уйдут из календаря, прошедшие останутся.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Отмена</AlertDialogCancel>
            <AlertDialogAction disabled={pending} onClick={() => start(true)}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              Заменить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
