import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { MapPin } from "lucide-react";
import { cityPath } from "@/lib/club/public";
import { getCityClubs } from "@/lib/club/public-queries";
import { env } from "@/lib/env";
import { plural } from "@/lib/format";
import { absoluteUrl, cityJsonLd, jsonLd } from "@/lib/seo";

export async function generateMetadata({ params }: PageProps<"/gym/[city]">): Promise<Metadata> {
  const { city } = await params;
  const data = await getCityClubs(city);
  if (!data) return {};
  const title = `Тренажёрные залы — ${data.city} · Hero Fit`;
  const description = `Залы города ${data.city} в Hero Fit: рейтинг недели, общие задания клуба и сундуки за тренировки.`;
  return { title: { absolute: title }, description, alternates: { canonical: cityPath(city) }, openGraph: { title, description, url: cityPath(city) } };
}

/** Опубликованные залы города. */
export default async function GymCityPage({ params }: PageProps<"/gym/[city]">) {
  await connection();
  const { city } = await params;
  const data = await getCityClubs(city);
  if (!data) notFound();
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:py-14">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(cityJsonLd({ city: data.city, urls: data.clubs.map((c) => absoluteUrl(env.APP_URL, c.path)) })) }}
      />
      <h1 className="font-display text-3xl font-extrabold tracking-tight text-balance">Залы в Hero Fit — {data.city}</h1>
      <p className="mt-2 text-muted-foreground">Вступайте в клуб своего зала: рейтинг недели и общие задания с теми, кто тренируется рядом.</p>
      <ul className="mt-8 grid gap-3 sm:grid-cols-2">
        {data.clubs.map((c) => (
          <li key={c.path}>
            <Link href={c.path} className="flex h-full flex-col gap-1 rounded-xl border bg-card p-4 transition-colors hover:border-primary/50">
              <span className="font-semibold break-words">{c.name}</span>
              <span className="flex items-start gap-1 text-sm text-muted-foreground">
                <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                {c.address}
              </span>
              <span className="mt-auto pt-2 text-sm tabular-nums">
                {c.members} {plural(c.members, "участник", "участника", "участников")}
                {c.week !== null ? ` · ${c.week} ${plural(c.week, "тренировка", "тренировки", "тренировок")} за неделю` : null}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
