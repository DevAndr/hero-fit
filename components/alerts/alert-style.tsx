import Link from "next/link";
import { Info, OctagonAlert, TriangleAlert, type LucideIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import type { AlertTone, AlertView } from "@/lib/alerts/rules";

export const TONE_ICON: Record<AlertTone, LucideIcon> = { INFO: Info, WARNING: TriangleAlert, CRITICAL: OctagonAlert };

/** Фон и рамка строки, цвет иконки — по тону. */
export const TONE_BANNER: Record<AlertTone, string> = {
  INFO: "border-primary/30 bg-primary/10 [&_[data-icon]]:text-primary",
  WARNING: "border-warning/50 bg-warning/20 [&_[data-icon]]:text-warning-foreground dark:[&_[data-icon]]:text-warning",
  CRITICAL: "border-destructive/40 bg-destructive/10 [&_[data-icon]]:text-destructive",
};

export const TONE_TEXT: Record<AlertTone, string> = {
  INFO: "text-primary",
  WARNING: "text-warning-foreground dark:text-warning",
  CRITICAL: "text-destructive",
};

/** Кнопка-ссылка оповещения: свой путь — Link, внешняя https — в новой вкладке. */
export function AlertCta({ alert, onClick, size = "sm" }: { alert: AlertView; onClick?: () => void; size?: "sm" | "default" }) {
  if (!alert.ctaLabel || !alert.ctaHref) return null;
  const className = buttonVariants({ variant: "outline", size });
  return alert.ctaHref.startsWith("/") ? (
    <Link href={alert.ctaHref} className={className} onClick={onClick}>
      {alert.ctaLabel}
    </Link>
  ) : (
    <a href={alert.ctaHref} target="_blank" rel="noopener noreferrer" className={className} onClick={onClick}>
      {alert.ctaLabel}
    </a>
  );
}
