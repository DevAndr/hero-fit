"use client";

import { useTransition } from "react";
import { CalendarX2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { skipPlanAction } from "@/lib/plans/actions";

/** «Пропустить» план на сегодня: только это вхождение, у повторяющегося — один день. */
export function SkipPlanButton({ planKey, title, className }: { planKey: string; title: string; className?: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={className}
      disabled={pending}
      aria-label={`Пропустить «${title}»`}
      onClick={() =>
        startTransition(async () => {
          const result = await skipPlanAction(planKey);
          if (result.ok) toast.success(`«${title}» пропущена — в календаре её больше нет`);
          else toast.error(result.error);
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" /> : <CalendarX2 />}
      Пропустить
    </Button>
  );
}
