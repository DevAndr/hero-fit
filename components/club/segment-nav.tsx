import Link from "next/link";
import { cn } from "@/lib/utils";

/** Переключатель разделов ссылками (как на /achievements): состояние — в URL. */
export function SegmentNav({ label, items, current }: { label: string; items: { key: string; label: string; href: string }[]; current: string }) {
  return (
    <nav aria-label={label} className="flex w-fit max-w-full flex-wrap rounded-lg bg-muted p-0.5">
      {items.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={current === t.key ? "page" : undefined}
          className={cn("rounded-md px-3 py-1 text-sm font-medium text-muted-foreground", current === t.key && "bg-background text-foreground shadow-sm")}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
