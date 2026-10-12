"use client";

import { useState, useTransition } from "react";
import { MessageCircleQuestion } from "lucide-react";
import { toast } from "sonner";
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { setAssistantEnabledAction } from "@/lib/assistant/actions";

export function AssistantSettings({ initial }: { initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [, startTransition] = useTransition();

  const toggle = (value: boolean) => {
    setOn(value);
    startTransition(async () => {
      const result = await setAssistantEnabledAction(value);
      if (!result.ok) {
        setOn(!value);
        toast.error("Не удалось сохранить настройку");
      }
    });
  };

  return (
    <section aria-label="Помощник" className="space-y-4 rounded-xl border bg-card p-4">
      <h2 className="flex items-center gap-2 font-bold">
        <MessageCircleQuestion className="size-4 text-primary" />
        Помощник
      </h2>
      <Field orientation="horizontal">
        <FieldContent>
          <FieldLabel htmlFor="assistant-enabled">Помощник</FieldLabel>
          <FieldDescription>Плавающая кнопка с советами: вес на сегодня, замены, самочувствие, справка</FieldDescription>
        </FieldContent>
        <Switch id="assistant-enabled" checked={on} onCheckedChange={toggle} />
      </Field>
    </section>
  );
}
