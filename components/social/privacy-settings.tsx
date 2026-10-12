"use client";

import { useState, useTransition } from "react";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { updatePrivacyAction } from "@/lib/social/actions";

type Privacy = { shareActivity: boolean; hideWeights: boolean };

const OPTIONS: { key: keyof Privacy; label: string; description: string }[] = [
  {
    key: "shareActivity",
    label: "Показывать мои тренировки друзьям и гильдии",
    description: "В ленте активности. Выключите — друзья не увидят ни новых, ни прошлых тренировок",
  },
  {
    key: "hideWeights",
    label: "Скрывать рабочие веса",
    description: "Друзья увидят длительность, подходы и рекорды, но не веса и объём",
  },
];

export function PrivacySettings({ initial }: { initial: Privacy }) {
  const [prefs, setPrefs] = useState(initial);
  const [, startTransition] = useTransition();

  const toggle = (key: keyof Privacy, value: boolean) => {
    setPrefs((p) => ({ ...p, [key]: value }));
    startTransition(async () => {
      const result = await updatePrivacyAction({ [key]: value });
      if (!result.ok) {
        setPrefs((p) => ({ ...p, [key]: !value }));
        toast.error("Не удалось сохранить настройку");
      }
    });
  };

  return (
    <section aria-label="Приватность" className="space-y-4 rounded-xl border bg-card p-4">
      <h2 className="flex items-center gap-2 font-bold">
        <ShieldCheck className="size-4 text-primary" />
        Приватность
      </h2>
      {OPTIONS.map(({ key, label, description }) => (
        <Field key={key} orientation="horizontal">
          <FieldContent>
            <FieldLabel htmlFor={`privacy-${key}`}>{label}</FieldLabel>
            <FieldDescription>{description}</FieldDescription>
          </FieldContent>
          <Switch
            id={`privacy-${key}`}
            checked={prefs[key]}
            disabled={key === "hideWeights" && !prefs.shareActivity}
            onCheckedChange={(v) => toggle(key, v)}
          />
        </Field>
      ))}
    </section>
  );
}
