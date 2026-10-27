"use client";

import { useState, useTransition } from "react";
import { Trophy } from "lucide-react";
import { toast } from "sonner";
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { updateRecordCardsAction } from "@/lib/share/actions";

/** Карточки рекордов: окно «Новый рекорд!» с картинкой после тренировки с рекордом. По умолчанию выключено. */
export function RecordCardsSetting({ initial }: { initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [, startTransition] = useTransition();

  return (
    <section aria-label="Карточки рекордов" className="space-y-4 rounded-xl border bg-card p-4">
      <h2 className="flex items-center gap-2 font-bold">
        <Trophy className="size-4 text-xp" />
        Карточки рекордов
      </h2>
      <Field orientation="horizontal">
        <FieldContent>
          <FieldLabel htmlFor="record-cards">Показывать карточку после рекорда</FieldLabel>
          <FieldDescription>Побили рекорд — сразу картинка с результатом, приростом и уровнем, чтобы поделиться</FieldDescription>
        </FieldContent>
        <Switch
          id="record-cards"
          checked={on}
          onCheckedChange={(v) => {
            setOn(v);
            startTransition(async () => {
              const { ok } = await updateRecordCardsAction(v).catch(() => ({ ok: false }));
              if (!ok) {
                setOn(!v);
                toast.error("Не удалось сохранить настройку");
              }
            });
          }}
        />
      </Field>
    </section>
  );
}
