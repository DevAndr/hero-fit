import Link from "next/link";
import type { ReactNode } from "react";
import { Dumbbell, Play } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { StreakFlame } from "@/components/lottie/streak-flame";
import { XpBar } from "@/components/progress/xp-bar";
import { BottomNav, SidebarNav } from "@/components/app/nav-links";
import { UserMenu } from "@/components/app/user-menu";
import type { Cosmetics } from "@/lib/shop/cosmetics";
import type { CurrentUser } from "@/lib/auth/dal";
import { levelProgress } from "@/lib/progress/level";
import { safeTimeZone } from "@/lib/daily-login";
import { streakHint } from "@/lib/progress/streak-copy";
import { streakStatus, streakValue } from "@/lib/progress/weekly-streak";
import { cn } from "@/lib/utils";

function Logo() {
  return (
    <Link href="/dashboard" className="flex items-center gap-2 font-black tracking-tight">
      <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <Dumbbell className="size-4" />
      </span>
      <span className="text-lg">Hero Fit</span>
    </Link>
  );
}

function LevelMeter({ xp }: { xp: number }) {
  const { level, current, required, percent } = levelProgress(xp);
  return (
    <div className="flex min-w-0 items-center gap-2" title={`${current} / ${required} XP до уровня ${level + 1}`}>
      <span className="shrink-0 rounded-md bg-xp/15 px-1.5 py-0.5 text-xs font-bold text-xp">LVL {level}</span>
      <div className="hidden w-32 sm:block">
        <XpBar level={level} percent={percent} size="sm" label={`Опыт уровня ${level}`} />
        <p className="mt-0.5 text-[10px] text-muted-foreground tabular-nums">
          {current} / {required} XP
        </p>
      </div>
    </div>
  );
}

function StreakBadge({ user }: { user: CurrentUser }) {
  const status = streakStatus(user, new Date(), safeTimeZone(user.timeZone));
  const weeks = streakValue(status);
  return (
    <span
      className={cn(
        "flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-bold tabular-nums",
        weeks > 0 ? "bg-streak/15 text-streak" : "bg-muted text-muted-foreground",
      )}
      title={streakHint(status)}
      data-testid="header-streak"
    >
      <StreakFlame active={weeks > 0} loop={3} className="size-3.5" />
      {weeks}
    </span>
  );
}

export function AppShell({
  user,
  chest,
  notifications,
  alerts,
  whatsNewUnseen = false,
  pendingClubs = 0,
  newFeedback = 0,
  cosmetics,
  coins,
  children,
}: {
  user: CurrentUser;
  /** Есть непросмотренный видимый релиз «Что нового» (с учётом флагов — считает layout). */
  whatsNewUnseen?: boolean;
  /** Заявок на клубы на проверке — только админу приложения. */
  pendingClubs?: number;
  /** Новых обращений в обратную связь — только админу. */
  newFeedback?: number;
  /** Надетая косметика пользователя (для меню профиля). */
  cosmetics?: Cosmetics;
  /** Баланс монет для меню профиля (при включённом магазине). */
  coins?: number;
  /** Ежедневный сундук (значок, пока не открыт). */
  chest?: ReactNode;
  notifications?: ReactNode;
  /** Системные оповещения: строки над шапкой (уезжают при прокрутке) и попап. */
  alerts?: ReactNode;
  children: ReactNode;
}) {
  return (
    // ym-hide-content — вебвизор Метрики не записывает текст кабинета (веса, ники, почта)
    <div className="ym-hide-content flex min-h-full flex-1">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-6 border-r p-4 lg:flex">
        <Logo />
        <SidebarNav isCoach={user.isCoach} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {alerts}
        <header className="sticky top-0 z-30 flex h-[calc(3.5rem+var(--tg-safe-top))] items-center pt-(--tg-safe-top) gap-3 border-b bg-background/95 px-4 backdrop-blur">
          <div className="lg:hidden">
            <Logo />
          </div>
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <LevelMeter xp={user.xp} />
            <StreakBadge user={user} />
            {chest}
            <Link href="/training" className={cn(buttonVariants(), "hidden sm:inline-flex")}>
              <Play />
              Начать тренировку
            </Link>
            {notifications}
            <UserMenu name={user.name} login={user.login} email={user.email} isCoach={user.isCoach}
              isAdmin={user.isAdmin}
              unseen={whatsNewUnseen}
              pendingClubs={pendingClubs}
              newFeedback={newFeedback}
              cosmetics={cosmetics}
              coins={coins}
            />
          </div>
        </header>

        <main className="flex-1 px-4 pt-6 pb-[calc(6rem+var(--tg-safe-bottom))] lg:px-8 lg:pb-10">{children}</main>
      </div>

      <BottomNav isCoach={user.isCoach} />
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-black tracking-tight break-words sm:text-3xl">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex max-w-full flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}
