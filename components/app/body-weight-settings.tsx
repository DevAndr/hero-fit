"use client";

import { useState, useTransition } from "react";
import { Loader2, Scale } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { logBodyWeightAction } from "@/lib/goals/actions";

export function BodyWeightSettings({ initial }: { initial: number | null }) {
  const [value, setValue] = useState(initial === null ? "" : String(initial).replace(".", ","));
  const [pending, startTransition] = useTransition();

  const save = () =>
    startTransition(async () => {
      const weight = Number(value.trim().replace(",", "."));
      if (!value.trim() || !Number.isFinite(weight)) {
        toast.error("Укажите вес от 30 до 300 кг");
        return;
      }
      const result = await logBodyWeightAction(weight);
      if (!result.ok) toast.error(result.error);
      else if (result.achieved) toast.success(`🎯 Цель достигнута: ${result.achieved}`);
      else toast.success("Вес записан");
    });

  return (
    <section aria-label="Вес тела" className="space-y-3 rounded-xl border bg-card p-4">
      <h2 className="flex items-center gap-2 font-bold">
        <Scale className="size-4 text-primary" />
        Вес тела
      </h2>
      <p className="text-sm text-muted-foreground">
        Нужен для ачивок «Сила» и целей по весу. Запись за сегодня попадает в журнал взвешиваний на странице «Цели».
      </p>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Input
          aria-label="Вес тела, кг"
          inputMode="decimal"
          placeholder="кг"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="max-w-32"
        />
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : null}
          Записать вес
        </Button>
      </form>
    </section>
  );
}
