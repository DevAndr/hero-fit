import { DeleteAccount } from "@/components/account/delete-account-dialog";
import { MyDataCard } from "@/components/account/my-data-card";
import { getDeletionInput } from "@/lib/account/delete";
import { deletionPreview } from "@/lib/account/rules";
import { db } from "@/lib/db";
import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, MessageSquare, Watch } from "lucide-react";
import { buildLabel } from "@/lib/changelog/version";
import { PageHeader } from "@/components/app/app-shell";
import { BodyWeightSettings } from "@/components/app/body-weight-settings";
import { CoachModeCard, FindCoachCard, MyCoachCard } from "@/components/coach/coach-settings";
import { RestartTourButton } from "@/components/onboarding/restart-button";
import { NicknameForm } from "@/components/social/nickname-form";
import { PrivacySettings } from "@/components/social/privacy-settings";
import { RecordCardsSetting } from "@/components/share/record-cards-setting";
import { TitleSelect } from "@/components/social/title-select";
import { TelegramThemeNote, ThemeSettings } from "@/components/app/theme-settings";
import { NotificationPrefs, PushDeviceCard } from "@/components/notifications/notification-settings";
import { TelegramCard } from "@/components/notifications/telegram-settings";
import { SiteLoginForm } from "@/components/auth/site-login-form";
import { AssistantSettings } from "@/components/assistant/assistant-settings";
import { requireUser } from "@/lib/auth/dal";
import { shopAllowed } from "@/lib/shop/access";
import { skinOf } from "@/lib/shop/catalog";
import { activeCoachOf } from "@/lib/coach/access";
import { clientDisplayName } from "@/lib/coach/clients";
import { getNotificationSettings } from "@/lib/notifications/queries";
import { getTelegramStatus } from "@/lib/telegram/queries";
import { getTitleSettings } from "@/lib/titles/queries";
import { getWhoopStatus, whoopAvailable } from "@/lib/whoop/queries";
import { NativeVersion } from "@/components/native/native-shell";

export const metadata: Metadata = { title: "Настройки" };

export default async function SettingsPage() {
  const user = await requireUser();
  const [{ _count, nickname, shareActivity, hideWeights, shareRecordCards, ...prefs }, title, coach, page, telegram, hasPassword, deletion, whoop] = await Promise.all([
    getNotificationSettings(user.id),
    getTitleSettings(user.id),
    activeCoachOf(user.id),
    db.coachProfile.findFirst({ where: { userId: user.id, publishedAt: { not: null } }, select: { userId: true } }),
    getTelegramStatus(user.id),
    db.user.findUniqueOrThrow({ where: { id: user.id }, select: { passwordHash: true } }).then((u) => u.passwordHash !== null),
    getDeletionInput(user.id),
    // null — браслеты недоступны (флаг whoop / WHOOP не настроен), иначе — подключён ли WHOOP
    whoopAvailable(user.id).then(async (ok) => (ok ? (await getWhoopStatus(user.id)).connected : null)),
  ]);

  // Скин — только при флаге shop: без него тема магазина не применяется
  const worn = (await shopAllowed(user.id)) ? skinOf(user.themeCode) : null;
  const skin = worn ? { name: worn.name, mode: worn.mode } : null;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader title="Настройки" description={user.email ? `${user.name ?? user.login} · ${user.email}` : (user.name ?? user.login)} />
      {hasPassword ? null : <SiteLoginForm />}
      {user.embedded ? <TelegramThemeNote skin={skin} /> : <ThemeSettings skin={skin} />}
      <BodyWeightSettings initial={user.bodyWeight} />
      <NicknameForm initial={nickname} publishedPage={Boolean(page) && user.isCoach} />
      <TitleSelect titles={title.titles} current={title.current} nickname={nickname} />
      <PrivacySettings initial={{ shareActivity, hideWeights }} />
      <RecordCardsSetting initial={shareRecordCards} />
      {coach ? <MyCoachCard name={clientDisplayName(coach)} since={coach.linkedAt} /> : !user.isCoach ? <FindCoachCard /> : null}
      <CoachModeCard initial={user.isCoach} hasNickname={Boolean(nickname)} />
      {/* Во webview Telegram Web Push не работает — уведомления идут через бота */}
      {user.embedded ? null : <PushDeviceCard devices={_count.pushSubscriptions} />}
      {telegram.enabled ? <TelegramCard status={telegram} /> : null}
      {/* Во webview Telegram OAuth WHOOP не пройти (cookie state и уход на чужой домен) — подключение только в браузере */}
      {whoop === null || user.embedded ? null : (
        <Link href="/devices" className="flex items-center gap-3 rounded-xl border bg-card p-4 transition-colors hover:bg-muted/50">
          <Watch className="size-4 shrink-0 text-primary" />
          <span className="font-bold">Браслеты и часы</span>
          <span className="ml-auto text-sm text-muted-foreground">{whoop ? "WHOOP подключён" : "Не подключены"}</span>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
        </Link>
      )}
      <AssistantSettings initial={user.assistantEnabled} />
      <NotificationPrefs initial={prefs} isCoach={user.isCoach} />
      <RestartTourButton />
      <Link href="/feedback?from=%2Fsettings" className="flex items-center gap-3 rounded-xl border bg-card p-4 transition-colors hover:bg-muted/50">
        <MessageSquare className="size-4 shrink-0 text-primary" />
        <span className="font-bold">Обратная связь</span>
        <span className="ml-auto text-sm text-muted-foreground">Ошибка или идея</span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
      </Link>
      <MyDataCard />
      <DeleteAccount hasPassword={hasPassword} preview={deletionPreview(deletion)} />
      <p className="pt-2 text-center text-xs text-muted-foreground">
        Hero Fit {buildLabel(process.env.APP_VERSION, process.env.GIT_SHA)}
        <NativeVersion /> ·{" "}
        <Link href="/whats-new" className="underline-offset-4 hover:underline">
          Что нового
        </Link>
      </p>
    </div>
  );
}
