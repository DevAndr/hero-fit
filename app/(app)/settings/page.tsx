import type { Metadata } from "next";
import { PageHeader } from "@/components/app/app-shell";
import { BodyWeightSettings } from "@/components/app/body-weight-settings";
import { RestartTourButton } from "@/components/onboarding/restart-button";
import { NicknameForm } from "@/components/social/nickname-form";
import { PrivacySettings } from "@/components/social/privacy-settings";
import { TitleSelect } from "@/components/social/title-select";
import { ThemeSettings } from "@/components/app/theme-settings";
import { NotificationPrefs, PushDeviceCard } from "@/components/notifications/notification-settings";
import { requireUser } from "@/lib/auth/dal";
import { getNotificationSettings } from "@/lib/notifications/queries";
import { getTitleSettings } from "@/lib/titles/queries";

export const metadata: Metadata = { title: "Настройки" };

export default async function SettingsPage() {
  const user = await requireUser();
  const [{ _count, nickname, shareActivity, hideWeights, ...prefs }, title] = await Promise.all([
    getNotificationSettings(user.id),
    getTitleSettings(user.id),
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader title="Настройки" description={`${user.name ?? user.login} · ${user.email}`} />
      <ThemeSettings />
      <BodyWeightSettings initial={user.bodyWeight} />
      <NicknameForm initial={nickname} />
      <TitleSelect titles={title.titles} current={title.current} nickname={nickname} />
      <PrivacySettings initial={{ shareActivity, hideWeights }} />
      <PushDeviceCard devices={_count.pushSubscriptions} />
      <NotificationPrefs initial={prefs} />
      <RestartTourButton />
    </div>
  );
}
