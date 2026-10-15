"use client";

import type { ReactNode } from "react";
import { Link2, Unlink2 } from "lucide-react";
import { plural } from "@/lib/format";
import { cn } from "@/lib/utils";

/** «Суперсет» (2 упражнения) или «Круг · N упражнений» (3–6). */
export function supersetTitle(size: number) {
  return size <= 2
    ? "Суперсет"
    : `Круг · ${size} ${plural(size, "упражнение", "упражнения", "упражнений")}`;
}

/** Заголовок группы — над первым её упражнением. */
export function SupersetHeader({ size }: { size: number }) {
  return (
    <div
      data-testid="superset"
      className="-mb-2 flex items-center gap-1.5 pl-1 text-xs font-semibold tracking-wide text-primary uppercase"
    >
      <Link2 className="size-3.5" aria-hidden />
      {supersetTitle(size)}
    </div>
  );
}

/** Упражнение группы — с линией слева: группа читается одной рамкой. */
export function SupersetPart({
  grouped,
  children,
}: {
  grouped: boolean;
  children: ReactNode;
}) {
  if (!grouped) return children;
  return <div className="border-l-2 border-primary pl-2">{children}</div>;
}

/** Метка A1/A2 перед названием упражнения. */
export function SupersetLabel({
  label,
  className,
}: {
  label?: string | null;
  className?: string;
}) {
  if (!label) return null;
  return (
    <span
      className={cn(
        "mr-1.5 inline-block rounded bg-primary/15 px-1.5 text-xs font-semibold text-primary tabular-nums",
        className,
      )}
    >
      {label}
    </span>
  );
}

/** Скрепка между соседними упражнениями `names` (пара — в подписи: скринридер различает кнопки). */
export function SupersetLink({
  names,
  linked,
  canLink,
  onLink,
  onUnlink,
}: {
  names: [string, string];
  linked: boolean;
  canLink: boolean;
  onLink: () => void;
  onUnlink: () => void;
}) {
  if (!linked && !canLink) return null;
  const [a, b] = names;
  const label = linked ? `Разъединить «${a}» и «${b}»` : `Связать «${a}» и «${b}» в суперсет`;
  return (
    <div className="-my-2 flex justify-center">
      <button
        type="button"
        onClick={linked ? onUnlink : onLink}
        aria-label={label}
        title={label}
        className={cn(
          "flex size-7 items-center justify-center rounded-full border bg-background text-muted-foreground transition-colors hover:text-foreground",
          linked && "border-primary text-primary",
        )}
      >
        {linked ? (
          <Unlink2 className="size-3.5" />
        ) : (
          <Link2 className="size-3.5" />
        )}
      </button>
    </div>
  );
}
