"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { CLUB_NAV_ITEM, COACH_CALENDAR_NAV_ITEM, COACH_NAV_ITEM, NAV_ITEMS, PROGRAMS_NAV_ITEM, SHOP_NAV_ITEM, STRETCH_NAV_ITEM, TRAINERS_NAV_ITEM } from "@/components/app/nav";
import { useFlag } from "@/components/flags/flags-provider";

function useIsActive() {
  const pathname = usePathname();
  return (href: string) => pathname === href || pathname.startsWith(`${href}/`);
}

export function SidebarNav({ isCoach }: { isCoach: boolean }) {
  const isActive = useIsActive();
  const clubs = useFlag("clubs");
  const shop = useFlag("shop");
  const catalog = useFlag("program_catalog");
  const stretching = useFlag("stretching");
  const trainers = !isCoach;
  type Item =
    | (typeof NAV_ITEMS)[number]
    | typeof CLUB_NAV_ITEM
    | typeof COACH_NAV_ITEM
    | typeof COACH_CALENDAR_NAV_ITEM
    | typeof SHOP_NAV_ITEM
    | typeof STRETCH_NAV_ITEM
    | typeof PROGRAMS_NAV_ITEM
    | typeof TRAINERS_NAV_ITEM;
  const base: Item[] = NAV_ITEMS.flatMap((item): Item[] => {
    if (item.href === "/exercises" && stretching) return [item, STRETCH_NAV_ITEM];
    if (item.href === "/templates" && catalog) return [item, PROGRAMS_NAV_ITEM];
    if (item.href === "/achievements" && shop) return [item, SHOP_NAV_ITEM];
    if (item.href === "/guild" && clubs) return [item, CLUB_NAV_ITEM];
    if (item.href === "/friends" && trainers) return [item, TRAINERS_NAV_ITEM];
    return [item];
  });
  // Тренеру «Клиенты» и «Календарь клиентов» — сразу после «Кабинета»
  const items = isCoach ? [base[0], COACH_NAV_ITEM, COACH_CALENDAR_NAV_ITEM, ...base.slice(1)] : base;
  // Активен самый длинный подходящий пункт: на /coach/calendar — «Календарь клиентов», а не «Клиенты»
  const active = items.filter((i) => isActive(i.href)).sort((a, b) => b.href.length - a.href.length)[0]?.href;
  return (
    <nav className="flex flex-col gap-1" data-tour="nav">
      {items.map(({ href, label, icon: Icon }) => {
        const coach = href === COACH_NAV_ITEM.href;
        return (
          <Link
            key={href}
            href={href}
            aria-current={href === active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
              href === active && "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary",
              coach && "coach-nav",
            )}
          >
            <Icon className="size-4" />
            <span className={cn(coach && "coach-nav-label")}>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function BottomNav({ isCoach }: { isCoach: boolean }) {
  const isActive = useIsActive();
  const mobile = NAV_ITEMS.filter((item) => item.mobile);
  // Тренеру «Клиенты» — в центре вместо «Упражнений» (они — в меню профиля)
  const items = isCoach
    ? [...mobile.slice(0, 2), COACH_NAV_ITEM, ...mobile.slice(2).filter((item) => item.href !== "/exercises")]
    : mobile;
  return (
    <nav data-tour="nav" className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-[calc(env(safe-area-inset-bottom)+var(--tg-safe-bottom))] backdrop-blur lg:hidden">
      <div className="mx-auto grid max-w-md grid-cols-5">
        {items.map(({ href, label, icon: Icon }) => {
          const coach = href === COACH_NAV_ITEM.href;
          return (
            <Link
              key={href}
              href={href}
              aria-current={isActive(href) ? "page" : undefined}
              className={cn(
                "flex flex-col items-center gap-1 py-2 text-[11px] font-medium text-muted-foreground",
                isActive(href) && "text-primary",
                coach && "coach-nav rounded-lg",
              )}
            >
              <Icon className="size-5" />
              <span className={cn(coach && "coach-nav-label")}>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
