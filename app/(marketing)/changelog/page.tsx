import type { Metadata } from "next";
import { connection } from "next/server";
import { ReleaseList } from "@/components/changelog/release-list";
import { publicReleases } from "@/lib/changelog/public";

export const metadata: Metadata = {
  title: "Что нового",
  description: "Обновления Hero Fit: новые функции, улучшения и исправления — по релизам.",
  alternates: { canonical: "/changelog" },
};

export default async function ChangelogPage() {
  await connection(); // флаги читаются на запрос: раскатка на 100 % открывает пункты без пересборки
  const releases = await publicReleases();
  return (
    <div className="mx-auto w-full max-w-3xl space-y-8 px-4 py-12 sm:py-16">
      <header className="space-y-2">
        <h1 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">Что нового в Hero Fit</h1>
        <p className="text-muted-foreground">Что появилось и стало лучше — по релизам, новые сверху.</p>
      </header>
      <ReleaseList releases={releases} />
    </div>
  );
}
