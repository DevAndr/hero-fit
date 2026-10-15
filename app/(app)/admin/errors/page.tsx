import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/app/app-shell";
import { SegmentNav } from "@/components/club/segment-nav";
import { requireAdmin } from "@/lib/auth/admin";
import { getErrorGroups } from "@/lib/errors/queries";
import { formatDuration } from "@/lib/format";
import { SOURCE_LABELS } from "@/lib/errors/schema";

export const metadata: Metadata = { title: "Ошибки" };

/** Журнал ошибок (только ADMIN_LOGINS, остальным — 404): группы одинаковых ошибок, открытые и решённые. */
export default async function ErrorsPage({ searchParams }: PageProps<"/admin/errors">) {
  await requireAdmin();
  const tab = (await searchParams).tab === "resolved" ? "resolved" : "open";
  const groups = await getErrorGroups(tab);
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <PageHeader title="Ошибки" description="Сбои сервера и браузера, одинаковые — одной строкой. Хранятся 30 дней." />
      <SegmentNav
        label="Разделы"
        current={tab}
        items={[
          { key: "open", label: "Открытые", href: "/admin/errors" },
          { key: "resolved", label: "Решённые", href: "/admin/errors?tab=resolved" },
        ]}
      />
      {groups.length ? (
        <ul className="space-y-2">
          {groups.map((g) => (
            <li key={g.id}>
              <Link href={`/admin/errors/${g.id}`} className="block rounded-xl border bg-card p-3 hover:border-primary/50">
                <p className="line-clamp-2 font-mono text-sm break-all">{g.message}</p>
                <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground tabular-nums">
                  <span className="font-semibold text-foreground">{SOURCE_LABELS[g.source]}</span>
                  <span>×{g.count}</span>
                  <span>пользователей: {g.users}</span>
                  <span>{formatDuration(g.agoSec)} назад</span>
                  {g.version ? <span>v{g.version}</span> : null}
                  {g.path ? <span className="truncate">{g.path}</span> : null}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{tab === "open" ? "Открытых ошибок нет." : "Решённых нет."}</p>
      )}
    </div>
  );
}
