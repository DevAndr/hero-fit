"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { selectOnFocus } from "@/components/ui/select-on-focus";
import { endProgramAction, updateBasesAction } from "@/lib/coach/program-actions";

export type ProgramRow = { templateId: string; exerciseId: string; name: string; templateName: string; now: number; final: number };

const kg = (n: number) => (n > 0 ? `${n.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} кг` : "свой вес");
const num = (v: string) => Number(v.replace(",", ".")) || 0;

/** Блок «Программа» во вкладке «План»: неделя, ближайшая разгрузка, веса недели и финала, «Изменить базу», «Завершить досрочно». */
export function ProgramProgress({
  clientId,
  name,
  status,
  rows,
}: {
  clientId: string;
  name: string;
  /** «Неделя 3 из 8 · разгрузка — неделя 4» */
  status: string;
  rows: ProgramRow[];
}) {
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<string[]>([]);

  const end = () =>
    startTransition(async () => {
      const result = await endProgramAction(clientId);
      if (result.ok) toast.success("Программа завершена");
      else toast.error(result.error);
    });
  const openEdit = () => {
    setValues(rows.map((r) => String(r.now).replace(".", ",")));
    setEditing(true);
  };
  const saveBases = () =>
    startTransition(async () => {
      // Только изменённые: у остальных рост продолжается без пересчёта
      const changed = rows.flatMap((r, i) => (num(values[i] ?? "") === r.now ? [] : [{ templateId: r.templateId, exerciseId: r.exerciseId, weight: num(values[i] ?? "") }]));
      const result = changed.length ? await updateBasesAction(clientId, changed) : ({ ok: true } as const);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("База изменена");
      setEditing(false);
    });

  return (
    <section aria-label="Программа" className="space-y-3 rounded-xl border bg-card p-4">
      <div>
        <h2 className="font-bold">Программа «{name}»</h2>
        <p className="text-sm text-muted-foreground">{status}</p>
      </div>
      {rows.length ? (
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr>
              <th className="font-normal">Упражнение</th>
              <th className="font-normal">Эта неделя</th>
              <th className="font-normal">Финал</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {rows.map((r) => (
              <tr key={`${r.templateId}:${r.exerciseId}`}>
                <td className="py-0.5">{r.name}</td>
                <td>{kg(r.now)}</td>
                <td>{kg(r.final)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {rows.length ? (
          <Button type="button" variant="outline" size="sm" disabled={pending} onClick={openEdit}>
            Изменить базу
          </Button>
        ) : null}
        <Button type="button" variant="outline" size="sm" disabled={pending} onClick={end}>
          {pending && !editing ? <Loader2 className="animate-spin" /> : null}
          Завершить досрочно
        </Button>
      </div>
      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Изменить базу</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Вес этой недели; дальше рост по правилу программы от него.</p>
          <ul className="space-y-2">
            {rows.map((r, i) => (
              <li key={`${r.templateId}:${r.exerciseId}`} className="grid grid-cols-[1fr_5.5rem] items-center gap-2">
                <span className="truncate text-sm">
                  {r.name} <span className="text-muted-foreground">· {r.templateName}</span>
                </span>
                <Input
                  {...selectOnFocus}
                  inputMode="decimal"
                  aria-label={`Вес этой недели, ${r.name} (${r.templateName})`}
                  value={values[i] ?? ""}
                  onChange={(e) => setValues((prev) => prev.map((v, j) => (j === i ? e.target.value : v)))}
                  className="text-center tabular-nums"
                />
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button type="button" disabled={pending} onClick={saveBases}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
