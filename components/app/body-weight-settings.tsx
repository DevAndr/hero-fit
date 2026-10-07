"use client";

import { useState, useTransition } from "react";
import { Loader2, Scale } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateBodyWeightAction } from "@/lib/profile/actions";

export function BodyWeightSettings({ initial }: { initial: number | null }) {
  const [value, setValue] = useState(initial === null ? "" : String(initial).replace(".", ","));
  const [pending, startTransition] = useTransition();

  const save = () =>
    startTransition(async () => {
      const text = value.trim().replace(",", ".");
      const result = await updateBodyWeightAction(text ? Number(text) : null);
      if (result.ok) toast.success(text ? "Вес тела сохранён" : "Вес тела удалён");
      else toast.error(result.error);
    });

  return (
    <section aria-label="Вес тела" className="space-y-3 rounded-xl border bg-card p-4">
      <h2 className="flex items-center gap-2 font-bold">
        <Scale className="size-4 text-primary" />
        Вес тела
      </h2>
      <p className="text-sm text-muted-foreground">
        Нужен для ачивок «Сила»: расчётный 1RM в жиме, приседе и становой относительно веса тела.
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
          Сохранить
        </Button>
      </form>
    </section>
  );
}
