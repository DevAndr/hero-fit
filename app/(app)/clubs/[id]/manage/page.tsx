import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app/app-shell";
import { EditClubButton } from "@/components/club/edit-club";
import { ClubInvite, ClubMembersManage, TransferClub } from "@/components/club/manage-club";
import { ManagePublicPage } from "@/components/club/manage-public-page";
import { ManageTasks } from "@/components/club/manage-tasks";
import { builtinExercises, getManageTasks } from "@/lib/club/tasks-queries";
import { buttonVariants } from "@/components/ui/button";
import { requireClubs } from "@/lib/club/access";
import { clubPath } from "@/lib/club/public";
import { getClubManage } from "@/lib/club/queries";
import { isEnabled } from "@/lib/flags/server";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "Управление клубом" };

/** Управление клубом — только его админ: правка, приглашение и QR, публичная страница, задания, участники, блокировки, передача. */
export default async function ManageClubPage({ params }: PageProps<"/clubs/[id]/manage">) {
  const user = await requireClubs();
  const { id } = await params;
  const data = await getClubManage(id, user.id);
  if (!data || data.club.status === "PENDING" || data.club.status === "REJECTED") notFound();
  const { club } = data;
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader
        title={club.name}
        description={`${club.city}, ${club.address}`}
        actions={
          <>
            <EditClubButton club={club} />
            <Link href={`/clubs/${club.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
              Страница клуба
            </Link>
          </>
        }
      />
      {club.status === "HIDDEN" ? (
        <p role="status" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          Клуб скрыт модератором: его нет в поиске, вступить нельзя.
        </p>
      ) : (
        <ClubInvite clubId={club.id} url={new URL(`/clubs/join/${club.code}`, env.APP_URL).toString()} />
      )}
      <ManagePublicPage
        clubId={club.id}
        status={club.status}
        about={data.page.about}
        published={data.page.published}
        url={data.page.slug && data.page.citySlug ? new URL(clubPath(data.page.citySlug, data.page.slug), env.APP_URL).toString() : null}
        flagFull={await isEnabled("clubs", null)}
      />
      {club.status === "APPROVED" ? <ManageTasks clubId={club.id} tasks={await getManageTasks(club.id)} exercises={await builtinExercises()} /> : null}
      <ClubMembersManage clubId={club.id} meId={user.id} members={data.members} banned={data.banned} />
      <TransferClub clubId={club.id} />
    </div>
  );
}
