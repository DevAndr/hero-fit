"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { usePathname } from "next/navigation";
import { ChartColumn, ClipboardCheck, LogOut, Settings, Shield, Swords, Sparkles, Target, ToggleRight, Users } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePush } from "@/components/notifications/push-provider";
import { logoutAction } from "@/lib/auth/actions";

export function UserMenu({
  name,
  login,
  email,
  isCoach,
  isAdmin = false,
  unseen = false,
}: {
  name: string | null;
  login: string;
  email: string | null;
  isCoach: boolean;
  isAdmin?: boolean;
  /** Есть непросмотренный релиз «Что нового» — точка на аватаре и у пункта. */
  unseen?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const push = usePush();
  // Переход из меню — клиентская навигация: layout с точкой не перерисуется, гасим локально
  const pathname = usePathname();
  const [opened, setOpened] = useState(false);
  const dot = unseen && !opened && pathname !== "/whats-new";
  const display = name ?? login;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50" aria-label={dot ? "Меню профиля, есть новое" : "Меню профиля"}>
        <span className="relative block">
          <Avatar>
            <AvatarFallback className="bg-primary/15 font-semibold text-primary">
              {display.slice(0, 1).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          {dot ? (
            <span
              data-testid="whats-new-dot"
              aria-hidden
              className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-primary ring-2 ring-background"
            />
          ) : null}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            <div className="truncate font-medium text-foreground">{display}</div>
            {email ? <div className="truncate text-xs font-normal">{email}</div> : null}
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        {isCoach ? (
          <DropdownMenuItem render={<Link href="/coach" />}>
            <ClipboardCheck />
            Клиенты
          </DropdownMenuItem>
        ) : null}
        {isAdmin ? (
          <DropdownMenuItem render={<Link href="/admin/flags" />}>
            <ToggleRight />
            Флаги
          </DropdownMenuItem>
        ) : null}
        {/* Без prefetch={true}: открытие страницы помечает релиз просмотренным */}
        <DropdownMenuItem render={<Link href="/whats-new" />} onClick={() => setOpened(true)}>
          <Sparkles />
          Что нового
          {dot ? (
            <span className="ml-auto size-2 rounded-full bg-primary" aria-hidden>
              <span className="sr-only">есть новое</span>
            </span>
          ) : null}
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link href="/goals" />}>
          <Target />
          Цели
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link href="/stats" />}>
          <ChartColumn />
          Статистика
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link href="/friends" />}>
          <Users />
          Друзья
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link href="/guild" />}>
          <Shield />
          Гильдия
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link href="/leaderboard" />}>
          <Swords />
          Рейтинг
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link href="/settings" />}>
          <Settings />
          Настройки
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              // Устройство перестаёт получать push этого аккаунта после выхода.
              await push?.forgetDevice();
              await logoutAction();
            })
          }
        >
          <LogOut />
          Выйти
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
