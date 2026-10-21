"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { usePathname } from "next/navigation";
import { Activity, Building2, LibraryBig, ChartColumn, ClipboardCheck, LogOut, Settings, Shield, Swords, Sparkles, Store, Target, ToggleRight, Users, Bug, Megaphone, Mail, MessageSquare, Inbox } from "lucide-react";
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
import { PlayerAvatar } from "@/components/shop/player-avatar";
import { PlayerName } from "@/components/shop/player-name";
import { coinWord } from "@/lib/shop/labels";
import type { Cosmetics } from "@/lib/shop/cosmetics";
import { useFlag } from "@/components/flags/flags-provider";
import { usePush } from "@/components/notifications/push-provider";
import { prunePain } from "@/components/assistant/pain-store";
import { logoutAction } from "@/lib/auth/actions";

export function UserMenu({
  name,
  login,
  email,
  isCoach,
  isAdmin = false,
  unseen = false,
  pendingClubs = 0,
  newFeedback = 0,
  cosmetics,
  coins,
}: {
  name: string | null;
  login: string;
  email: string | null;
  isCoach: boolean;
  isAdmin?: boolean;
  /** Есть непросмотренный релиз «Что нового» — точка на аватаре и у пункта. */
  unseen?: boolean;
  /** Заявок на клубы на проверке (админу приложения). */
  pendingClubs?: number;
  /** Новых обращений в обратную связь — только админу. */
  newFeedback?: number;
  /** Надетая косметика (флаг магазина уже учтён). */
  cosmetics?: Cosmetics;
  /** Баланс монет (только при включённом магазине). */
  coins?: number;
}) {
  const [pending, startTransition] = useTransition();
  const push = usePush();
  const clubs = useFlag("clubs");
  const shop = useFlag("shop");
  const catalog = useFlag("program_catalog");
  const campaigns = useFlag("campaigns");
  // Переход из меню — клиентская навигация: layout с точкой не перерисуется, гасим локально
  const pathname = usePathname();
  const [opened, setOpened] = useState(false);
  const dot = unseen && !opened && pathname !== "/whats-new";
  const display = name ?? login;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50" aria-label={dot ? "Меню профиля, есть новое" : "Меню профиля"}>
        <span className="relative block">
          {cosmetics?.avatar || cosmetics?.frame ? (
            <PlayerAvatar nickname={display} cosmetics={cosmetics} size="sm" />
          ) : (
            <Avatar>
              <AvatarFallback className="bg-primary/15 font-semibold text-primary">
                {display.slice(0, 1).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          )}
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
            <div className="truncate font-medium text-foreground">
              <PlayerName nickname={display} color={cosmetics?.nickColor} />
            </div>
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
          <DropdownMenuItem render={<Link href="/admin" />}>
            <Activity />
            Метрики
          </DropdownMenuItem>
        ) : null}
        {isAdmin ? (
          <DropdownMenuItem render={<Link href="/admin/flags" />}>
            <ToggleRight />
            Флаги
          </DropdownMenuItem>
        ) : null}
        {isAdmin ? (
          <DropdownMenuItem render={<Link href="/admin/feedback" />}>
            <Inbox />
            Обращения
            {newFeedback > 0 ? <span className="ml-auto rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground">{newFeedback}</span> : null}
          </DropdownMenuItem>
        ) : null}
        {isAdmin ? (
          <DropdownMenuItem render={<Link href="/admin/alerts" />}>
            <Megaphone />
            Оповещения
          </DropdownMenuItem>
        ) : null}
        {isAdmin && campaigns ? (
          <DropdownMenuItem render={<Link href="/admin/campaigns" />}>
            <Mail />
            Рассылки
          </DropdownMenuItem>
        ) : null}
        {isAdmin ? (
          <DropdownMenuItem render={<Link href="/admin/errors" />}>
            <Bug />
            Ошибки
          </DropdownMenuItem>
        ) : null}
        {isAdmin ? (
          <DropdownMenuItem render={<Link href="/admin/clubs" />}>
            <Building2 />
            Клубы
            {pendingClubs > 0 ? <span className="ml-auto rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground">{pendingClubs}</span> : null}
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem render={<Link href={`/feedback?from=${encodeURIComponent(pathname)}`} />}>
          <MessageSquare />
          Обратная связь
        </DropdownMenuItem>
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
        {shop ? (
          <DropdownMenuItem render={<Link href="/shop" />}>
            <Store />
            Магазин
            {coins !== undefined ? (
              <span className="ml-auto text-xs font-semibold text-muted-foreground tabular-nums">
                {coins} {coinWord(coins)}
              </span>
            ) : null}
          </DropdownMenuItem>
        ) : null}
        {catalog ? (
          <DropdownMenuItem render={<Link href="/programs" />}>
            <LibraryBig />
            Каталог программ
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
        {clubs ? (
          <DropdownMenuItem render={<Link href="/clubs" />}>
            <Building2 />
            Клуб
          </DropdownMenuItem>
        ) : null}
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
              // Данные о здоровье из чата помощника (152-ФЗ) не остаются на устройстве после выхода
              prunePain(null);
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
