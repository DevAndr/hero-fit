import type { Metadata } from "next";
import { PageHeader } from "@/components/app/app-shell";
import { NotificationPrefs, PushDeviceCard } from "@/components/notifications/notification-settings";
import { requireUser } from "@/lib/auth/dal";
import { getNotificationSettings } from "@/lib/notifications/queries";

export const metadata: Metadata = { title: "Настройки" };

export default async function SettingsPage() {
  const user = await requireUser();
  const { _count, ...prefs } = await getNotificationSettings(user.id);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader title="Настройки" description={`${user.name ?? user.login} · ${user.email}`} />
      <PushDeviceCard devices={_count.pushSubscriptions} />
      <NotificationPrefs initial={prefs} />
    </div>
  );
}
