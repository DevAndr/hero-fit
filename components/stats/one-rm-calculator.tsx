"use client";

import { useState } from "react";
import { Calculator } from "lucide-react";
import { Input } from "@/components/ui/input";
import { parseNumber } from "@/components/training/workout-state";
import { repTable } from "@/lib/progress/progression";
import { epley1RM } from "@/lib/progress/records";

const fmt = (n: number) => n.toLocaleString("ru-RU", { maximumFractionDigits: 1 });

export function OneRmCalculator({ initialWeight = "", initialReps = "" }: { initialWeight?: string; initialReps?: string }) {
  const [weight, setWeight] = useState(initialWeight);
  const [reps, setReps] = useState(initialReps);
  const w = parseNumber(weight);
  const r = Math.round(parseNumber(reps));
  const oneRm = r > 0 && r <= 30 ? epley1RM(w, r) : 0;

  return (
    <section aria-label="Калькулятор 1RM" className="card-glow rounded-xl border p-4">
      <h2 className="flex items-center gap-2 font-bold">
        <Calculator className="size-4 text-primary" />
        Калькулятор 1RM
      </h2>
      <p className="text-xs text-muted-foreground">Формула Эпли: 1RM = вес × (1 + повторы / 30)</p>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">Вес, кг</span>
          <Input inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="100" />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">Повторы</span>
          <Input inputMode="numeric" value={reps} onChange={(e) => setReps(e.target.value)} placeholder="5" />
        </label>
      </div>

      <p className="mt-4 text-sm text-muted-foreground">Расчётный максимум</p>
      <p className="text-4xl font-black" data-testid="one-rm-result">
        {oneRm ? `${fmt(oneRm)} кг` : "—"}
      </p>

      {oneRm ? (
        <table className="mt-3 w-full text-sm">
          <caption className="sr-only">Вес на N повторений</caption>
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="font-normal">Повторы</th>
              <th className="font-normal">Вес</th>
              <th className="text-right font-normal">% от 1RM</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {repTable(oneRm).map((row) => (
              <tr key={row.reps} className="border-t border-border/50">
                <td className="py-1">{row.reps}</td>
                <td className="py-1 font-semibold">{fmt(row.weight)} кг</td>
                <td className="py-1 text-right text-muted-foreground">{row.percent}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </section>
  );
}
