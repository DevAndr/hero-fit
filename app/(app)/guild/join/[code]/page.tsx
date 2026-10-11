import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { JoinGuildButton } from "@/components/guild/join-guild";
import { NicknameForm } from "@/components/social/nickname-form";
import { buttonVariants } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { GuildEmblem } from "@/lib/guild/emblem";
import { getGuildByCode } from "@/lib/guild/queries";
import { GUILD_MAX, joinBlock } from "@/lib/guild/rules";

export const metadata: Metadata = { title: "Приглашение в гильдию" };

/** Вступление по ссылке-приглашению: сразу, без заявки. */
export default async function GuildJoinPage({ params }: PageProps<"/guild/join/[code]">) {
  const user = await requireUser();
  const { code } = await params;
  const guild = await getGuildByCode(code);
  if (!guild) notFound();

  const me = await db.user.findUniqueOrThrow({
    where: { id: user.id },
    select: {
      nickname: true,
      name: true,
      guildMember: { select: { guildId: true, guild: { select: { name: true, leaderId: true, _count: { select: { members: true } } } } } },
    },
  });
  const current = me.guildMember;
  const block = joinBlock({
    members: guild.members.length,
    inThis: current?.guildId === guild.id,
    current: current ? { isLeader: current.guild.leaderId === user.id, members: current.guild._count.members } : null,
  });
  if (block === "same") redirect("/guild");

  return (
    <div className="mx-auto max-w-md space-y-5 rounded-2xl border bg-card p-6">
      <div className="flex items-center gap-3">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <GuildEmblem code={guild.emblem} className="size-7" />
        </span>
        <h1 className="text-xl font-bold">Вступить в гильдию «{guild.name}»?</h1>
      </div>
      <div className="space-y-1">
        <p className="text-sm text-muted-foreground tabular-nums">
          Участники · {guild.members.length}/{GUILD_MAX}
        </p>
        <ul className="flex flex-wrap gap-1.5">
          {guild.members.map((m, i) => (
            <li key={i} className="rounded-full border px-2 py-0.5 text-sm">
              {m.user.nickname ?? "Игрок"}
            </li>
          ))}
        </ul>
      </div>
      <p className="text-sm text-muted-foreground">Участники гильдии видят ваш ник, тренировки и опыт за неделю — как друзья.</p>
      {block === "full" ? (
        <>
          <p className="font-semibold text-destructive">В гильдии нет мест</p>
          <Link href="/guild" className={buttonVariants({ variant: "outline" })}>
            К своей гильдии
          </Link>
        </>
      ) : block === "leader" ? (
        <p className="text-sm text-destructive">Вы глава гильдии «{current?.guild.name}» — сначала передайте главенство.</p>
      ) : !me.nickname ? (
        <NicknameForm initial={null} suggestion={me.name ?? undefined} />
      ) : (
        <>
          {current ? <p className="text-sm text-streak">Вы выйдете из «{current.guild.name}».</p> : null}
          <JoinGuildButton code={code} />
        </>
      )}
    </div>
  );
}
