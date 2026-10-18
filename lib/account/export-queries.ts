import "server-only";
import { db } from "@/lib/db";
import { participants } from "@/lib/catalog/queries";
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
    goblins,
    raids,
    friendships,
    guild,
    club,
    coachLinks,
    clientLinks,
    coachComments,
    coachNotesAboutMe,
    clientNotes,
    recapsAboutMe,
    coachRecaps,
    respectsGiven,
    respectsReceived,
    kudosGiven,
    kudosReceived,
    programs,
    coachPrograms,
    publishedPrograms,
    notifications,
    userItems,
    coinTx,
    whoopConnection,
    whoopWorkouts,
    favorites,
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
            supersetGroup: true,
            sets: { orderBy: { order: "asc" }, select: { weight: true, reps: true, rir: true, isWarmup: true, completedAt: true, durationSec: true, distanceM: true } },
          },
        },
      },
    }),
    db.exercise.findMany({ where: { userId }, select: { name: true, muscleGroups: true, description: true, isBodyweight: true, kind: true, defaultRestSec: true, archivedAt: true, createdAt: true } }),
    db.workoutTemplate.findMany({
      where: { userId },
      select: {
        name: true,
        description: true,
        createdAt: true,
        exercises: { orderBy: { order: "asc" }, select: { exercise: { select: { name: true } }, targetSets: true, targetReps: true, targetWeight: true, restSec: true, step: true, supersetGroup: true } },
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
    db.goblinEncounter.findMany({ where: { userId }, orderBy: { spawnedAt: "asc" }, select: { spawnedAt: true, caughtAt: true } }),
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
    db.coachNote.findMany({ where: { clientId: userId }, orderBy: { updatedAt: "asc" }, select: { text: true, updatedAt: true, coach: person } }),
    db.coachNote.findMany({ where: { coachId: userId }, orderBy: { updatedAt: "asc" }, select: { text: true, updatedAt: true, client: person } }),
    db.coachRecapClient.findMany({
      where: { clientId: userId },
      orderBy: { recap: { week: "asc" } },
      select: { data: true, recap: { select: { week: true, coach: person } } },
    }),
    db.coachWeeklyRecap.findMany({
      where: { coachId: userId },
      orderBy: { week: "asc" },
      select: { week: true, data: true, clients: { select: { data: true, client: person }, orderBy: { clientId: "asc" } } },
    }),
    db.recordRespect.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      select: { exercise: { select: { name: true } }, workout: { select: { finishedAt: true, user: person } } },
    }),
    db.recordRespect.findMany({
      where: { workout: { userId } },
      orderBy: { createdAt: "asc" },
      select: { exercise: { select: { name: true } }, workout: { select: { finishedAt: true } }, user: person },
    }),
    db.kudos.findMany({ where: { userId }, orderBy: { createdAt: "asc" }, select: { workout: { select: { finishedAt: true, user: person } } } }),
    db.kudos.findMany({ where: { workout: { userId } }, orderBy: { createdAt: "asc" }, select: { workout: { select: { finishedAt: true } }, user: person } }),
    db.programAssignment.findMany({
      where: { clientId: userId },
      orderBy: { createdAt: "asc" },
      include: { bases: true, catalogProgram: { select: { name: true, coach: person } } },
    }),
    db.coachProgram.findMany({ where: { coachId: userId }, orderBy: { createdAt: "asc" }, include: { days: { orderBy: { weekday: "asc" }, include: { template: { select: { name: true } } } } } }),
    db.coachProgram.findMany({
      where: { coachId: userId, publishedAt: { not: null } },
      orderBy: { publishedAt: "asc" },
      select: { id: true, name: true, catalogDescription: true, publishedAt: true, hiddenAt: true },
    }),
    db.notification.findMany({ where: { userId }, orderBy: { createdAt: "asc" }, select: { type: true, title: true, body: true, createdAt: true } }),
    db.userItem.findMany({ where: { userId }, orderBy: { acquiredAt: "asc" }, select: { code: true, acquiredAt: true } }),
    db.coinTx.findMany({ where: { userId }, orderBy: { createdAt: "asc" }, select: { amount: true, reason: true, createdAt: true } }),
    // Токены не выбираем вовсе
    db.whoopConnection.findUnique({ where: { userId }, select: { whoopUserId: true, createdAt: true, consentAt: true } }),
    db.whoopWorkout.findMany({
      where: { userId },
      orderBy: { start: "asc" },
      select: { id: true, start: true, end: true, sportName: true, scoreState: true, strain: true, avgHr: true, maxHr: true, kilojoule: true, zonesMs: true, updatedAt: true },
    }),
    db.favoriteExercise.findMany({ where: { userId }, orderBy: { createdAt: "asc" }, select: { createdAt: true, exercise: { select: { name: true } } } }),
  ]);

  const counts = await participants(publishedPrograms.map((p) => p.id));

  return {
    user,
    workouts: workouts.map(({ exercises, ...w }) => ({ ...w, exercises: exercises.map((e) => ({ name: e.exercise.name, supersetGroup: e.supersetGroup, sets: e.sets })) })),
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
    goblins,
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
    coachNotesAboutMe: coachNotesAboutMe.map((n) => ({ text: n.text, updatedAt: n.updatedAt, coach: n.coach.nickname })),
    coachRecapsAboutMe: recapsAboutMe.map((r) => ({ week: r.recap.week, coach: r.recap.coach?.nickname ?? null, data: r.data })),
    coachRecaps: coachRecaps.map((r) => ({
      week: r.week,
      totals: r.data,
      clients: r.clients.map((c) => ({ client: c.client?.nickname ?? null, data: c.data })),
    })),
    respectsGiven: respectsGiven.map((r) => ({ workoutDate: r.workout.finishedAt, exercise: r.exercise.name, to: r.workout.user.nickname })),
    respectsReceived: respectsReceived.map((r) => ({ workoutDate: r.workout.finishedAt, exercise: r.exercise.name, from: r.user.nickname })),
    kudosGiven: kudosGiven.map((k) => ({ workoutDate: k.workout.finishedAt, to: k.workout.user.nickname })),
    kudosReceived: kudosReceived.map((k) => ({ workoutDate: k.workout.finishedAt, from: k.user.nickname })),
    favoriteExercises: favorites.map((f) => ({ exercise: f.exercise.name, createdAt: f.createdAt })),
    clientNotes: clientNotes.map((n) => ({ text: n.text, updatedAt: n.updatedAt, client: n.client.nickname })),
    programs: (await programsWithNames(programs)).map(({ catalogProgram, ...p }) => ({ ...p, catalogProgram: catalogProgram ? { name: catalogProgram.name, author: catalogProgram.coach.nickname } : null })),
    coachPrograms: coachPrograms.map((p) => ({ ...p, days: p.days.map((d) => ({ weekday: d.weekday, template: d.template.name, time: d.time })) })),
    publishedPrograms: publishedPrograms.map((p) => ({ name: p.name, description: p.catalogDescription, publishedAt: p.publishedAt!, hiddenAt: p.hiddenAt, participants: counts.get(p.id) ?? 0 })),
    notifications,
    shop: { coins: user.coins, items: userItems, coinHistory: coinTx },
    whoop: whoopConnection ? { whoopUserId: whoopConnection.whoopUserId, connectedAt: whoopConnection.createdAt, consentAt: whoopConnection.consentAt, workouts: whoopWorkouts } : null,
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
        select: { exercise: { select: { name: true, isBodyweight: true } }, sets: { orderBy: { order: "asc" }, select: { weight: true, reps: true, rir: true, isWarmup: true, durationSec: true, distanceM: true } } },
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
        reps: s.durationSec ? null : s.reps,
        rir: s.rir,
        durationSec: s.durationSec,
        distanceM: s.distanceM,
      })),
    ),
  );
}

/** Базы программ — с названиями шаблонов и упражнений (шаблон тренера мог быть удалён — «Шаблон»). */
async function programsWithNames<T extends { bases: { templateId: string; exerciseId: string; weight: number; fromWeek: number }[] }>(rows: T[]) {
  const bases = rows.flatMap((r) => r.bases);
  const [templates, exercises] = await Promise.all([
    db.workoutTemplate.findMany({ where: { id: { in: bases.map((b) => b.templateId) } }, select: { id: true, name: true } }),
    db.exercise.findMany({ where: { id: { in: bases.map((b) => b.exerciseId) } }, select: { id: true, name: true } }),
  ]);
  const t = new Map(templates.map((x) => [x.id, x.name]));
  const e = new Map(exercises.map((x) => [x.id, x.name]));
  return rows.map((r) => ({
    ...r,
    bases: r.bases.map((b) => ({ template: t.get(b.templateId) ?? "Шаблон", exercise: e.get(b.exerciseId) ?? "Упражнение", weight: b.weight, fromWeek: b.fromWeek })),
  }));
}
