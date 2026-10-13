import "server-only";
import { db } from "@/lib/db";
import type { CsvSet } from "@/lib/account/csv";
import type { ExportRaw } from "@/lib/account/export";

const person = { select: { nickname: true } } as const;

/** Всё о пользователе для выгрузки (JSON). Другие люди — только ник; секреты отсекает `buildExport`. */
export async function getExportData(userId: string): Promise<ExportRaw> {
  const [
    user,
    workouts,
    exercises,
    templates,
    planSeries,
    planEntries,
    goals,
    bodyWeight,
    records,
    achievements,
    xpHistory,
    recaps,
    boss,
    raids,
    friendships,
    guild,
    club,
    coachLinks,
    clientLinks,
    coachComments,
    notifications,
  ] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: userId } }),
    db.workout.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      select: {
        name: true,
        status: true,
        startedAt: true,
        finishedAt: true,
        durationSec: true,
        totalVolume: true,
        rpe: true,
        notes: true,
        wellbeing: true,
        exercises: {
          orderBy: { order: "asc" },
          select: {
            exercise: { select: { name: true } },
            sets: { orderBy: { order: "asc" }, select: { weight: true, reps: true, rir: true, isWarmup: true, completedAt: true } },
          },
        },
      },
    }),
    db.exercise.findMany({ where: { userId }, select: { name: true, muscleGroups: true, description: true, isBodyweight: true, defaultRestSec: true, archivedAt: true, createdAt: true } }),
    db.workoutTemplate.findMany({
      where: { userId },
      select: {
        name: true,
        description: true,
        createdAt: true,
        exercises: { orderBy: { order: "asc" }, select: { exercise: { select: { name: true } }, targetSets: true, targetReps: true, targetWeight: true, restSec: true, step: true } },
      },
    }),
    db.planSeries.findMany({ where: { userId }, select: { title: true, weekday: true, time: true, durationMin: true, startDate: true, endDate: true, createdAt: true } }),
    db.planEntry.findMany({ where: { userId }, select: { title: true, date: true, time: true, durationMin: true, cancelled: true, originalDate: true, createdAt: true } }),
    db.goal.findMany({
      where: { userId },
      select: { type: true, exercise: { select: { name: true } }, metric: true, target: true, startValue: true, deadline: true, status: true, createdAt: true, achievedAt: true, closedAt: true },
    }),
    db.bodyWeightEntry.findMany({ where: { userId }, orderBy: { date: "asc" }, select: { date: true, weight: true } }),
    db.personalRecord.findMany({ where: { userId }, select: { exercise: { select: { name: true } }, type: true, value: true, achievedAt: true } }),
    db.userAchievement.findMany({ where: { userId }, orderBy: { earnedAt: "asc" }, select: { code: true, title: true, description: true, earnedAt: true } }),
    db.xpEvent.findMany({ where: { userId }, orderBy: { createdAt: "asc" }, select: { amount: true, reason: true, createdAt: true } }),
    db.weeklyRecap.findMany({ where: { userId }, orderBy: { week: "asc" }, select: { week: true, data: true } }),
    db.bossWeek.findMany({ where: { userId }, orderBy: { week: "asc" }, select: { week: true, bossCode: true, hp: true, defeatedAt: true } }),
    db.raidHit.findMany({ where: { userId }, orderBy: { createdAt: "asc" }, select: { damage: true, crits: true, createdAt: true } }),
    db.friendship.findMany({
      where: { OR: [{ requesterId: userId }, { addresseeId: userId }] },
      select: { status: true, createdAt: true, acceptedAt: true, requesterId: true, requester: person, addressee: person },
    }),
    db.guildMember.findUnique({ where: { userId }, select: { joinedAt: true, guild: { select: { name: true, leaderId: true } } } }),
    db.clubMember.findUnique({ where: { userId }, select: { joinedAt: true, club: { select: { name: true, city: true, address: true } } } }),
    db.coachLink.findMany({ where: { clientId: userId }, select: { createdAt: true, endedAt: true, coach: person } }),
    db.coachLink.findMany({ where: { coachId: userId }, select: { createdAt: true, endedAt: true, client: person } }),
    db.coachComment.findMany({ where: { clientId: userId }, orderBy: { createdAt: "asc" }, select: { text: true, createdAt: true, coach: person } }),
    db.notification.findMany({ where: { userId }, orderBy: { createdAt: "asc" }, select: { type: true, title: true, body: true, createdAt: true } }),
  ]);

  return {
    user,
    workouts: workouts.map(({ exercises, ...w }) => ({ ...w, exercises: exercises.map((e) => ({ name: e.exercise.name, sets: e.sets })) })),
    exercises,
    templates: templates.map(({ exercises, ...t }) => ({ ...t, exercises: exercises.map(({ exercise, ...row }) => ({ exercise: exercise.name, ...row })) })),
    plans: [...planSeries.map((p) => ({ kind: "weekly", ...p })), ...planEntries.map((p) => ({ kind: "single", ...p }))],
    goals: goals.map(({ exercise, ...g }) => ({ ...g, exercise: exercise?.name ?? null })),
    bodyWeight,
    records: records.map(({ exercise, ...r }) => ({ ...r, exercise: exercise.name })),
    achievements,
    xpHistory,
    recaps,
    boss,
    raids,
    friends: friendships.map((f) => ({
      nickname: (f.requesterId === userId ? f.addressee : f.requester).nickname,
      status: f.status === "ACCEPTED" ? "friend" : f.requesterId === userId ? "request-sent" : "request-received",
      since: f.acceptedAt ?? f.createdAt,
    })),
    guild: guild ? { name: guild.guild.name, joinedAt: guild.joinedAt, role: guild.guild.leaderId === userId ? "leader" : "member" } : null,
    club: club ? { name: club.club.name, city: club.club.city, address: club.club.address, joinedAt: club.joinedAt } : null,
    coach: coachLinks.map((l) => ({ nickname: l.coach.nickname, since: l.createdAt, until: l.endedAt })),
    clients: clientLinks.map((l) => ({ nickname: l.client.nickname, since: l.createdAt, until: l.endedAt })),
    coachComments: coachComments.map((c) => ({ text: c.text, createdAt: c.createdAt, coach: c.coach?.nickname ?? null })),
    notifications,
  };
}

/** Подходы завершённых тренировок для CSV — по времени тренировки, упражнению и номеру подхода. */
export async function getCsvSets(userId: string): Promise<CsvSet[]> {
  const workouts = await db.workout.findMany({
    where: { userId, status: "COMPLETED", finishedAt: { not: null } },
    orderBy: { finishedAt: "asc" },
    select: {
      name: true,
      finishedAt: true,
      exercises: {
        orderBy: { order: "asc" },
        select: { exercise: { select: { name: true, isBodyweight: true } }, sets: { orderBy: { order: "asc" }, select: { weight: true, reps: true, rir: true, isWarmup: true } } },
      },
    },
  });
  return workouts.flatMap((w) =>
    w.exercises.flatMap((e) =>
      e.sets.map((s, i) => ({
        finishedAt: w.finishedAt!,
        workout: w.name,
        exercise: e.exercise.name,
        index: i + 1,
        warmup: s.isWarmup,
        weight: e.exercise.isBodyweight && s.weight === 0 ? null : s.weight,
        reps: s.reps,
        rir: s.rir,
      })),
    ),
  );
}
