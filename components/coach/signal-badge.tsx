import { CircleAlert, TriangleAlert } from "lucide-react";
import { SIGNAL_LABELS, signalTone, type SignalKind } from "@/lib/coach/signals";
import { cn } from "@/lib/utils";

/** Метка сигнала риска: тревожная (клиент уходит) или предупреждение (тренируется, но что-то не так). */
export function SignalBadge({ kind }: { kind: SignalKind }) {
  const alert = signalTone(kind) === "alert";
  const Icon = alert ? CircleAlert : TriangleAlert;
  return (
    <span
      data-testid="client-signal"
      className={cn(
        "flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold",
        alert ? "bg-destructive/10 text-destructive" : "bg-streak/10 text-streak",
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {SIGNAL_LABELS[kind]}
    </span>
  );
}
