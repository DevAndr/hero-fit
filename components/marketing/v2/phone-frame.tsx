import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Рамка телефона для живых макетов лендинга. Макет — иллюстрация: role="img" с подписью, содержимое
 * скринридеру не зачитывается (aria-hidden), фокуса внутри нет.
 */
export function PhoneFrame({ children, label, tilt = "none", className }: { children: ReactNode; label: string; tilt?: "left" | "right" | "none"; className?: string }) {
  return (
    <div
      role="img"
      aria-label={label}
      className={cn(
        "relative mx-auto w-[min(100%,18rem)] shrink-0 rounded-[2.6rem] border border-foreground/10 bg-foreground/6 p-2.5",
        "shadow-[0_40px_90px_-30px_color-mix(in_oklch,var(--primary)_55%,transparent)] backdrop-blur",
        tilt === "left" && "lg:transform-[perspective(1400px)_rotateY(10deg)_rotateX(2deg)]",
        tilt === "right" && "lg:transform-[perspective(1400px)_rotateY(-10deg)_rotateX(2deg)]",
        className,
      )}
    >
      <div aria-hidden className="relative overflow-hidden rounded-[2rem] border bg-background">
        <div className="absolute top-2 left-1/2 z-10 h-5 w-20 -translate-x-1/2 rounded-full bg-foreground/90" />
        <div className="flex min-h-120 flex-col gap-3 px-3.5 pt-10 pb-5 text-left text-[13px]">{children}</div>
      </div>
    </div>
  );
}
