import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app/app-shell";
import { WhoopCard, type WhoopCardStatus } from "@/components/devices/whoop-card";
import { requireUser } from "@/lib/auth/dal";
import { safeTimeZone } from "@/lib/daily-login";
import type { WhoopNotice } from "@/lib/whoop/oauth";
import { getWhoopStatus, whoopAvailable } from "@/lib/whoop/queries";

export const metadata: Metadata = { title: "Браслеты и часы" };

const NOTICES: readonly WhoopNotice[] = ["connected", "denied", "taken", "error"];

/** Браслеты и часы: пока только WHOOP (флаг `whoop`); пункта в меню нет — ссылка из /settings. */
export default async function DevicesPage({ searchParams }: PageProps<"/devices">) {
  const user = await requireUser();
  if (!(await whoopAvailable(user.id))) notFound();
  const [status, params] = await Promise.all([getWhoopStatus(user.id), searchParams]);

  const timeZone = safeTimeZone(user.timeZone);
  const date = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric", timeZone });
  const dateTime = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone });
  const card: WhoopCardStatus = status.connected
    ? {
        connected: true,
        since: date.format(status.since),
        lastSync: status.lastSyncAt ? dateTime.format(status.lastSyncAt) : null,
        needsReauth: status.needsReauth,
      }
    : { connected: false };
  const notice = NOTICES.find((n) => n === params.whoop) ?? null;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader title="Браслеты и часы" description="Пульс и нагрузка с браслета — в сводке тренировки" />
      <WhoopCard status={card} notice={notice} embedded={user.embedded} />
    </div>
  );
}
