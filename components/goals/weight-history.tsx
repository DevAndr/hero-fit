"use client";

import { useState, useTransition } from "react";
import { ChevronDown, Loader2 } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { selectOnFocus } from "@/components/ui/select-on-focus";
import { deleteBodyWeightAction, editBodyWeightAction } from "@/lib/goals/actions";
import { cn } from "@/lib/utils";

type Entry = { date: string; weight: number };

const dayMonth = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", timeZone: "UTC" });
const toDate = (day: string) => new Date(`${day}T12:00:00Z`);
const kg = (n: number) => `${String(n).replace(".", ",")} кг`;

function Row({ entry, only }: { entry: Entry; only: boolean }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();

  const save = () =>
    start(async () => {
      const weight = Number(value.trim().replace(",", "."));
      if (!value.trim() || !Number.isFinite(weight)) return void toast.error("Укажите вес от 30 до 300 кг");
      try {
        const r = await editBodyWeightAction(entry.date, weight);
        if (!r.ok) return void toast.error(r.error);
        setEditing(false);
        toast.success("Вес исправлен");
      } catch {
        toast.error("Не удалось сохранить — проверьте связь");
      }
    });

  const remove = () =>
    start(async () => {
      try {
        const r = await deleteBodyWeightAction(entry.date);
        if (!r.ok) return void toast.error(r.error);
        setConfirm(false);
        toast.success("Запись удалена");
      } catch {
        toast.error("Не удалось удалить — проверьте связь");
      }
    });

  return (
    <li className="flex flex-wrap items-center gap-2 border-b py-2 last:border-0">
      <span className="w-16 text-sm text-muted-foreground">{dayMonth.format(toDate(entry.date))}</span>
      {editing ? (
        <form
          className="flex flex-1 flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <Input aria-label="Вес, кг" inputMode="decimal" className="h-8 max-w-24" value={value} onChange={(e) => setValue(e.target.value)} autoFocus {...selectOnFocus} />
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : null}
            Сохранить
          </Button>
          <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setEditing(false)}>
            Отмена
          </Button>
        </form>
      ) : (
        <>
          <span className="flex-1 font-semibold tabular-nums">{kg(entry.weight)}</span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setValue(String(entry.weight).replace(".", ","));
              setEditing(true);
            }}
          >
            Изменить
          </Button>
          <Button size="sm" variant="ghost" disabled={only} title={only ? "Единственную запись можно исправить, но не удалить" : undefined} onClick={() => setConfirm(true)}>
            Удалить
          </Button>
        </>
      )}
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить взвешивание?</AlertDialogTitle>
            <AlertDialogDescription>
              {dayMonth.format(toDate(entry.date))}, {kg(entry.weight)}. Текущим весом станет последняя оставшаяся запись.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Отмена</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={pending} onClick={remove}>
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}

/** Взвешивания за 90 дней списком (новые сверху): исправить или удалить запись. */
export function WeightHistory({ weights }: { weights: Entry[] }) {
  const [open, setOpen] = useState(false);
  if (!weights.length) return null;
  return (
    <div>
      <Button variant="ghost" size="sm" className="-ml-2" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        Все взвешивания ({weights.length})
        <ChevronDown className={cn("transition-transform", open && "rotate-180")} />
      </Button>
      {open ? (
        <ul aria-label="Взвешивания" className="mt-1">
          {[...weights].reverse().map((w) => (
            <Row key={w.date} entry={w} only={weights.length === 1} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}
