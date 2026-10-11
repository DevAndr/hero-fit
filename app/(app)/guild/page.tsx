import type { Metadata } from "next";
import { Shield } from "lucide-react";
import { PageHeader } from "@/components/app/app-shell";
import { CreateGuildButton, GuildSettingsButton, JoinByCode } from "@/components/guild/guild-forms";
import { GuildInvite, GuildMembers, LeaveGuild } from "@/components/guild/guild-members";
import { ActivityFeed } from "@/components/social/activity-feed";
import { NicknameForm } from "@/components/social/nickname-form";
import { requireUser } from "@/lib/auth/dal";
import { safeTimeZone } from "@/lib/daily-login";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { GuildEmblem } from "@/lib/guild/emblem";
import { getMyGuild } from "@/lib/guild/queries";
import { GUILD_MAX, leaveBlock } from "@/lib/guild/rules";
import { getGuildFeed } from "@/lib/social/queries";

export const metadata: Metadata = { title: "Гильдия" };

export default async function GuildPage() {
  const user = await requireUser();
  const [me, guild, feed] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: user.id }, select: { nickname: true, name: true } }),
    getMyGuild(user.id, safeTimeZone(user.timeZone)),
    getGuildFeed(user.id, null),
  ]);

  if (!guild) {
    return (
      <div className="space-y-4">
        <PageHeader title="Гильдия" description="Тренируйтесь командой до 10 человек" />
        <div className="flex items-start gap-3 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
          <Shield className="mt-0.5 size-5 shrink-0" />
          <p>
            В гильдии видно, кто как тренируется на этой неделе, а вместе вы будете бить рейд-босса.
            {me.nickname ? " Создайте свою или вступите по ссылке друга." : " Для начала придумайте ник — его увидят участники гильдии."}
          </p>
        </div>
        {me.nickname ? (
          <div className="flex flex-wrap items-center gap-3">
            <CreateGuildButton />
            <JoinByCode />
          </div>
        ) : (
          <div className="max-w-xl">
            <NicknameForm initial={null} suggestion={me.name ?? undefined} />
          </div>
        )}
      </div>
    );
  }

  const iLead = guild.leaderId === user.id;
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <GuildEmblem code={guild.emblem} className="size-7" />
          </span>
          <div>
            <h1 className="text-2xl font-bold">{guild.name}</h1>
            <p className="text-sm text-muted-foreground tabular-nums">
              {guild.members.length}/{GUILD_MAX} участников
            </p>
          </div>
        </div>
        {iLead ? <GuildSettingsButton name={guild.name} emblem={guild.emblem} /> : null}
      </div>
      <section aria-label="Состав" className="space-y-2">
        <h2 className="font-bold">Состав · эта неделя</h2>
        <GuildMembers members={guild.members} meId={user.id} iLead={iLead} />
      </section>
      <section aria-label="Лента гильдии" className="space-y-3">
        <h2 className="font-bold">Лента гильдии</h2>
        {feed.entries.length ? (
          <ActivityFeed initial={feed.entries} next={feed.next} source="guild" />
        ) : (
          <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">Здесь появятся тренировки участников — поддерживайте их 👊.</p>
        )}
      </section>
      <GuildInvite url={new URL(`/guild/join/${guild.code}`, env.APP_URL).toString()} code={guild.code} iLead={iLead} />
      <LeaveGuild blocked={leaveBlock(iLead, guild.members.length)} />
    </div>
  );
}
