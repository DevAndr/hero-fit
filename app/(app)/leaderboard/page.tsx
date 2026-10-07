import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Users } from "lucide-react";
import { PageHeader } from "@/components/app/app-shell";
import { FriendsPanel, InviteBanner, InviteCard } from "@/components/social/friends-panel";
import { LeagueTable } from "@/components/social/league-table";
import { NicknameForm } from "@/components/social/nickname-form";
import { TIMEZONE_COOKIE } from "@/lib/achievements/daily-visit";
import { requireUser } from "@/lib/auth/dal";
import { safeTimeZone } from "@/lib/daily-login";
import { db } from "@/lib/db";
import { MIN_PERCENTILE_POPULATION, normalizeFriendCode } from "@/lib/social/league";
import { ensureFriendCode, getFriends, getInviter, getLeague, getPercentile } from "@/lib/social/queries";

export const metadata: Metadata = { title: "Рейтинг" };

function PercentileCard({ percentile, myXp }: { percentile: number | null; myXp: number }) {
  return (
    <section aria-label="Среди всех атлетов" className="space-y-2 rounded-xl border bg-card p-4">
      <h2 className="text-sm text-muted-foreground">Среди всех атлетов</h2>
      {percentile === null ? (
        <p className="text-sm text-muted-foreground">
          Сравнение появится, когда активных атлетов будет хотя бы {MIN_PERCENTILE_POPULATION}.
        </p>
      ) : myXp === 0 ? (
        <p className="text-sm text-muted-foreground">Потренируйтесь на этой неделе — и узнаете, обгоняете ли вы других.</p>
      ) : (
        <>
          <p className="text-2xl font-bold" data-testid="percentile">
            Выше, чем у {percentile}%
          </p>
          <div
            role="meter"
            aria-label="Процентиль"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percentile}
            className="h-2 overflow-hidden rounded-full bg-primary/15"
          >
            <div className="h-full rounded-full bg-primary" style={{ width: `${percentile}%` }} />
          </div>
          <p className="text-xs text-muted-foreground">
            XP за тренировки на этой неделе в сравнении с атлетами, которые тренировались последние 4 недели. Анонимно.
          </p>
        </>
      )}
    </section>
  );
}

export default async function LeaderboardPage({ searchParams }: PageProps<"/leaderboard">) {
  const user = await requireUser();
  const params = await searchParams;
  const previous = params.week === "prev";
  const inviteCode = typeof params.invite === "string" ? normalizeFriendCode(params.invite) : null;
  const timeZone = safeTimeZone((await cookies()).get(TIMEZONE_COOKIE)?.value);

  const [me, code, rank, inviter] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: user.id }, select: { nickname: true, name: true } }),
    ensureFriendCode(user.id),
    getPercentile(user.id, timeZone),
    inviteCode ? getInviter(inviteCode, user.id) : null,
  ]);

  const banner =
    inviteCode && inviter && inviter.status === null && me.nickname ? (
      <InviteBanner code={inviteCode} nickname={inviter.nickname} level={inviter.level} />
    ) : null;

  if (!me.nickname) {
    return (
      <div className="space-y-4">
        <PageHeader title="Рейтинг" description="Недельная лига с друзьями" />
        <div className="flex items-start gap-3 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
          <Users className="mt-0.5 size-5 shrink-0" />
          <p>
            Соревнуйтесь с друзьями: каждую неделю — новая лига, места по XP за тренировки и рекорды.
            {inviter ? ` ${inviter.nickname} уже ждёт вас — придумайте ник, чтобы принять приглашение.` : " Для начала придумайте ник."}
          </p>
        </div>
        <div className="max-w-xl">
          <NicknameForm initial={null} suggestion={me.name ?? undefined} />
        </div>
        <div className="max-w-xl">
          <PercentileCard percentile={rank.percentile} myXp={rank.myXp} />
        </div>
      </div>
    );
  }

  const [league, friends] = await Promise.all([getLeague(user.id, timeZone, previous ? 1 : 0), getFriends(user.id)]);

  return (
    <div className="space-y-4">
      <PageHeader title="Рейтинг" description={`Вы в лиге как ${me.nickname}`} />
      {banner}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="min-w-0 space-y-4 lg:col-span-2">
          <LeagueTable members={league.members} weekStart={league.weekStart} previous={previous} />
          {league.friends === 0 ? (
            <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
              В лиге пока только вы. Пригласите друзей — места обновляются после каждой тренировки, а в понедельник
              начинается новая неделя.
            </p>
          ) : null}
        </div>
        <div className="min-w-0 space-y-4">
          <PercentileCard percentile={rank.percentile} myXp={rank.myXp} />
          <InviteCard code={code} />
        </div>
      </div>
      <FriendsPanel {...friends} />
    </div>
  );
}
