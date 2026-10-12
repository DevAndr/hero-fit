import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Building2 } from "lucide-react";
import { JoinClubButton } from "@/components/club/join-club";
import { NicknameForm } from "@/components/social/nickname-form";
import { requireClubs } from "@/lib/club/access";
import { getClubByCode, getClubPage, getMyMembership } from "@/lib/club/queries";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Приглашение в клуб" };

/** Вступление по ссылке или QR: экран согласия, сразу без заявки. */
export default async function ClubJoinPage({ params }: PageProps<"/clubs/join/[code]">) {
  const user = await requireClubs();
  const { code } = await params;
  const club = await getClubByCode(code);
  if (!club) notFound();
  const [page, current, me] = await Promise.all([
    getClubPage(club.id, user.id),
    getMyMembership(user.id),
    db.user.findUniqueOrThrow({ where: { id: user.id }, select: { nickname: true, name: true } }),
  ]);
  if (page?.isMember) redirect(`/clubs/${club.id}`);

  return (
    <div className="mx-auto max-w-md space-y-5 rounded-2xl border bg-card p-6">
      <div className="flex items-center gap-3">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary" aria-hidden>
          <Building2 className="size-6" />
        </span>
        <div className="min-w-0">
          <h1 className="text-xl font-black break-words">Вступить в клуб «{club.name}»?</h1>
          <p className="text-sm text-muted-foreground">
            {club.city}, {club.address}
          </p>
        </div>
      </div>
      <p className="text-sm">Участники клуба увидят твой ник, уровень, опыт и достижения. Тренировки — нет.</p>
      {page?.banned ? (
        <p className="text-sm text-destructive">Админ клуба ограничил вступление</p>
      ) : !me.nickname ? (
        <NicknameForm initial={null} suggestion={me.name ?? undefined} />
      ) : (
        <>
          {current ? <p className="text-sm text-streak">Ты выйдешь из «{current.name}».</p> : null}
          <JoinClubButton clubId={club.id} />
        </>
      )}
    </div>
  );
}
