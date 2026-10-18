import type { Metadata } from "next";
import { PageHeader } from "@/components/app/app-shell";
import { AlertGroup, NewAlertButton, type AlertAdminItem } from "@/components/alerts/admin/alert-admin-list";
import { requireAdmin } from "@/lib/auth/admin";
import { getAlertsAdmin, type AlertAdminRow } from "@/lib/alerts/admin-queries";
import { groupAlerts } from "@/lib/alerts/admin-view";

export const metadata: Metadata = { title: "Оповещения" };

/** Системные оповещения: строка над шапкой и попапы для всех в кабинете (только ADMIN_LOGINS, остальным — 404). */
export default async function AlertsAdminPage() {
  const admin = await requireAdmin();
  const groups = groupAlerts(await getAlertsAdmin(), new Date());
  const when = new Intl.DateTimeFormat("ru-RU", { timeZone: admin.timeZone, dateStyle: "short", timeStyle: "short" });
  const item = ({ _count, createdAt: _c, updatedAt: _u, createdBy: _b, ...a }: AlertAdminRow): AlertAdminItem => ({
    ...a,
    window: `${when.format(a.startsAt)} — ${a.endsAt ? when.format(a.endsAt) : "пока не выключат"}`,
    dismissals: _count.dismissals,
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Оповещения"
        description="Бегущая строка и попапы для всех в кабинете. Время — по вашему поясу."
        actions={<NewAlertButton />}
      />
      <AlertGroup title="Идут сейчас" alerts={groups.live.map(item)} />
      <AlertGroup title="Запланированы" alerts={groups.planned.map(item)} />
      <AlertGroup title="Прошедшие и выключенные" alerts={groups.past.map(item)} />
    </div>
  );
}
