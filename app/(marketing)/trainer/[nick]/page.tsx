import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { BadgeCheck, MapPin } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth/dal";
import { FORMAT_LABELS, SPECIALTIES, visibleStats } from "@/lib/coach/profile";
import { getCoachPublicStats, getPublicCoach } from "@/lib/coach/profile-queries";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { absoluteUrl, coachDescription, coachJsonLd, jsonLd } from "@/lib/seo";
import { telegramEnabled } from "@/lib/telegram/format";
import { telegramJoinUrl } from "@/lib/telegram/links";
import { cn } from "@/lib/utils";

const findCoach = cache((nick: string) => getPublicCoach(nick));

const STEPS = [
  "Нажмите «Заниматься» и создайте аккаунт — это бесплатно",
  "Разрешите тренеру видеть ваши тренировки",
  "Тренер назначает тренировки, а вы качаетесь в приложении с уровнями, ачивками и боссами",
];

const nameOf = (c: NonNullable<Awaited<ReturnType<typeof getPublicCoach>>>) => c.profile.displayName ?? c.nickname;
const pathOf = (nickname: string) => `/trainer/${encodeURIComponent(nickname)}`;

export async function generateMetadata({ params }: PageProps<"/trainer/[nick]">): Promise<Metadata> {
  const { nick } = await params;
  const coach = await findCoach(nick);
  if (!coach) return {};
  // Неопубликованная — ни имени, ни описания в ответе (кроме предпросмотра самого тренера)
  if (!coach.profile.publishedAt && (await getCurrentUser())?.id !== coach.id) return {};
  const title = `${nameOf(coach)} — тренер${coach.profile.city ? `, ${coach.profile.city}` : ""} · Hero Fit`;
  const description = coachDescription(coach.profile.about);
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: pathOf(coach.nickname) },
    openGraph: { title, description, url: pathOf(coach.nickname) },
    ...(coach.profile.publishedAt ? {} : { robots: { index: false, follow: false } }),
  };
}

export default async function TrainerPage({ params }: PageProps<"/trainer/[nick]">) {
  await connection();
  const { nick } = await params;
  const coach = await findCoach(nick);
  if (!coach) notFound();
  const viewer = await getCurrentUser();
  const isOwner = viewer?.id === coach.id;
  if (!coach.profile.publishedAt && !isOwner) notFound();

  const [stats, link] = await Promise.all([
    getCoachPublicStats(coach.id, new Date(), coach.profile.hiddenStats),
    viewer && !isOwner ? db.coachLink.findFirst({ where: { coachId: coach.id, clientId: viewer.id, endedAt: null }, select: { id: true } }) : null,
  ]);
  const shown = visibleStats(stats, coach.profile.hiddenStats);
  const name = nameOf(coach);
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  const specialties = coach.profile.specialties.map((c) => SPECIALTIES[c]).filter(Boolean);
  const url = absoluteUrl(env.APP_URL, pathOf(coach.nickname));
  const telegramUrl = coach.coachCode && telegramEnabled(env) ? telegramJoinUrl(coach.coachCode, env.TELEGRAM_BOT_USERNAME) : null;

  const action = isOwner ? (
    <div className="flex flex-wrap items-center gap-3">
      <p className="text-sm text-muted-foreground">Это ваша страница</p>
      <Link href="/coach/page" className={buttonVariants({ variant: "outline" })}>
        Редактировать
      </Link>
    </div>
  ) : link ? (
    <p className="flex items-center gap-2 font-medium text-primary">
      <BadgeCheck className="size-5" aria-hidden />
      Вы занимаетесь с этим тренером
    </p>
  ) : (
    <div className="flex flex-wrap gap-3">
      {/* prefetch={false}: /join — route handler с целью Метрики, предзагрузка засчитывала бы её на каждый просмотр */}
      <Link href={`${pathOf(coach.nickname)}/join`} prefetch={false} className={buttonVariants({ size: "lg" })}>
        Заниматься
      </Link>
      {telegramUrl ? (
        <a href={telegramUrl} className={buttonVariants({ variant: "outline", size: "lg" })}>
          Заниматься в Telegram
        </a>
      ) : null}
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:py-14">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(coachJsonLd({ name, url, city: coach.profile.city, specialties })) }}
      />
      {!coach.profile.publishedAt ? (
        <p className="mb-6 rounded-lg border border-streak/40 bg-streak/10 p-3 text-sm">Страница не опубликована — её видите только вы</p>
      ) : null}

      <header className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <div
          aria-hidden
          className="flex size-20 shrink-0 items-center justify-center rounded-2xl bg-linear-to-br from-primary to-chart-2 font-display text-2xl font-extrabold text-primary-foreground"
        >
          {initials}
        </div>
        <div className="min-w-0 space-y-2">
          <h1 className="font-display text-3xl font-extrabold tracking-tight text-balance">{name}</h1>
          <p className="flex flex-wrap items-center gap-x-2 text-muted-foreground">
            <span>Тренер</span>
            {coach.profile.city ? (
              <span className="flex items-center gap-1">
                · <MapPin className="size-4" aria-hidden /> {coach.profile.city}
              </span>
            ) : null}
            <span>· {FORMAT_LABELS[coach.profile.format]}</span>
          </p>
          {specialties.length ? (
            <ul className="flex flex-wrap gap-1.5" aria-label="Специализации">
              {specialties.map((s) => (
                <li key={s} className="rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-semibold text-primary">
                  {s}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </header>

      <div className="mt-6">{action}</div>

      {shown.length ? (
        <section aria-label="Цифры" className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {shown.map((s) => (
            <div key={s.code} className={cn("rounded-xl border bg-card p-4", s.code === "since" && "col-span-2 sm:col-span-1")}>
              <p className="font-display text-2xl font-extrabold tabular-nums">{s.value}</p>
              <p className="mt-1 text-sm text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </section>
      ) : null}

      {coach.profile.about ? (
        <section aria-labelledby="about" className="mt-8">
          <h2 id="about" className="font-display text-xl font-bold">
            О себе
          </h2>
          <p className="mt-3 whitespace-pre-line text-pretty">{coach.profile.about}</p>
        </section>
      ) : null}

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
        {!isOwner && !link ? <div className="mt-6">{action}</div> : null}
      </section>
    </div>
  );
}
