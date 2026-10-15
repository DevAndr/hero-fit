import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app/app-shell";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/auth/admin";
import { resolveErrorAction } from "@/lib/errors/actions";
import { getErrorGroup } from "@/lib/errors/queries";
import { SOURCE_LABELS } from "@/lib/errors/schema";

export const metadata: Metadata = { title: "Ошибка" };

/** Браузер кратко по User-Agent (порядок важен: в UA Chrome есть «Safari», в Telegram — «Chrome»). */
function browser(ua: string | null) {
  if (!ua) return "—";
  for (const [needle, name] of [["Telegram", "Telegram"], ["Firefox", "Firefox"], ["Edg/", "Edge"], ["Chrome", "Chrome"], ["Safari", "Safari"]]) {
    if (ua.includes(needle)) return name;
  }
  return "другой";
}

export default async function ErrorGroupPage({ params }: PageProps<"/admin/errors/[id]">) {
  const me = await requireAdmin();
  const { id } = await params;
  const group = await getErrorGroup(id);
  if (!group) notFound();
  const time = new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short", timeZone: me.timeZone });
  const resolved = group.resolvedAt !== null;
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <PageHeader
        title={`${SOURCE_LABELS[group.source]}: ×${group.count}`}
        description={`Впервые ${time.format(group.firstSeen)}, последний раз ${time.format(group.lastSeen)} · пользователей: ${group.users}`}
        actions={
          <form action={resolveErrorAction.bind(null, group.id, !resolved)}>
            <Button type="submit" variant={resolved ? "outline" : "default"}>
              {resolved ? "Открыть снова" : "Решено"}
            </Button>
          </form>
        }
      />
      <p className="font-mono text-sm break-all">{group.message}</p>
      {group.stack ? (
        <pre className="overflow-x-auto rounded-xl border bg-muted p-3 text-xs whitespace-pre-wrap break-all">{group.stack}</pre>
      ) : null}
      <section aria-label="События" className="rounded-xl border">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th className="p-2 font-medium">Время</th>
              <th className="p-2 font-medium">Страница</th>
              <th className="p-2 font-medium">Версия</th>
              <th className="p-2 font-medium">Браузер</th>
              <th className="p-2 font-medium">Пользователь</th>
            </tr>
          </thead>
          <tbody>
            {group.events.map((e) => (
              <tr key={e.id} className="border-t tabular-nums">
                <td className="p-2 whitespace-nowrap">{time.format(e.at)}</td>
                <td className="p-2 break-all">{e.path ?? "—"}</td>
                <td className="p-2">{e.version ?? "—"}</td>
                <td className="p-2">{browser(e.userAgent)}</td>
                <td className="p-2">{e.user ? (e.user.nickname ?? e.user.login) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
