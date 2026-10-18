import type { MyFeedback } from "@/lib/feedback/queries";
import { KIND_LABEL } from "@/lib/feedback/rules";
import { FeedbackStatusBadge } from "./feedback-status";


/** «Мои обращения»: тип, дата, статус, текст (до трёх строк). */
export function FeedbackList({ items, timeZone }: { items: MyFeedback[]; timeZone: string }) {
  const date = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", year: "numeric", timeZone });
  return (
    <section aria-label="Мои обращения" className="space-y-2">
      <h2 className="font-bold">Мои обращения</h2>
      {items.length ? (
        <ul className="space-y-2">
          {items.map((f) => (
            <li key={f.id}>
              <article className="space-y-1.5 rounded-xl border bg-card p-3">
                <header className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>
                    {KIND_LABEL[f.kind]} · {date.format(f.createdAt)}
                  </span>
                  <FeedbackStatusBadge status={f.status} />
                </header>
                <p className="line-clamp-3 text-sm break-words whitespace-pre-line">{f.body}</p>
              </article>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Пока нет обращений</p>
      )}
    </section>
  );
}
