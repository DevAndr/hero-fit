"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BarChart3, Bell, CalendarDays, ClipboardList, Flame, Info, Swords, Timer, Trophy, Users, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { NotificationType } from "@/generated/prisma/enums";
import { markNotificationsReadAction } from "@/lib/notifications/actions";
import type { NotificationFeed } from "@/lib/notifications/queries";
import { cn } from "@/lib/utils";

const ICONS: Record<NotificationType, { icon: LucideIcon; color: string }> = {
  REST: { icon: Timer, color: "text-primary" },
  STREAK: { icon: Flame, color: "text-streak" },
  ACHIEVEMENT: { icon: Trophy, color: "text-xp" },
  SYSTEM: { icon: Info, color: "text-muted-foreground" },
  SOCIAL: { icon: Users, color: "text-chart-2" },
  PLAN: { icon: CalendarDays, color: "text-primary" },
  RECAP: { icon: BarChart3, color: "text-primary" },
  BOSS: { icon: Swords, color: "text-streak" },
  COACH: { icon: ClipboardList, color: "text-primary" },
};

const relative = new Intl.RelativeTimeFormat("ru-RU", { numeric: "auto" });
function ago(iso: string) {
  const minutes = Math.round((new Date(iso).getTime() - Date.now()) / 60_000);
  if (minutes > -60) return relative.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (hours > -24) return relative.format(hours, "hour");
  return relative.format(Math.round(hours / 24), "day");
}

export function NotificationBell({ feed }: { feed: NotificationFeed }) {
  const router = useRouter();
  const [readLocally, setReadLocally] = useState(false);
  const [, startTransition] = useTransition();
  const unread = readLocally ? 0 : feed.unread;

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (open && unread > 0) {
          setReadLocally(true);
          startTransition(() => markNotificationsReadAction());
        }
      }}
    >
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="relative"
            aria-label={unread ? `Уведомления: ${unread} новых` : "Уведомления"}
          />
        }
      >
        <Bell />
        {unread ? (
          <span
            className="absolute -top-0.5 -right-0.5 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white"
            data-testid="unread-count"
          >
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 max-w-[calc(100vw-2rem)]">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Уведомления</DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        {feed.items.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">Пока ничего нет</p>
        ) : (
          feed.items.map((n) => {
            const { icon: Icon, color } = ICONS[n.type];
            return (
              <DropdownMenuItem
                key={n.id}
                className="items-start gap-2 py-2 cursor-pointer"
                onClick={() => n.url && router.push(n.url)}
              >
                <Icon className={cn("mt-0.5 size-4", color)} />
                <span className="min-w-0 flex-1">
                  <span className={cn("block text-sm", !n.read && !readLocally ? "font-semibold" : "font-medium")}>
                    {n.title}
                  </span>
                  <span className="block text-xs text-muted-foreground">{n.body}</span>
                  <span className="block text-[11px] text-muted-foreground">{ago(n.createdAt)}</span>
                </span>
              </DropdownMenuItem>
            );
          })
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
