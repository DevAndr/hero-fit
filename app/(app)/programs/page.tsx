import type { Metadata } from "next";
import Link from "next/link";
import { LibraryBig } from "lucide-react";
import { PageHeader } from "@/components/app/app-shell";
import { CatalogCard } from "@/components/catalog/catalog-card";
import { buttonVariants } from "@/components/ui/button";
import { requireCatalog } from "@/lib/catalog/access";
import { listCatalog } from "@/lib/catalog/queries";

export const metadata: Metadata = { title: "Каталог программ" };

const FILTERS = [
  { label: "Любые", value: null },
  { label: "2 дня", value: 2 },
  { label: "3 дня", value: 3 },
  { label: "4 дня", value: 4 },
  { label: "5+ дней", value: 5 },
] as const;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Каталог программ тренеров: фильтр «дней в неделю», постранично. */
export default async function ProgramsPage({ searchParams }: PageProps<"/programs">) {
  await requireCatalog();
  const params = await searchParams;
  const page = Math.min(1000, Math.max(1, Number.parseInt(String(first(params.page)), 10) || 1));
  const rawWeek = Number.parseInt(String(first(params.perWeek)), 10);
  const perWeek = rawWeek >= 2 && rawWeek <= 5 ? rawWeek : null;
  const { items, hasMore } = await listCatalog({ perWeek, page });
  const href = (p: number) => {
    const q = new URLSearchParams();
    if (perWeek) q.set("perWeek", String(perWeek));
    if (p > 1) q.set("page", String(p));
    const s = q.toString();
    return s ? `/programs?${s}` : "/programs";
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader title="Каталог программ" description="Циклы от тренеров: вес растёт по неделям, с разгрузками" />
      <nav aria-label="Дней в неделю" className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.label}
            href={f.value ? `/programs?perWeek=${f.value}` : "/programs"}
            aria-current={f.value === perWeek ? "true" : undefined}
            className={buttonVariants({ variant: f.value === perWeek ? "secondary" : "outline", size: "sm" })}
          >
            {f.label}
          </Link>
        ))}
      </nav>
      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-16 text-center">
          <LibraryBig className="size-10 text-muted-foreground" aria-hidden />
          <p className="max-w-sm text-sm text-muted-foreground">Пока нет опубликованных программ</p>
        </div>
      ) : (
        <ul className="grid gap-2">
          {items.map((item) => (
            <CatalogCard key={item.id} item={item} />
          ))}
        </ul>
      )}
      {page > 1 || hasMore ? (
        <nav aria-label="Страницы каталога" className="flex gap-2">
          {page > 1 ? (
            <Link href={href(page - 1)} className={buttonVariants({ variant: "outline" })}>
              Назад
            </Link>
          ) : null}
          {hasMore ? (
            <Link href={href(page + 1)} className={buttonVariants({ variant: "outline" })}>
              Дальше
            </Link>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}
