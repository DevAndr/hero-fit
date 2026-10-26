import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Ключевое слово заголовка — градиент «фирменный → XP». */
export function GradientText({ children }: { children: ReactNode }) {
  return <span className="bg-linear-to-r from-primary to-xp bg-clip-text text-transparent">{children}</span>;
}

/** Бейдж-капсула над заголовком секции. */
export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold tracking-wide text-primary uppercase">
      {children}
    </span>
  );
}

/** Стеклянная карточка: полупрозрачный фон с размытием, тонкая рамка. */
export const glass = "rounded-2xl border border-foreground/10 bg-card/70 backdrop-blur-md";

/** Секция лендинга v2: бейдж, h2 (имя region), лид и содержимое. */
export function Section({
  id,
  eyebrow,
  title,
  lead,
  children,
  className,
  center = false,
}: {
  id: string;
  eyebrow: ReactNode;
  title: ReactNode;
  lead?: ReactNode;
  children: ReactNode;
  className?: string;
  center?: boolean;
}) {
  return (
    <section aria-labelledby={`${id}-title`} id={id} className={cn("relative scroll-mt-20 px-4 py-20 sm:py-28", className)}>
      <div className="mx-auto w-full max-w-6xl">
        <div className={cn("max-w-2xl space-y-4", center && "mx-auto text-center")}>
          <Eyebrow>{eyebrow}</Eyebrow>
          <h2 id={`${id}-title`} className="font-display text-3xl font-extrabold tracking-tight text-balance sm:text-5xl">
            {title}
          </h2>
          {lead ? <p className="text-lg text-pretty text-muted-foreground">{lead}</p> : null}
        </div>
        <div className="mt-12 sm:mt-16">{children}</div>
      </div>
    </section>
  );
}
