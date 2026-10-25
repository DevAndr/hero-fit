import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SearchX } from "lucide-react";
import { TrainerCard } from "@/components/coach/catalog-card";
import { buttonVariants } from "@/components/ui/button";
import { queueGoal } from "@/lib/analytics/queue";
import { getCurrentUser } from "@/lib/auth/dal";
import { CATALOG_PAGE_SIZE, catalogFilterSchema, type CatalogFilter } from "@/lib/coach/catalog";
import { getCatalog, getCatalogCities } from "@/lib/coach/catalog-queries";
import { FORMAT_LABELS, SPECIALTIES } from "@/lib/coach/profile";
import { isEnabled } from "@/lib/flags/server";

// Каталог тренеров (спека 2026-10-25-coach-catalog): флаг — смотрящего, проверяется на каждый запрос
export const dynamic = "force-dynamic";

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const parse = (params: Record<string, string | string[] | undefined>) =>
  catalogFilterSchema.parse({ city: first(params.city), format: first(params.format), specialty: first(params.specialty), page: first(params.page) });

const hrefOf = (f: CatalogFilter, page = f.page) => {
  const q = new URLSearchParams();
  if (f.city) q.set("city", f.city);
  if (f.format) q.set("format", f.format);
  if (f.specialty) q.set("specialty", f.specialty);
  if (page > 1) q.set("page", String(page));
  const s = q.toString();
  return s ? `/trainers?${s}` : "/trainers";
};

export async function generateMetadata({ searchParams }: PageProps<"/trainers">): Promise<Metadata> {
  const f = parse(await searchParams);
  const filtered = Boolean(f.city || f.format || f.specialty || f.page > 1);
  return {
    title: { absolute: "Тренеры Hero Fit — найдите тренера" },
    description: "Каталог тренеров Hero Fit: выберите город, формат и специализацию и свяжитесь с тренером напрямую.",
    alternates: { canonical: "/trainers" },
    // В индексе — только сам каталог, не каждая комбинация фильтров
    ...(filtered ? { robots: { index: false, follow: true } } : {}),
  };
}

const selectClass =
  "h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export default async function TrainersPage({ searchParams }: PageProps<"/trainers">) {
  const viewer = await getCurrentUser();
  if (!(await isEnabled("coach_catalog", viewer?.id ?? null))) notFound();
  const f = parse(await searchParams);
  const [{ items, total }, cities] = await Promise.all([getCatalog(f), getCatalogCities()]);
  await queueGoal("trainers_catalog_view");
  const here = hrefOf(f);
  const hasMore = f.page * CATALOG_PAGE_SIZE < total;
  const filtered = Boolean(f.city || f.format || f.specialty);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-10 sm:py-14">
      <header className="space-y-2">
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Тренеры Hero Fit</h1>
        <p className="text-pretty text-muted-foreground">
          Найдите тренера по городу, формату и специализации и свяжитесь с ним напрямую — а тренировки ведите в Hero Fit.
        </p>
      </header>

      <form action="/trainers" method="get" aria-label="Фильтры" className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
        <label className="grid gap-1.5 text-sm font-medium">
          Город
          <select name="city" defaultValue={f.city ?? ""} className={selectClass}>
            <option value="">Любой</option>
            {cities.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          Формат
          <select name="format" defaultValue={f.format ?? ""} className={selectClass}>
            <option value="">Любой</option>
            <option value="ONLINE">{FORMAT_LABELS.ONLINE}</option>
            <option value="OFFLINE">{FORMAT_LABELS.OFFLINE}</option>
          </select>
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          Специализация
          <select name="specialty" defaultValue={f.specialty ?? ""} className={selectClass}>
            <option value="">Любая</option>
            {Object.entries(SPECIALTIES).map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <div className="flex gap-2">
          <button type="submit" className={buttonVariants()}>
            Показать
          </button>
          {filtered ? (
            <Link href="/trainers" className={buttonVariants({ variant: "ghost" })}>
              Сбросить
            </Link>
          ) : null}
        </div>
      </form>

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-16 text-center">
          <SearchX className="size-10 text-muted-foreground" aria-hidden />
          <p className="max-w-sm text-sm text-muted-foreground">По этим условиям тренеров пока нет</p>
          {filtered ? (
            <Link href="/trainers" className={buttonVariants({ variant: "outline", size: "sm" })}>
              Сбросить фильтры
            </Link>
          ) : null}
        </div>
      ) : (
        <ul aria-label="Тренеры" className="grid gap-3">
          {items.map((item) => (
            <TrainerCard key={item.userId} item={item} signedIn={Boolean(viewer)} nextPath={here} />
          ))}
        </ul>
      )}

      {f.page > 1 || hasMore ? (
        <nav aria-label="Страницы каталога" className="flex gap-2">
          {f.page > 1 ? (
            <Link href={hrefOf(f, f.page - 1)} className={buttonVariants({ variant: "outline" })}>
              Назад
            </Link>
          ) : null}
          {hasMore ? (
            <Link href={hrefOf(f, f.page + 1)} className={buttonVariants({ variant: "outline" })}>
              Дальше
            </Link>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}
