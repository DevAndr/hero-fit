"use client";

import { useTransition } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { updateTemplateFromWorkoutAction } from "@/lib/templates/actions";

/** «Добавить недостающие упражнения в шаблон» — перезаписать шаблон составом этой тренировки. */
export function UpdateTemplateButton({ workoutId, templateName }: { workoutId: string; templateName: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await updateTemplateFromWorkoutAction(workoutId);
          if (result.ok) toast.success(`Шаблон «${templateName}» обновлён`);
          else toast.error(result.error);
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
      Обновить шаблон «{templateName}»
    </Button>
  );
}
