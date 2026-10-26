import type { Metadata } from "next";
import Link from "next/link";
import { BarChart3, CalendarDays, CalendarRange, Globe, Users } from "lucide-react";
import { AchievementToaster } from "@/components/achievements/achievement-toaster";
import { PageHeader } from "@/components/app/app-shell";
import { programBadges } from "@/lib/coach/program-queries";
import { AssignManyButton } from "@/components/coach/assign-many";
import { ClientList } from "@/components/coach/client-list";
import { GroupFilter } from "@/components/coach/group-filter";
import { GroupsButton } from "@/components/coach/groups-dialog";
import { RecapAnnounce } from "@/components/coach/recap/recap-announce";
import { InviteCard } from "@/components/coach/invite-card";
import { CoachGuide, ShowCoachGuide } from "@/components/coach/coach-guide";
import { buttonVariants } from "@/components/ui/button";
import { evaluateAchievementsNow } from "@/lib/achievements/engine";
import { getUnseenAchievements } from "@/lib/achievements/queries";
import { quietly } from "@/lib/achievements/quietly";
import { requireCoach } from "@/lib/coach/access";
import { clientPickLabels } from "@/lib/coach/assign";
import { coachGuide } from "@/lib/coach/guide";
import { getCoachGuideFacts } from "@/lib/coach/guide-queries";
import { sortClients } from "@/lib/coach/clients";
import { getCoachGroups } from "@/lib/coach/group-queries";
import { inGroup } from "@/lib/coach/groups";
import { ensureCoachCode, getCoachClients } from "@/lib/coach/queries";
import { unseenCoachRecap } from "@/lib/coach/recap-queries";
import { dayKey, safeTimeZone } from "@/lib/daily-login";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { telegramEnabled } from "@/lib/telegram/format";
import { telegramJoinUrl } from "@/lib/telegram/links";

export const metadata: Metadata = { title: "Клиенты" };

const pretty = (code: string) => `${code.slice(0, 4)}-${code.slice(4)}`;

export default async function CoachPage({ searchParams }: PageProps<"/coach">) {
  const coach = await requireCoach();
  const now = new Date();
  const query = await searchParams;
  // Результаты клиентов (тренировки, рекорды, цели) — ачивки тренера сразу, без ожидания следующего входа.
  // Тостер layout рендерится параллельно и мог их не увидеть — показываем здесь (тосты не задваиваются по id).
  const granted = await quietly(() => evaluateAchievementsNow(coach.id), { achievements: [], xp: 0, coins: [] });
  const unseen = granted.achievements.length ? await getUnseenAchievements(coach.id) : [];
  const tz = safeTimeZone(coach.timeZone);
  const [code, clients, templates, groups, recap] = await Promise.all([
    ensureCoachCode(coach.id),
    getCoachClients(coach.id, now),
    db.workoutTemplate.findMany({ where: { userId: coach.id }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    getCoachGroups(coach.id),
    unseenCoachRecap(coach.id, tz, now),
  ]);
  const sorted = sortClients(clients);
  const [programs, guideData] = await Promise.all([
    programBadges(coach.id, clients, now),
    // Ссылки «Назначить» и «Прокомментировать» — на первого клиента списка
    getCoachGuideFacts(coach.id, sorted[0]?.id ?? null),
  ]);
  const guide = coachGuide(guideData.facts);
  const picker = clientPickLabels(sorted.map((c) => ({ id: c.id, name: c.name, linkedDay: dayKey(c.linkedAt, tz) })));
  // Нет такой группы (удалена, чужая) — все клиенты
  const active = groups.find((g) => g.id === query.group) ?? null;
  const shown = inGroup(sorted, active);
  const groupNames: Record<string, string[]> = {};
  for (const g of groups) for (const id of g.clientIds) (groupNames[id] ??= []).push(g.name);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader
        title="Клиенты"
        description="Тренировки и прогресс ваших клиентов"
        actions={
          <>
            {/* Программы — и без клиентов: их готовят заранее */}
            <Link href="/coach/calendar" className={buttonVariants({ variant: "outline", size: "sm" })}>
              <CalendarDays />
              Календарь клиентов
            </Link>
            <Link href="/coach/programs" className={buttonVariants({ variant: "outline", size: "sm" })}>
              <CalendarRange />
              Программы
            </Link>
            <Link href="/coach/recap" className={buttonVariants({ variant: "outline", size: "sm" })}>
              <BarChart3 />
              Итоги недели
            </Link>
            <Link href="/coach/page" className={buttonVariants({ variant: "outline", size: "sm" })}>
              <Globe />
              Публичная страница
            </Link>
          </>
        }
      />
      {guide.complete || guideData.hidden ? null : <CoachGuide guide={guide} />}
      {recap ? <RecapAnnounce week={recap.week} totals={recap.totals} /> : null}
      {/* Группы правятся и без клиентов: иначе оставшийся фильтр «Утро (0)» не убрать */}
      {clients.length || groups.length ? (
        <div className="flex flex-wrap gap-2">
          {clients.length > 1 ? <AssignManyButton clients={picker} groups={groups} templates={templates} today={dayKey(now, tz)} /> : null}
          <GroupsButton groups={groups} clients={picker} />
        </div>
      ) : null}
      <GroupFilter groups={groups} active={active?.id ?? null} />
      {shown.length ? (
        <ClientList rows={shown} now={now} groupNames={groupNames} programs={programs} />
      ) : clients.length ? (
        <p className="rounded-xl border border-dashed px-6 py-8 text-center text-sm text-muted-foreground">В группе пока никого.</p>
      ) : (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-10 text-center">
          <Users className="size-8 text-muted-foreground" aria-hidden />
          <p className="font-semibold">Пока нет клиентов</p>
          <p className="max-w-sm text-sm text-muted-foreground">Отправьте ссылку клиенту — после его согласия он появится здесь.</p>
        </div>
      )}
      <InviteCard
        url={new URL(`/coach/join/${code}`, env.APP_URL).toString()}
        code={pretty(code)}
        telegramUrl={telegramEnabled(env) ? telegramJoinUrl(code, env.TELEGRAM_BOT_USERNAME) : null}
      />
      {guideData.hidden && !guide.complete ? (
        <div className="text-center">
          <ShowCoachGuide />
        </div>
      ) : null}
      {unseen.length > 0 && <AchievementToaster achievements={unseen} />}
    </div>
  );
}
