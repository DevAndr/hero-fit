import { Skeleton } from "@/components/ui/skeleton";

/**
 * Скелет кабинета: показывается сразу по клику (и подгружается заранее вместе со ссылкой),
 * пока сервер собирает данные дашборда. Повторяет сетку страницы, чтобы контент не прыгал.
 * Только здесь, а не на всю группу (app): потоковый ответ отдаёт 200, и notFound() других страниц перестал бы давать 404.
 */
export default function DashboardLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-4" role="status" aria-label="Загрузка личного кабинета" data-testid="dashboard-loading">
      <section className="flex flex-col gap-4 rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/20 via-primary/5 to-transparent p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-44" />
        </div>
        <Skeleton className="h-12 w-full rounded-lg sm:w-56" />
      </section>

      <Skeleton className="h-20 rounded-xl" />

      <div className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-44 rounded-xl" />
        ))}
      </div>

      <Skeleton className="h-36 rounded-xl" />

      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-72 rounded-xl lg:col-span-2" />
        <Skeleton className="h-72 rounded-xl" />
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <span className="sr-only">Загрузка…</span>
    </div>
  );
}
