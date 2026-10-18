import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/app/app-shell";
import { AdminFeedbackCard } from "@/components/feedback/admin-feedback-card";
import { requireAdmin } from "@/lib/auth/admin";
import { ADMIN_PAGE_SIZE, getFeedbackAdmin } from "@/lib/feedback/admin-queries";
import { FEEDBACK_FILTERS, FILTER_LABEL, parseFilter } from "@/lib/feedback/rules";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Обратная связь" };

/** Обращения пользователей (только ADMIN_LOGINS, остальным — 404). */
export default async function FeedbackAdminPage({ searchParams }: PageProps<"/admin/feedback">) {
  const admin = await requireAdmin();
  const filter = parseFilter((await searchParams).status);
  const rows = await getFeedbackAdmin(filter);
  const when = new Intl.DateTimeFormat("ru-RU", { timeZone: admin.timeZone, dateStyle: "short", timeStyle: "short" });

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader
        title="Обратная связь"
        description="Обращения пользователей. Ответ — сменой статуса: на «Сделано» и «Отклонено» автору придёт уведомление."
      />
      <nav aria-label="Статус" className="flex flex-wrap gap-1.5">
        {FEEDBACK_FILTERS.map((f) => (
          <Link
            key={f}
            href={f === "open" ? "/admin/feedback" : `/admin/feedback?status=${f}`}
            aria-current={f === filter ? "page" : undefined}
            className={cn(
              "rounded-full border px-3 py-1 text-sm transition-colors hover:bg-muted",
              f === filter && "border-primary bg-primary/10 font-medium text-primary",
            )}
          >
            {FILTER_LABEL[f]}
          </Link>
        ))}
      </nav>
      {rows.length ? (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.id}>
              {/* key со статусом и заметкой: после сохранения форма берёт значения с сервера */}
              <AdminFeedbackCard
                key={`${r.status}:${r.adminNote}`}
                item={{
                  id: r.id,
                  author: r.user.nickname ?? r.user.login,
                  kind: r.kind,
                  body: r.body,
                  status: r.status,
                  adminNote: r.adminNote,
                  page: r.page,
                  version: r.version,
                  userAgent: r.userAgent,
                  when: when.format(r.createdAt),
                }}
              />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Обращений нет</p>
      )}
      {rows.length === ADMIN_PAGE_SIZE ? <p className="text-xs text-muted-foreground">Показаны последние {ADMIN_PAGE_SIZE}</p> : null}
    </div>
  );
}
