import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Settings } from "lucide-react";
import { PageHeader } from "@/components/app/app-shell";
import { ClubFeed } from "@/components/club/club-feed";
import { ClubRatingTable } from "@/components/club/club-rating";
import { InviteButton } from "@/components/club/invite-dialog";
import { JoinClubButton, LeaveClubButton } from "@/components/club/join-club";
import { SegmentNav } from "@/components/club/segment-nav";
import { buttonVariants } from "@/components/ui/button";
import { requireClubs } from "@/lib/club/access";
import { getClubFeed, getClubPage, getClubRating } from "@/lib/club/queries";
import { safeTimeZone } from "@/lib/daily-login";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "Клуб" };

const membersText = (n: number) => {
  const mod10 = n % 10;
  const mod100 = n % 100;
  const word = mod10 === 1 && mod100 !== 11 ? "участник" : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? "участника" : "участников";
  return `${n} ${word}`;
};

/** Страница клуба: участнику — рейтинг и лента; остальным — шапка, топ-3 недели и «Вступить». */
export default async function ClubPage({ params, searchParams }: PageProps<"/clubs/[id]">) {
  const user = await requireClubs();
  const { id } = await params;
  const query = await searchParams;
  const club = await getClubPage(id, user.id);
  if (!club) notFound();
  // Видимость по статусу: на проверке и отклонённая — только своему админу, скрытая — участникам и админу
  if (club.status === "PENDING" || club.status === "REJECTED") {
    if (!club.isAdmin) notFound();
  } else if (club.status === "HIDDEN" && !club.isAdmin && !club.isMember) notFound();

  const timeZone = safeTimeZone(user.timeZone);
  const live = club.status === "APPROVED";
  const inside = club.isMember || club.isAdmin;
  const tab = query.tab === "feed" && club.isMember ? "feed" : "rating";
  const period = query.period === "month" ? "month" : "week";
  const base = `/clubs/${club.id}`;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader
        title={club.name}
        description={`${club.city}, ${club.address} · ${membersText(club.members)}`}
        actions={
          <>
            {live && inside && club.code ? <InviteButton url={new URL(`/clubs/join/${club.code}`, env.APP_URL).toString()} clubName={club.name} /> : null}
            {club.isAdmin && club.status !== "PENDING" && club.status !== "REJECTED" ? (
              <Link href={`${base}/manage`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                <Settings />
                Управление
              </Link>
            ) : null}
            {club.isMember ? <LeaveClubButton /> : null}
          </>
        }
      />

      {club.status === "PENDING" ? <Notice>На проверке: клуб появится в поиске после одобрения.</Notice> : null}
      {club.status === "REJECTED" ? <Notice tone="destructive">Заявка отклонена: {club.rejectReason}</Notice> : null}
      {club.status === "HIDDEN" ? <Notice tone="destructive">Клуб скрыт модератором: его нет в поиске, вступить нельзя.</Notice> : null}

      {live && !club.isMember ? (
        <div className="space-y-2 rounded-xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">Участники клуба увидят твой ник, уровень, опыт и достижения. Тренировки — нет.</p>
          {club.banned ? <p className="text-sm text-destructive">Админ клуба ограничил вступление</p> : <JoinClubButton clubId={club.id} />}
        </div>
      ) : null}

      {club.isMember ? (
        <>
          <SegmentNav
            label="Разделы клуба"
            current={tab}
            items={[
              { key: "rating", label: "Рейтинг", href: base },
              { key: "feed", label: "Лента", href: `${base}?tab=feed` },
            ]}
          />
          {tab === "feed" ? (
            <ClubFeed clubId={club.id} initial={await getClubFeed(club.id, user.id, null)} />
          ) : (
            <section aria-label="Рейтинг" className="space-y-3">
              <SegmentNav
                label="Период"
                current={period}
                items={[
                  { key: "week", label: "Неделя", href: base },
                  { key: "month", label: "Месяц", href: `${base}?period=month` },
                ]}
              />
              <p className="text-sm text-muted-foreground">XP за тренировки и рекорды</p>
              <ClubRatingTable rating={await getClubRating(club.id, user.id, timeZone, period)} periodLabel={period === "week" ? "эту неделю" : "этот месяц"} />
            </section>
          )}
        </>
      ) : club.status !== "PENDING" && club.status !== "REJECTED" ? (
        <section aria-label="Рейтинг" className="space-y-2">
          <h2 className="font-bold">Лучшие на этой неделе</h2>
          <ClubRatingTable rating={await getClubRating(club.id, user.id, timeZone, "week", 3)} periodLabel="эту неделю" />
        </section>
      ) : null}

      <p className="text-sm">
        <Link href="/clubs?list=1" className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
          Найти другой клуб
        </Link>
      </p>
    </div>
  );
}

function Notice({ children, tone = "muted" }: { children: React.ReactNode; tone?: "muted" | "destructive" }) {
  return (
    <p role="status" className={tone === "destructive" ? "rounded-lg bg-destructive/10 p-3 text-sm text-destructive" : "rounded-lg bg-muted p-3 text-sm"}>
      {children}
    </p>
  );
}
