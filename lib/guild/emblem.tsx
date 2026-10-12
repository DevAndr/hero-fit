import { Anchor, Axe, Crown, Flame, Hammer, Mountain, PawPrint, Shield, Skull, Star, Sword, Zap, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const ICONS: Record<string, LucideIcon> = {
  shield: Shield,
  sword: Sword,
  hammer: Hammer,
  crown: Crown,
  flame: Flame,
  paw: PawPrint,
  skull: Skull,
  mountain: Mountain,
  zap: Zap,
  anchor: Anchor,
  axe: Axe,
  star: Star,
};

/** Значок гильдии; неизвестный код — щит. */
export function GuildEmblem({ code, className }: { code: string; className?: string }) {
  const Icon = ICONS[code] ?? Shield;
  return <Icon className={cn("size-5", className)} aria-hidden />;
}
