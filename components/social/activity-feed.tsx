"use client";

import { PlayerAvatar } from "@/components/shop/player-avatar";
import { PlayerName } from "@/components/shop/player-name";
import { useOptimistic, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowBigUpDash, Flame, HandFist, Loader2, Medal, Shield, Swords, Target, Timer, Trophy, Weight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { weeksText } from "@/lib/progress/streak-copy";
import { kudosLabel, type FeedEntry } from "@/lib/social/feed";
import { loadFeedPageAction, toggleKudosAction } from "@/lib/social/actions";
import { cn } from "@/lib/utils";

const fmt = (n: number) => n.toLocaleString("ru-RU", { maximumFractionDigits: 1 });
const tonnes = (kg: number) => (kg >= 1000 ? `${fmt(kg / 1000)} т` : `${fmt(kg)} кг`);
const minutes = (sec: number) => (sec >= 3600 ? `${Math.floor(sec / 3600)} ч ${Math.round((sec % 3600) / 60)} мин` : `${Math.max(1, Math.round(sec / 60))} мин`);
const rtf = new Intl.RelativeTimeFormat("ru-RU", { numeric: "auto" });
const fullDate = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

export function ago(iso: string) {
  const diff = (new Date(iso).getTime() - Date.now()) / 1000;
  const abs = Math.abs(diff);
  if (abs < 60) return "только что";
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  if (abs < 7 * 86400) return rtf.format(Math.round(diff / 86400), "day");
  return fullDate.format(new Date(iso));
}

const RECORD_LABEL = { ONE_RM: "1RM", MAX_WEIGHT: "макс. вес", MAX_REPS: "повторы", MAX_DURATION: "время", MAX_DISTANCE: "дистанция", BEST_PACE: "темп" } as const;

export function recordText(r: FeedEntry["records"][number]) {
  if (r.value === null) return `${r.exerciseName}: ${RECORD_LABEL[r.type]}`;
  return `${r.exerciseName}: ${r.type === "MAX_REPS" ? `${r.value} повт.` : `${fmt(r.value)} кг`}`;
}

function KudosButton({ entry }: { entry: FeedEntry }) {
  const [kudos, setKudos] = useOptimistic(entry.kudos, (k, byMe: boolean) => ({
    ...k,
    byMe,
    count: k.count + (byMe ? 1 : -1),
  }));
  const [, startTransition] = useTransition();
  const label = kudosLabel(kudos);

  if (entry.me) {
    return label ? (
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <HandFist className="size-3.5 text-primary" aria-hidden />
        {label}
      </p>
    ) : null;
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        variant={kudos.byMe ? "default" : "outline"}
        size="sm"
        aria-pressed={kudos.byMe}
        aria-label={kudos.byMe ? `Убрать 👊 у ${entry.nickname}` : `Дать 👊 ${entry.nickname}`}
        onClick={() =>
          startTransition(async () => {
            setKudos(!kudos.byMe);
            const result = await toggleKudosAction(entry.id);
            if (!result.ok) toast.error(result.error);
          })
        }
      >
        <HandFist />
        {kudos.count || ""}
      </Button>
      {label ? <span className="text-xs text-muted-foreground">{label}</span> : null}
    </div>
  );
}

export function FeedCard({ entry, compact = false }: { entry: FeedEntry; compact?: boolean }) {
  const highlights = [
    ...entry.records.map((r) => ({ icon: Medal, text: `Рекорд — ${recordText(r)}`, className: "text-xp" })),
    ...entry.achievements.map((t) => ({ icon: Trophy, text: t, className: "text-xp" })),
    ...entry.goals.map((t) => ({ icon: Target, text: `Цель: ${t}`, className: "text-xp" })),
    ...(entry.levelUp ? [{ icon: ArrowBigUpDash, text: `Новый уровень ${entry.levelUp}`, className: "text-primary" }] : []),
    ...(entry.bossDefeated ? [{ icon: Swords, text: `Босс повержен: ${entry.bossDefeated}`, className: "text-streak" }] : []),
    ...(entry.raidDefeated
      ? [{ icon: Shield, text: `Гильдия «${entry.raidDefeated.guild}» повергла: ${entry.raidDefeated.boss}`, className: "text-destructive" }]
      : []),
    ...(entry.streakMilestone
      ? [{ icon: Flame, text: `${weeksText(entry.streakMilestone)} подряд в ударе`, className: "text-streak" }]
      : []),
  ];
  const shownHighlights = compact ? highlights.slice(0, 2) : highlights;

  return (
    <article
      id={`w-${entry.id}`}
      aria-label={`${entry.nickname}: ${entry.name}`}
      className={cn("scroll-mt-20 rounded-xl border bg-card p-4", entry.me && "border-primary/30")}
    >
      <header className="flex items-start gap-3">
        <PlayerAvatar nickname={entry.nickname} cosmetics={entry.cosmetics} size="md" />
        <div className="min-w-0 flex-1">
          {/* В компактной карточке (дашборд) ник и название — разными строками, иначе название обрезается */}
          <p className={cn(!compact && "truncate")}>
            <span className={cn("font-semibold", compact && "block truncate")}>{entry.me ? "Вы" : <PlayerName nickname={entry.nickname} color={entry.cosmetics?.nickColor} />}</span>
            {compact ? null : <span className="text-muted-foreground"> · тренировка </span>}
            {entry.me ? (
              <Link
                href={`/workouts/${entry.id}`}
                className={cn("font-medium hover:text-primary hover:underline", compact && "block truncate text-sm")}
              >
                «{entry.name}»
              </Link>
            ) : (
              <span className={cn("font-medium", compact && "block truncate text-sm")}>«{entry.name}»</span>
            )}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            <time dateTime={entry.finishedAt} suppressHydrationWarning>
              {ago(entry.finishedAt)}
            </time>
            {entry.title && !compact ? <span data-testid="feed-title"> · {entry.title}</span> : null}
          </p>
        </div>
      </header>

      <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm tabular-nums">
        <span className="flex items-center gap-1.5">
          <Timer className="size-4 text-muted-foreground" aria-hidden />
          {minutes(entry.durationSec)}
        </span>
        {entry.volume !== null ? (
          <span className="flex items-center gap-1.5" data-testid="feed-volume">
            <Weight className="size-4 text-muted-foreground" aria-hidden />
            {tonnes(entry.volume)}
          </span>
        ) : null}
        <span className="text-muted-foreground">
          подходов: {entry.sets} · повторов: {entry.reps}
        </span>
      </p>

      {!compact && entry.exercises.length ? (
        <p className="mt-2 text-sm text-muted-foreground" data-testid="feed-exercises">
          {entry.exercises.map((e) => (e.top ? `${e.name} ${fmt(e.top)} кг` : e.name)).join(" · ")}
          {entry.moreExercises ? ` · ещё ${entry.moreExercises}` : ""}
        </p>
      ) : null}

      {shownHighlights.length ? (
        <ul className="mt-3 space-y-1">
          {shownHighlights.map(({ icon: Icon, text, className }, i) => (
            <li key={i} className="flex items-start gap-2 text-sm">
              <Icon className={cn("mt-0.5 size-4 shrink-0", className)} aria-hidden />
              {text}
            </li>
          ))}
          {compact && highlights.length > shownHighlights.length ? (
            <li className="pl-6 text-xs text-muted-foreground">и ещё {highlights.length - shownHighlights.length}</li>
          ) : null}
        </ul>
      ) : null}

      <div className="mt-3">
        <KudosButton entry={entry} />
      </div>
    </article>
  );
}

/** Лента с подгрузкой «Показать ещё». */
export function ActivityFeed({
  initial,
  next: initialNext,
  source = "friends",
}: {
  initial: FeedEntry[];
  next: string | null;
  /** Чья лента подгружается «Показать ещё». */
  source?: "friends" | "guild";
}) {
  const [extra, setExtra] = useState<FeedEntry[]>([]);
  const [next, setNext] = useState(initialNext);
  const [pending, startTransition] = useTransition();
  // Свежая первая страница с сервера (после 👊 или новых тренировок) + уже подгруженные старые.
  const entries = [...initial, ...extra.filter((e) => !initial.some((i) => i.id === e.id))];

  return (
    <div className="space-y-3">
      {entries.map((entry) => (
        <FeedCard key={entry.id} entry={entry} />
      ))}
      {next ? (
        <Button
          variant="outline"
          className="w-full"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const page = await loadFeedPageAction(next, source);
              setExtra((prev) => [...prev, ...page.entries]);
              setNext(page.next);
            })
          }
        >
          {pending ? <Loader2 className="animate-spin" /> : null}
          Показать ещё
        </Button>
      ) : null}
    </div>
  );
}
