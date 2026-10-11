"use client";

import Link from "next/link";
import { useTransition } from "react";
import { ChartColumn, ClipboardCheck, LogOut, Settings, Shield, Swords, Target, Users } from "lucide-react";
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

export function UserMenu({ name, login, email, isCoach }: { name: string | null; login: string; email: string | null; isCoach: boolean }) {
  const [pending, startTransition] = useTransition();
  const push = usePush();
  const display = name ?? login;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50" aria-label="Меню профиля">
        <Avatar>
          <AvatarFallback className="bg-primary/15 font-semibold text-primary">
            {display.slice(0, 1).toUpperCase()}
          </AvatarFallback>
        </Avatar>
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
