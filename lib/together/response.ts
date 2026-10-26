import type { WorkoutStatus } from "@/generated/prisma/enums";
import { inviteExpiresAt, partnerSnapshot, sessionState, type SessionStatus, type SnapshotCurrent, type SnapshotExercise } from "@/lib/together/rules";

/** Ответ опроса GET /api/together/<id> (спека «Синхронизация»). */
export type SnapshotResponse = {
  status: SessionStatus;
  role: "host" | "guest";
  partnerName: string;
  inviteExpiresAt?: string;
  partner: {
    startedAt: string | null;
    finished: boolean;
    current: SnapshotCurrent;
    exercises: SnapshotExercise[];
    hideWeights: boolean;
  } | null;
  cheers: { at: string }[];
  /** события по времени сервера (выход/отмена); рекорд и финиш партнёра — partnerEvents на клиенте */
  events: { kind: "left"; at: string }[];
  /** время сервера — следующий since (часы устройства не участвуют) */
  now: string;
};

export type ResponseInput = {
  session: { status: SessionStatus; createdAt: Date; acceptedAt: Date | null; endedAt: Date | null; endReason: string | null; hostId: string };
  viewerId: string;
  partner: { nickname: string | null; hideWeights: boolean };
  workout: {
    status: WorkoutStatus;
    startedAt: Date | null;
    finishedAt: Date | null;
    exercises: { name: string; exerciseId: string; sets: { reps: number; weight: number; completedAt: Date | null }[] }[];
  } | null;
  /** лучший вес партнёра по упражнению в прошлых завершённых тренировках */
  bests: Map<string, number>;
  /** 👊 от партнёра после since */
  cheers: Date[];
  /** null — первый опрос: события и 👊 не повторяем */
  since: Date | null;
  now: Date;
};

export function buildResponse(i: ResponseInput): SnapshotResponse {
  const status = sessionState(i.session, i.now);
  const after = (d: Date | null): d is Date => Boolean(d && i.since && d.getTime() > i.since.getTime());
  const events: SnapshotResponse["events"] = [];
  let partner: SnapshotResponse["partner"] = null;

  if (i.workout) {
    const w = i.workout;
    const draft = w.exercises.map((e) => ({ ...e, sets: e.sets.map((s) => ({ reps: s.reps, weight: s.weight, done: s.completedAt !== null })) }));
    const snap = partnerSnapshot(draft, i.bests, i.partner.hideWeights);
    partner = {
      startedAt: w.startedAt?.toISOString() ?? null,
      finished: w.status === "COMPLETED",
      current: snap.current,
      exercises: snap.exercises,
      hideWeights: i.partner.hideWeights,
    };
  }
  if (status === "ENDED" && (i.session.endReason === "left" || i.session.endReason === "cancelled") && after(i.session.endedAt)) {
    events.push({ kind: "left", at: i.session.endedAt.toISOString() });
  }

  return {
    status,
    role: i.viewerId === i.session.hostId ? "host" : "guest",
    partnerName: i.partner.nickname ?? "Атлет",
    ...(status === "INVITED" ? { inviteExpiresAt: inviteExpiresAt(i.session.createdAt).toISOString() } : {}),
    partner,
    cheers: i.since ? i.cheers.filter((c) => after(c)).map((c) => ({ at: c.toISOString() })) : [],
    events,
    now: i.now.toISOString(),
  };
}

export type PartnerEvent = { kind: "record"; exercise: string } | { kind: "finished" };

/**
 * Рекорд и финиш партнёра — по смене снимка между опросами, а не по времени подхода: completedAt и finishedAt
 * ставит устройство партнёра, а черновик доходит до сервера позже (сеть, офлайн) — событие «до since» терялось бы.
 */
export function partnerEvents(prev: SnapshotResponse["partner"], next: SnapshotResponse["partner"]): PartnerEvent[] {
  if (!prev || !next) return [];
  const out: PartnerEvent[] = [];
  next.exercises.forEach((e, i) => {
    if (e.record && !prev.exercises[i]?.record) out.push({ kind: "record", exercise: e.name });
  });
  if (next.finished && !prev.finished) out.push({ kind: "finished" });
  return out;
}
