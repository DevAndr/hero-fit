import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { BadgeCheck, MapPin } from "lucide-react";
import { PublicClubTasks } from "@/components/club/public-club-tasks";
import { buttonVariants } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth/dal";
import { clubPath, MIN_MEMBERS_FOR_STATS, visibleClubStats } from "@/lib/club/public";
import { getClubPublicStats, resolveClubPage } from "@/lib/club/public-queries";
import { getClubTasks } from "@/lib/club/tasks-queries";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { absoluteUrl, clubJsonLd, jsonLd, shortDescription } from "@/lib/seo";

const STEPS = [
  "Нажмите «Вступить» и создайте аккаунт — это бесплатно",
  "Тренируйтесь и поднимайтесь в рейтинге зала",
  "Выполняйте задания клуба вместе и открывайте сундуки",
];

export async function generateMetadata({ params }: PageProps<"/gym/[city]/[slug]">): Promise<Metadata> {
  const { city, slug } = await params;
  // Закрытая страница — ни названия, ни описания в ответе
  const page = await resolveClubPage(city, slug, await getCurrentUser());
  if (!page) return {};
  const { club } = page;
  const title = `${club.name} — тренажёрный зал, ${club.city} · Hero Fit`;
  const description = shortDescription(club.about);
  const path = clubPath(club.citySlug, club.slug);
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: path },
    openGraph: { title, description, url: path },
    ...(page.access === "preview" ? { robots: { index: false, follow: false } } : {}),
  };
}

/** Публичная страница клуба: общие цифры без ников, активные задания и «Вступить». */
export default async function GymPage({ params }: PageProps<"/gym/[city]/[slug]">) {
  await connection();
  const { city, slug } = await params;
  const viewer = await getCurrentUser();
  const page = await resolveClubPage(city, slug, viewer);
  if (!page) notFound();
  const { club, access } = page;
  const path = clubPath(club.citySlug, club.slug);

  const [stats, tasks, membership] = await Promise.all([
    getClubPublicStats(club.id),
    getClubTasks(club.id, viewer?.id ?? "", false, "UTC"),
    viewer ? db.clubMember.findUnique({ where: { userId: viewer.id }, select: { clubId: true } }) : null,
  ]);
  const shown = visibleClubStats(stats);
  const isMember = membership?.clubId === club.id;
  const isClubAdmin = viewer?.id === club.adminId;

  const join = (
    // prefetch={false}: /join — route handler с целью Метрики, предзагрузка засчитывала бы её на каждый просмотр
    <Link href={`${path}/join`} prefetch={false} className={buttonVariants({ size: "lg" })}>
      Вступить
    </Link>
  );
  const action = isMember ? (
    <div className="flex flex-wrap items-center gap-3">
      <p className="flex items-center gap-2 font-medium text-primary">
        <BadgeCheck className="size-5" aria-hidden />
        Вы в этом клубе
      </p>
      <Link href={`/clubs/${club.id}`} className={buttonVariants({ variant: "outline" })}>
        Открыть клуб
      </Link>
      {isClubAdmin ? (
        <Link href={`/clubs/${club.id}/manage#public`} className={buttonVariants({ variant: "outline" })}>
          Редактировать
        </Link>
      ) : null}
    </div>
  ) : isClubAdmin ? (
    <Link href={`/clubs/${club.id}/manage#public`} className={buttonVariants({ variant: "outline" })}>
      Редактировать
    </Link>
  ) : access === "open" ? (
    join
  ) : null;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:py-14">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd(
            clubJsonLd({ name: club.name, url: absoluteUrl(env.APP_URL, path), city: club.city, address: club.address, description: shortDescription(club.about) }),
          ),
        }}
      />
      {access === "preview" ? (
        <p className="mb-6 rounded-lg border border-streak/40 bg-streak/10 p-3 text-sm">Страница пока не видна в поиске</p>
      ) : null}

      <header className="space-y-2">
        <p className="text-sm font-semibold tracking-wide text-primary uppercase">Тренажёрный зал · {club.city}</p>
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-balance break-words">{club.name}</h1>
        <p className="flex items-start gap-1.5 text-muted-foreground">
          <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            {club.city}, {club.address}
          </span>
        </p>
      </header>

      {action ? <div className="mt-6">{action}</div> : null}

      <section aria-label="Цифры клуба" className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {shown.map((s) => (
          <div key={s.code} className="rounded-xl border bg-card p-4">
            <p className="font-display text-2xl font-extrabold tabular-nums">{s.value}</p>
            <p className="mt-1 text-sm text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </section>

      {club.about ? (
        <section aria-labelledby="about" className="mt-8">
          <h2 id="about" className="font-display text-xl font-bold">
            О зале
          </h2>
          <p className="mt-3 whitespace-pre-line text-pretty break-words">{club.about}</p>
        </section>
      ) : null}

      <PublicClubTasks tasks={tasks.active} showProgress={stats.members >= MIN_MEMBERS_FOR_STATS} />

      <section aria-labelledby="how" className="mt-10 rounded-2xl border bg-card p-5 sm:p-6">
        <h2 id="how" className="font-display text-xl font-bold">
          Как это работает
        </h2>
        <ol className="mt-4 space-y-3">
          {STEPS.map((step, i) => (
            <li key={step} className="flex gap-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-bold text-primary">
                {i + 1}
              </span>
              <span className="pt-0.5">{step}</span>
            </li>
          ))}
        </ol>
        {!isMember && !isClubAdmin && access === "open" ? <div className="mt-6">{join}</div> : null}
      </section>
    </div>
  );
}
