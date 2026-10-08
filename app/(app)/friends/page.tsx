import type { Metadata } from "next";
import Link from "next/link";
import { Users } from "lucide-react";
import { PageHeader } from "@/components/app/app-shell";
import { ActivityFeed } from "@/components/social/activity-feed";
import { FriendsPanel, InviteBanner, InviteCard } from "@/components/social/friends-panel";
import { NicknameForm } from "@/components/social/nickname-form";
import { requireUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { normalizeFriendCode } from "@/lib/social/league";
import { ensureFriendCode, getFeed, getFriends, getInviter } from "@/lib/social/queries";

export const metadata: Metadata = { title: "Друзья" };

export default async function FriendsPage({ searchParams }: PageProps<"/friends">) {
  const user = await requireUser();
  const params = await searchParams;
  const inviteCode = typeof params.invite === "string" ? normalizeFriendCode(params.invite) : null;

  const [me, code, inviter] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: user.id }, select: { nickname: true, name: true, shareActivity: true } }),
    ensureFriendCode(user.id),
    inviteCode ? getInviter(inviteCode, user.id) : null,
  ]);

  if (!me.nickname) {
    return (
      <div className="space-y-4">
        <PageHeader title="Друзья" description="Лента активности и недельная лига" />
        <div className="flex items-start gap-3 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
          <Users className="mt-0.5 size-5 shrink-0" />
          <p>
            Добавляйте друзей, следите за их тренировками и поддерживайте 👊.
            {inviter ? ` ${inviter.nickname} уже ждёт вас — придумайте ник, чтобы принять приглашение.` : " Для начала придумайте ник."}
          </p>
        </div>
        <div className="max-w-xl">
          <NicknameForm initial={null} suggestion={me.name ?? undefined} />
        </div>
      </div>
    );
  }

  const [feed, friends] = await Promise.all([getFeed(user.id, null), getFriends(user.id)]);

  return (
    <div className="space-y-4">
      <PageHeader title="Друзья" description={`Вы — ${me.nickname}`} />
      {inviteCode && inviter && inviter.status === null ? (
        <InviteBanner code={inviteCode} nickname={inviter.nickname} level={inviter.level} title={inviter.title} />
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <section aria-label="Лента активности" className="min-w-0 space-y-3 lg:col-span-2">
          <h2 className="text-lg font-bold">Лента активности</h2>
          {!me.shareActivity ? (
            <p className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
              Ваши тренировки скрыты от друзей —{" "}
              <Link href="/settings" className="text-primary hover:underline">
                настройки приватности
              </Link>
            </p>
          ) : null}
          {feed.entries.length === 0 ? (
            <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              {feed.friends === 0
                ? "Здесь появятся тренировки — ваши и друзей. Пригласите друга по коду или ссылке."
                : "Пока тихо. Завершите тренировку — она появится здесь и у друзей."}
            </div>
          ) : (
            <ActivityFeed initial={feed.entries} next={feed.next} />
          )}
        </section>

        <div className="min-w-0 space-y-4">
          <InviteCard code={code} />
          <FriendsPanel {...friends} />
          <Link
            href="/leaderboard"
            className="block rounded-xl border bg-card p-4 text-sm transition-colors hover:border-primary/50"
          >
            <span className="font-semibold">Недельная лига →</span>
            <span className="block text-muted-foreground">Места по XP за тренировки среди друзей</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
