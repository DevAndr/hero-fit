import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Check, Users } from "lucide-react";
import { ClubInfographic } from "@/components/marketing/club-infographics";
import { MiniLeague, MiniRecap } from "@/components/marketing/infographics";
import { RaidInfographic } from "@/components/marketing/raid-infographics";
import { Section, glass } from "@/components/marketing/v2/section";
import { buttonVariants } from "@/components/ui/button";
import { TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HashTabs } from "@/components/marketing/v2/hash-tabs";

const FRIEND_POINTS = [
  "Недельная лига друзей по XP за тренировки и рекорды",
  "Лента тренировок: 👊 в поддержку и 🏆 респект за рекорд",
  "Итоги недели по понедельникам: рекорды и место в лиге",
  "Веса можно скрыть — друзья увидят только время и рекорды",
];

const GUILD_POINTS = [
  "Гильдия до 10 человек: вступают по ссылке, видят опыт друг друга за неделю и ленту тренировок",
  "Рейд-босс недели — общий: HP подстраивается под силы гильдии",
  "Сундук с опытом — каждому, кто бил до победы; MVP, нанёсший больше всех урона, получает больше",
];

const CLUB_POINTS = [
  "Найдите свой зал или добавьте его — заявку проверит модератор",
  "Соревнуйтесь в рейтинге недели с теми, кто тренируется рядом",
  "Выполняйте задания клуба вместе и открывайте сундуки",
];

function Points({ items }: { items: string[] }) {
  return (
    <ul className="space-y-3 text-sm">
      {items.map((t) => (
        <li key={t} className="flex gap-2">
          <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden /> {t}
        </li>
      ))}
    </ul>
  );
}

function Panel({ value, lead, points, actions, visual }: { value: string; lead: string; points: string[]; actions: ReactNode; visual: ReactNode }) {
  return (
    // keepMounted — неактивные вкладки остаются в HTML (hidden): их тексты и ссылки видят поисковики
    <TabsContent value={value} keepMounted className="mt-8">
      <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
        <div className="space-y-6">
          <p className="text-lg text-pretty text-muted-foreground">{lead}</p>
          <Points items={points} />
          <div className="flex flex-wrap gap-3">{actions}</div>
        </div>
        <div className={`${glass} p-5 sm:p-6`}>{visual}</div>
      </div>
    </TabsContent>
  );
}

/** «Вместе веселее»: друзья и лига, гильдии и рейды, клубы залов (при флаге) — вкладками. */
export function Together({ clubs, authed, cities }: { clubs: boolean; authed: boolean; cities: { city: string; path: string }[] }) {
  const reg = (next: string) => (authed ? next : `/register?next=${encodeURIComponent(next)}`);
  return (
    <Section
      id="together"
      eyebrow={<><Users className="size-3.5" /> Вместе</>}
      title="Вместе веселее"
      lead="Тренироваться проще, когда рядом свои: друзья, команда или весь твой зал."
    >
      {/* Якоря шапки «Гильдии» и «Клубы» ведут сюда */}
      <span id="guilds" className="absolute -top-20" aria-hidden />
      {clubs ? <span id="clubs" className="absolute -top-20" aria-hidden /> : null}
      <HashTabs defaultValue="friends" values={clubs ? ["guilds", "clubs"] : ["guilds"]}>
        <TabsList className="h-auto! w-full flex-wrap gap-1 rounded-2xl p-1 sm:w-fit">
          <TabsTrigger value="friends" className="h-10 rounded-xl px-4">
            Друзья и лига
          </TabsTrigger>
          <TabsTrigger value="guilds" className="h-10 rounded-xl px-4">
            Гильдии и рейды
          </TabsTrigger>
          {clubs ? (
            <TabsTrigger value="clubs" className="h-10 rounded-xl px-4">
              Клубы залов
            </TabsTrigger>
          ) : null}
        </TabsList>
        <Panel
          value="friends"
          lead="Добавь друзей по коду — и каждая неделя превращается в дружеское соревнование."
          points={FRIEND_POINTS}
          actions={
            <Link href="/register" className={buttonVariants({ size: "lg" })}>
              Позвать друзей <ArrowRight aria-hidden />
            </Link>
          }
          visual={
            <div className="space-y-4">
              <MiniLeague />
              <MiniRecap />
            </div>
          }
        />
        <Panel
          value="guilds"
          lead="Собери команду и бейте общего босса. Каждая тренировка участника снимает ему HP — тот же урон, что и личному боссу недели."
          points={GUILD_POINTS}
          actions={
            <Link href="/register" className={buttonVariants({ size: "lg" })}>
              Собрать гильдию <ArrowRight aria-hidden />
            </Link>
          }
          visual={<RaidInfographic />}
        />
        {clubs ? (
          <Panel
            value="clubs"
            lead="Вступите в клуб своего зала: общий рейтинг недели и задания, которые выполняют все вместе."
            points={CLUB_POINTS}
            actions={
              <>
                <Link href={reg("/clubs")} className={buttonVariants({ size: "lg" })}>
                  Найти свой зал <ArrowRight aria-hidden />
                </Link>
                <Link href={reg("/clubs/new")} className={buttonVariants({ variant: "outline", size: "lg" })}>
                  Добавить свой зал
                </Link>
                {cities.length ? (
                  <ul aria-label="Популярные города" className="flex w-full flex-wrap gap-2 pt-2">
                    {cities.map((c) => (
                      <li key={c.path}>
                        <Link href={c.path} className="inline-flex rounded-full border px-3 py-1 text-sm transition-colors hover:border-primary/50">
                          {c.city}
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </>
            }
            visual={<ClubInfographic />}
          />
        ) : null}
      </HashTabs>
    </Section>
  );
}
