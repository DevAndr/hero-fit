import Link from "next/link";
import { AchievementIcon } from "@/components/achievements/achievement-icon";
import { ArrowDown, ArrowUp, Award, CalendarCheck, Flame, Medal, Snowflake, Trophy, Users } from "lucide-react";
import { RecapMuscles } from "@/components/recap/recap-muscles";
import { PlaceBadge } from "@/components/social/place-badge";
import { buttonVariants } from "@/components/ui/button";
import { plural } from "@/lib/format";
import { recapHighlights } from "@/lib/recap/build";
import type { RecapData, RecapTotals } from "@/lib/recap/types";
import { delta, deltaLabel } from "@/lib/recap/view";
import { cn } from "@/lib/utils";

const kg = (n: number) => `${n.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} кг`;
const duration = (min: number) => (min < 60 ? `${min} мин` : `${Math.floor(min / 60)} ч${min % 60 ? ` ${min % 60} мин` : ""}`);
const RECORD_LABEL = { ONE_RM: "1RM", MAX_WEIGHT: "макс. вес", MAX_REPS: "повторы" } as const;

function Block({ label, icon: Icon, children, className }: { label: string; icon: typeof Trophy; children: React.ReactNode; className?: string }) {
  return (
    <section aria-label={label} className={cn("rounded-xl border bg-card p-4", className)}>
      <h2 className="flex items-center gap-2 font-bold">
        <Icon className="size-4 text-primary" aria-hidden />
        {label}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Delta({ cur, prev }: { cur: number; prev: number }) {
  const d = delta(cur, prev);
  if (d.sign === "same") return <span className="text-xs text-muted-foreground">{deltaLabel(cur, prev)}</span>;
  const Icon = d.sign === "up" ? ArrowUp : ArrowDown;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-xs font-semibold", d.sign === "up" ? "text-primary" : "text-muted-foreground")}>
      <Icon className="size-3" aria-hidden />
      {deltaLabel(cur, prev)}
      <span className="sr-only">{d.sign === "up" ? " больше" : " меньше"}, чем неделей ранее</span>
    </span>
  );
}

function Totals({ totals }: { totals: RecapData["totals"] }) {
  const tiles: { key: keyof RecapTotals; label: string; value: string }[] = [
    { key: "workouts", label: "Тренировки", value: String(totals.workouts) },
    { key: "minutes", label: "Время", value: duration(totals.minutes) },
    { key: "volume", label: "Объём", value: kg(Math.round(totals.volume)) },
    { key: "sets", label: "Подходы", value: String(totals.sets) },
  ];
  return (
    <section aria-label="Прирост" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {tiles.map((t) => (
        <div key={t.key} className="rounded-xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">{t.label}</p>
          <p className="mt-1 text-2xl font-black tabular-nums" data-testid={`recap-total-${t.key}`}>
            {t.value}
          </p>
          {totals.prev ? <Delta cur={totals[t.key]} prev={totals.prev[t.key]} /> : null}
        </div>
      ))}
    </section>
  );
}

function BestSet({ best }: { best: NonNullable<RecapData["bestSet"]> }) {
  return (
    <Block label="Лучший подход" icon={Medal}>
      <Link href={`/stats/exercises/${best.exerciseId}`} className="font-semibold hover:underline">
        {best.exerciseName}
      </Link>
      <p className="mt-1 text-3xl font-black tabular-nums">{best.weight > 0 ? `${kg(best.weight)} × ${best.reps}` : `×${best.reps}`}</p>
      <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        {best.e1rm ? <span>расчётный 1RM ≈ {kg(Math.round(best.e1rm * 10) / 10)}</span> : null}
        {best.isRecord ? <span className="rounded-full bg-xp/15 px-2 py-0.5 text-xs font-semibold text-xp">рекорд</span> : null}
      </p>
    </Block>
  );
}

function League({ league }: { league: RecapData["league"] }) {
  if (!league) {
    return (
      <Block label="Лига друзей" icon={Users}>
        <p className="text-sm text-muted-foreground">Соревноваться веселее: позови друзей — и здесь появится ваша недельная таблица.</p>
        <Link href="/friends" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-3")}>
          Позвать друзей
        </Link>
      </Block>
    );
  }
  if ("percentile" in league) {
    return (
      <Block label="Рейтинг" icon={Trophy}>
        <p className="text-2xl font-black">Ты в топ-{Math.max(1, 100 - league.percentile)}%</p>
        <p className="text-sm text-muted-foreground">по XP за неделю среди активных атлетов · {league.xp} XP</p>
      </Block>
    );
  }
  return (
    <Block label="Лига друзей" icon={Trophy}>
      <p className="text-2xl font-black">
        {league.place}-е место <span className="text-base font-semibold text-muted-foreground">из {league.of}</span>
      </p>
      <ol className="mt-3 grid gap-1 text-sm">
        {league.rows.map((r, i) => (
          <li key={`${r.place}-${r.nickname}-${i}`} className={cn("flex items-center gap-3 rounded-lg px-2 py-1", r.me && "bg-primary/10 font-semibold")}>
            <PlaceBadge place={r.place} xp={r.xp} size={26} />
            <span className="flex-1 truncate">{r.me ? "Вы" : r.nickname || "Атлет"}</span>
            <span className="tabular-nums text-xp">{r.xp} XP</span>
          </li>
        ))}
      </ol>
    </Block>
  );
}

function Streak({ streak }: { streak: NonNullable<RecapData["streak"]> }) {
  return (
    <Block label="Streak" icon={Flame}>
      <p className="text-2xl font-black">
        {streak.weekCount}/{streak.target}{" "}
        <span className="text-base font-semibold">{streak.credited ? "— неделя засчитана 🔥" : "тренировок"}</span>
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        {streak.streak > 0 ? `Серия: ${streak.streak} ${plural(streak.streak, "неделя", "недели", "недель")}` : "Серия прервалась — начни новую"}
      </p>
      {streak.frozen ? (
        <p className="mt-1 flex items-center gap-1 text-sm">
          <Snowflake className="size-4 text-chart-2" aria-hidden /> Неделю спасла заморозка
        </p>
      ) : null}
    </Block>
  );
}

function Records({ records }: { records: NonNullable<RecapData["records"]> }) {
  return (
    <Block label="Рекорды и ачивки" icon={Award}>
      {records.level ? (
        <p className="font-semibold">
          Уровень {records.level.from} → <span className="text-xp">{records.level.to}</span>
        </p>
      ) : null}
      {records.prs.length ? (
        <ul className="mt-2 flex flex-wrap gap-2" aria-label="Рекорды">
          {records.prs.map((r, i) => (
            <li key={`${r.exerciseId}-${r.type}-${i}`} className="rounded-full bg-xp/15 px-2.5 py-1 text-xs font-semibold text-xp">
              {r.exerciseName}: {RECORD_LABEL[r.type]} {r.type === "MAX_REPS" ? r.value : kg(Math.round(r.value * 10) / 10)}
            </li>
          ))}
        </ul>
      ) : null}
      {records.achievements.length ? (
        <ul className="mt-2 flex flex-wrap gap-2" aria-label="Ачивки">
          {records.achievements.map((a) => (
            <li key={a.code} className="flex items-center gap-1.5 rounded-full bg-primary/10 py-1 pr-2.5 pl-1 text-xs font-semibold text-primary">
              <AchievementIcon code={a.code} size={20} />
              {a.title}
            </li>
          ))}
        </ul>
      ) : null}
    </Block>
  );
}

function Plan({ plan, week }: { plan: NonNullable<RecapData["plan"]>; week: string }) {
  return (
    <Block label="План и факт" icon={CalendarCheck}>
      <p className="text-2xl font-black">
        {plan.done} из {plan.planned}
      </p>
      <p className="text-sm text-muted-foreground">запланированных тренировок выполнено</p>
      <Link href={`/calendar?date=${week}`} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-3")}>
        Календарь недели
      </Link>
    </Block>
  );
}

/** Полные итоги недели: герой, прирост и блоки (пустые не показываются). */
export function RecapView({ data }: { data: RecapData }) {
  return (
    <div className="grid gap-4">
      <section aria-label="Главное за неделю" className="card-glow rounded-xl border p-5">
        <ul className="flex flex-wrap gap-x-6 gap-y-2">
          {recapHighlights(data).map((h) => (
            <li key={h} className="text-xl font-black sm:text-2xl">
              {h}
            </li>
          ))}
        </ul>
      </section>
      <Totals totals={data.totals} />
      <div className="grid gap-4 lg:grid-cols-2">
        {data.bestSet ? <BestSet best={data.bestSet} /> : null}
        <League league={data.league} />
        {data.streak ? <Streak streak={data.streak} /> : null}
        {data.records ? <Records records={data.records} /> : null}
        {data.muscles ? <RecapMuscles muscles={data.muscles} /> : null}
        {data.plan ? <Plan plan={data.plan} week={data.week} /> : null}
      </div>
    </div>
  );
}
