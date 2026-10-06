import Link from "next/link";
import type { ReactNode } from "react";
import { Dumbbell, Flame, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BottomNav, SidebarNav } from "@/components/app/nav-links";
import { UserMenu } from "@/components/app/user-menu";
import type { CurrentUser } from "@/lib/auth/dal";
import { levelProgress } from "@/lib/progress/level";
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
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-xp" style={{ width: `${percent}%` }} />
        </div>
        <p className="mt-0.5 text-[10px] text-muted-foreground tabular-nums">
          {current} / {required} XP
        </p>
      </div>
    </div>
  );
}

function StreakBadge({ days }: { days: number }) {
  return (
    <span
      className={cn(
        "flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-bold tabular-nums",
        days > 0 ? "bg-streak/15 text-streak" : "bg-muted text-muted-foreground",
      )}
      title="Streak — тренировки без перерыва больше 24 часов"
    >
      <Flame className="size-3.5" />
      {days}
    </span>
  );
}

export function AppShell({ user, children }: { user: CurrentUser; children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-1">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-6 border-r p-4 lg:flex">
        <Logo />
        <SidebarNav />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur">
          <div className="lg:hidden">
            <Logo />
          </div>
          <div className="ml-auto flex items-center gap-3">
            <LevelMeter xp={user.xp} />
            <StreakBadge days={user.currentStreak} />
            <Button className="hidden sm:inline-flex" nativeButton={false} render={<Link href="/training" />}>
              <Play />
              Начать тренировку
            </Button>
            <UserMenu name={user.name} login={user.login} email={user.email} />
          </div>
        </header>

        <main className="flex-1 px-4 pt-6 pb-24 lg:px-8 lg:pb-10">{children}</main>
      </div>

      <BottomNav />
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
      <div>
        <h1 className="text-2xl font-black tracking-tight sm:text-3xl">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex gap-2">{actions}</div> : null}
    </div>
  );
}
