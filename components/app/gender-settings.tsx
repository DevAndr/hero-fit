"use client";

import { useState, useTransition } from "react";
import { UserRound } from "lucide-react";
import { toast } from "sonner";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { Gender } from "@/generated/prisma/enums";
import { setGenderAction } from "@/lib/profile/actions";
import { GENDER_OPTIONS } from "@/lib/profile/gender";

/** Пол в профиле — сохраняется сразу при выборе. */
export function GenderSettings({ initial }: { initial: Gender | null }) {
  const [value, setValue] = useState<string>(initial ?? "NONE");
  const [pending, startTransition] = useTransition();

  const change = (next: string) => {
    const prev = value;
    setValue(next);
    startTransition(async () => {
      const result = await setGenderAction(next);
      if (result.ok) toast.success("Сохранено");
      else {
        setValue(prev);
        toast.error("Не удалось сохранить");
      }
    });
  };

  return (
    <section aria-label="Пол" className="space-y-3 rounded-xl border bg-card p-4">
      <h2 className="flex items-center gap-2 font-bold">
        <UserRound className="size-4 text-primary" />
        Пол
      </h2>
      <p className="text-sm text-muted-foreground">Видите только вы. Пригодится для расчётов и рекомендаций.</p>
      <RadioGroup aria-label="Пол" value={value} onValueChange={(v) => change(v as string)} disabled={pending} className="grid-cols-3">
        {GENDER_OPTIONS.map(({ value: option, label }) => (
          <label
            key={option}
            className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border p-3 text-sm transition-colors hover:bg-muted has-data-checked:border-primary has-data-checked:bg-primary/10"
          >
            <RadioGroupItem value={option} aria-label={label} />
            {label}
          </label>
        ))}
      </RadioGroup>
    </section>
  );
}
