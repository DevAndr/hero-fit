"use client";

import { useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { endProgramAction } from "@/lib/coach/program-actions";

/** Блок «Программа» во вкладке «План»: активная программа клиента и «Завершить досрочно». */
export function ProgramProgress({ clientId, name, children }: { clientId: string; name: string; children?: React.ReactNode }) {
  const [pending, startTransition] = useTransition();
  const end = () =>
    startTransition(async () => {
      const result = await endProgramAction(clientId);
      if (result.ok) toast.success("Программа завершена");
      else toast.error(result.error);
    });
  return (
    <section aria-label="Программа" className="space-y-3 rounded-xl border bg-card p-4">
      <h2 className="font-bold">Программа «{name}»</h2>
      {children}
      <Button type="button" variant="outline" size="sm" disabled={pending} onClick={end}>
        {pending ? <Loader2 className="animate-spin" /> : null}
        Завершить досрочно
      </Button>
    </section>
  );
}
