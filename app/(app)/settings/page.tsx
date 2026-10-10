import { db } from "@/lib/db";
import type { Metadata } from "next";
import { PageHeader } from "@/components/app/app-shell";
import { BodyWeightSettings } from "@/components/app/body-weight-settings";
import { CoachModeCard, MyCoachCard } from "@/components/coach/coach-settings";
import { RestartTourButton } from "@/components/onboarding/restart-button";
import { NicknameForm } from "@/components/social/nickname-form";
import { PrivacySettings } from "@/components/social/privacy-settings";
import { TitleSelect } from "@/components/social/title-select";
import { ThemeSettings } from "@/components/app/theme-settings";
import { NotificationPrefs, PushDeviceCard } from "@/components/notifications/notification-settings";
import { TelegramCard } from "@/components/notifications/telegram-settings";
import { requireUser } from "@/lib/auth/dal";
import { activeCoachOf } from "@/lib/coach/access";
import { clientDisplayName } from "@/lib/coach/clients";
import { getNotificationSettings } from "@/lib/notifications/queries";
import { getTelegramStatus } from "@/lib/telegram/queries";
import { getTitleSettings } from "@/lib/titles/queries";

export const metadata: Metadata = { title: "Настройки" };

export default async function SettingsPage() {
  const user = await requireUser();
  const [{ _count, nickname, shareActivity, hideWeights, ...prefs }, title, coach, page, telegram] = await Promise.all([
    getNotificationSettings(user.id),
    getTitleSettings(user.id),
    activeCoachOf(user.id),
    db.coachProfile.findFirst({ where: { userId: user.id, publishedAt: { not: null } }, select: { userId: true } }),
    getTelegramStatus(user.id),
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader title="Настройки" description={`${user.name ?? user.login} · ${user.email}`} />
      <ThemeSettings />
      <BodyWeightSettings initial={user.bodyWeight} />
      <NicknameForm initial={nickname} publishedPage={Boolean(page) && user.isCoach} />
      <TitleSelect titles={title.titles} current={title.current} nickname={nickname} />
      <PrivacySettings initial={{ shareActivity, hideWeights }} />
      {coach ? <MyCoachCard name={clientDisplayName(coach)} since={coach.linkedAt} /> : null}
      <CoachModeCard initial={user.isCoach} hasNickname={Boolean(nickname)} />
      <PushDeviceCard devices={_count.pushSubscriptions} />
      {telegram.enabled ? <TelegramCard status={telegram} /> : null}
      <NotificationPrefs initial={prefs} />
      <RestartTourButton />
    </div>
  );
}
