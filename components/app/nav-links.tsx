"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { CLUB_NAV_ITEM, COACH_NAV_ITEM, NAV_ITEMS, PROGRAMS_NAV_ITEM, SHOP_NAV_ITEM } from "@/components/app/nav";
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
  type Item = (typeof NAV_ITEMS)[number] | typeof CLUB_NAV_ITEM | typeof COACH_NAV_ITEM | typeof SHOP_NAV_ITEM | typeof PROGRAMS_NAV_ITEM;
  const base: Item[] = NAV_ITEMS.flatMap((item): Item[] => {
    if (item.href === "/templates" && catalog) return [item, PROGRAMS_NAV_ITEM];
    if (item.href === "/achievements" && shop) return [item, SHOP_NAV_ITEM];
    if (item.href === "/guild" && clubs) return [item, CLUB_NAV_ITEM];
    return [item];
  });
  const items = isCoach ? [...base, COACH_NAV_ITEM] : base;
  return (
    <nav className="flex flex-col gap-1" data-tour="nav">
      {items.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          aria-current={isActive(href) ? "page" : undefined}
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
            isActive(href) && "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary",
          )}
        >
          <Icon className="size-4" />
          {label}
        </Link>
      ))}
    </nav>
  );
}

export function BottomNav() {
  const isActive = useIsActive();
  return (
    <nav data-tour="nav" className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-[calc(env(safe-area-inset-bottom)+var(--tg-safe-bottom))] backdrop-blur lg:hidden">
      <div className="mx-auto grid max-w-md grid-cols-5">
        {NAV_ITEMS.filter((item) => item.mobile).map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={isActive(href) ? "page" : undefined}
            className={cn(
              "flex flex-col items-center gap-1 py-2 text-[11px] font-medium text-muted-foreground",
              isActive(href) && "text-primary",
            )}
          >
            <Icon className="size-5" />
            {label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
