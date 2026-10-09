import { Compass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { restartOnboardingAction } from "@/lib/onboarding/actions";

/** Карточка в /settings: пройти экскурсию по дашборду заново. */
export function RestartTourButton() {
  return (
    <section aria-label="Экскурсия" className="space-y-3 rounded-xl border bg-card p-4">
      <h2 className="flex items-center gap-2 font-bold">
        <Compass className="size-4 text-primary" />
        Экскурсия
      </h2>
      <p className="text-sm text-muted-foreground">Коротко о главном на дашборде: уровень, streak, босс недели и карта мышц.</p>
      <form action={restartOnboardingAction}>
        <Button type="submit" variant="outline">
          Показать экскурсию ещё раз
        </Button>
      </form>
    </section>
  );
}
