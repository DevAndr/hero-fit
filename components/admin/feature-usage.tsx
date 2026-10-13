import type { FeatureUsage as Usage } from "@/lib/admin/metrics-queries";

const fmt = (n: number) => n.toLocaleString("ru-RU");

/** Срез использования фич на сейчас. */
export function FeatureUsage({ usage: u }: { usage: Usage }) {
  const rows: [string, string][] = [
    ["Тренеры", `${fmt(u.coaches)}, с клиентами ${fmt(u.coachesWithClients)}`],
    ["Клиентов у тренеров", fmt(u.activeClients)],
    ["Telegram", `уведомления ${fmt(u.telegramNotify)}, Mini App ${fmt(u.telegramMiniApp)}`],
    ["Push", fmt(u.push)],
    ["Гильдии", `${fmt(u.guilds)}, игроков ${fmt(u.guildMembers)}`],
    ["Клубы", `${fmt(u.clubs)}, участников ${fmt(u.clubMembers)}`],
    ["Активные цели", fmt(u.activeGoals)],
    ["Магазин", `купили ${fmt(u.buyers)}, монет на балансах ${fmt(u.coins)}`],
    ["Прошли экскурсию", `${fmt(u.onboarded)} из ${fmt(u.users)}`],
  ];
  return (
    <section aria-label="Фичи" className="rounded-xl border bg-card p-4">
      <h2 className="font-bold">Фичи</h2>
      <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-3 border-b pb-2 last:border-0 sm:[&:nth-last-child(2)]:border-0">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="text-right font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
