import { Lightbulb } from "lucide-react";
import type { ProgressionHint } from "@/lib/progress/progression";
import { cn } from "@/lib/utils";

const fmt = (n: number) => n.toLocaleString("ru-RU", { maximumFractionDigits: 1 });

/** «Пора увеличить вес»: 3 тренировки подряд одинаково или запас повторов 2+ (RIR). */
export function HintBadge({ hint, className }: { hint: ProgressionHint; className?: string }) {
  return (
    <p
      className={cn("flex items-start gap-1.5 rounded-lg bg-xp/10 px-2 py-1 text-xs text-xp", className)}
      data-testid="progression-hint"
    >
      <Lightbulb className="mt-px size-3.5 shrink-0" />
      {hint.kind === "weight"
        ? `Пора увеличить вес: ${fmt(hint.current)} → ${fmt(hint.suggested)} кг`
        : `Пора добавить повторы: ${hint.current} → ${hint.suggested} или доп. вес`}
      {hint.easy ? " — в прошлый раз оставался запас 2+ повтора" : ""}
    </p>
  );
}
