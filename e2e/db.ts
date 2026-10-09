import "dotenv/config";
import { randomUUID } from "node:crypto";
import pg, { Client } from "pg";

// Колонки — timestamp без зоны, в них UTC (так пишет Prisma). По умолчанию pg сериализует Date
// в локальном поясе процесса, и Postgres молча отбрасывает смещение — время уехало бы на UTC-offset.
pg.defaults.parseInputDatesAsUTC = true;

/** Прямой доступ к БД для подготовки истории в e2e (быстрее, чем прокликивать десятки тренировок). */
export async function withDb<T>(fn: (db: Client) => Promise<T>) {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  try {
    return await fn(db);
  } finally {
    await db.end();
  }
}

export async function userId(db: Client, login: string) {
  const { rows } = await db.query<{ id: string }>(`select id from "User" where login = $1`, [login]);
  return rows[0].id;
}

/** Завершённые тренировки с одним упражнением: по одной в день, начиная с `daysAgo` назад. */
export async function seedWorkouts(
  login: string,
  exerciseName: string,
  workouts: { weight: number; reps: number; sets: number }[],
  daysAgo = workouts.length + 1,
) {
  await withDb(async (db) => {
    const uid = await userId(db, login);
    const { rows } = await db.query<{ id: string }>(`select id from "Exercise" where name = $1 and "userId" is null`, [
      exerciseName,
    ]);
    const exerciseId = rows[0].id;
    for (const [i, w] of workouts.entries()) {
      const finished = new Date(Date.now() - (daysAgo - i) * 24 * 3600 * 1000);
      const started = new Date(finished.getTime() - 3600 * 1000);
      const workoutId = randomUUID();
      const weId = randomUUID();
      await db.query(
        `insert into "Workout" (id, "userId", name, status, "startedAt", "finishedAt", "durationSec", "totalVolume", "totalSets", "totalReps", "createdAt", "updatedAt")
         values ($1, $2, 'Seed', 'COMPLETED', $3, $4, 3600, $5, $6, $7, $3, $4)`,
        [workoutId, uid, started, finished, w.weight * w.reps * w.sets, w.sets, w.reps * w.sets],
      );
      await db.query(`insert into "WorkoutExercise" (id, "workoutId", "exerciseId", "order", "restSec") values ($1, $2, $3, 0, 90)`, [
        weId,
        workoutId,
        exerciseId,
      ]);
      for (let s = 0; s < w.sets; s++) {
        await db.query(
          `insert into "WorkoutSet" (id, "workoutExerciseId", "order", weight, reps, "isWarmup", "completedAt") values ($1, $2, $3, $4, $5, false, $6)`,
          [randomUUID(), weId, s, w.weight, w.reps, finished],
        );
      }
    }
  });
}

/** Два пользователя-друга с никами — без прокликивания заявок. */
export async function makeFriends(loginA: string, nickA: string, loginB: string, nickB: string) {
  await withDb(async (db) => {
    const a = await userId(db, loginA);
    const b = await userId(db, loginB);
    for (const [id, nick] of [[a, nickA], [b, nickB]]) {
      await db.query(`update "User" set nickname = $2, "nicknameKey" = lower($2) where id = $1`, [id, nick]);
    }
    await db.query(
      `insert into "Friendship" (id, "requesterId", "addresseeId", status, "acceptedAt") values ($1, $2, $3, 'ACCEPTED', now())`,
      [randomUUID(), a, b],
    );
  });
}

/** Пользователь без регистрации через UI (без argon2) — для друзей в лиге. Пароль не подходит для входа. */
export async function createUserRow(login: string) {
  await withDb((db) =>
    db.query(
      `insert into "User" (id, login, email, "passwordHash", "timeZone", "updatedAt") values ($1, $2, $3, 'x', 'Europe/Moscow', now())`,
      [randomUUID(), login, `${login}@test.local`],
    ),
  );
}

/** Понедельник n недель назад по Москве (пояс браузера в e2e), «YYYY-MM-DD». */
export function mondayWeeksAgo(n: number, now = new Date()) {
  const msk = new Date(now.getTime() + 3 * 3600_000); // Europe/Moscow — UTC+3 без перехода на летнее время
  const weekday = (msk.getUTCDay() + 6) % 7;
  return new Date(msk.getTime() - (weekday + 7 * n) * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Тренировки недели weekStart (по Москве) с подходами и XpEvent WORKOUT_COMPLETED (meta — как у finishWorkout).
 * day: 0 = пн … 6 = вс, time — местное «HH:MM» начала-конца не важно: тренировка длится 60 мин и заканчивается в time.
 */
export async function seedRecapWeek(
  login: string,
  weekStart: string,
  workouts: { day: number; time: string; exercise: string; weight: number; reps: number; sets: number; xp: number }[],
) {
  await withDb(async (db) => {
    const uid = await userId(db, login);
    await db.query(`update "User" set "timeZone" = 'Europe/Moscow' where id = $1`, [uid]);
    for (const [i, w] of workouts.entries()) {
      const { rows } = await db.query<{ id: string }>(`select id from "Exercise" where name = $1 and "userId" is null`, [w.exercise]);
      const date = new Date(Date.parse(`${weekStart}T12:00:00Z`) + w.day * 86_400_000).toISOString().slice(0, 10);
      const finished = new Date(`${date}T${w.time}:00+03:00`);
      const started = new Date(finished.getTime() - 3600_000);
      const workoutId = randomUUID();
      const weId = randomUUID();
      await db.query(
        `insert into "Workout" (id, "userId", name, status, "startedAt", "finishedAt", "durationSec", "totalVolume", "totalSets", "totalReps", "xpEarned", "createdAt", "updatedAt")
         values ($1, $2, 'Seed', 'COMPLETED', $3, $4, 3600, $5, $6, $7, $8, $3, $4)`,
        [workoutId, uid, started, finished, w.weight * w.reps * w.sets, w.sets, w.reps * w.sets, w.xp],
      );
      await db.query(`insert into "WorkoutExercise" (id, "workoutId", "exerciseId", "order", "restSec") values ($1, $2, $3, 0, 90)`, [
        weId,
        workoutId,
        rows[0].id,
      ]);
      for (let s = 0; s < w.sets; s++) {
        await db.query(
          `insert into "WorkoutSet" (id, "workoutExerciseId", "order", weight, reps, "isWarmup", "completedAt") values ($1, $2, $3, $4, $5, false, $6)`,
          [randomUUID(), weId, s, w.weight, w.reps, finished],
        );
      }
      const meta = {
        xpBefore: 0, levelBefore: 1, levelAfter: 1, workoutXp: w.xp, recordsXp: 0, achievementsXp: 0,
        records: [], achievements: [], streak: 1, streakExtended: false, streakReset: false, usedFreezes: 0, weekCount: i + 1,
      };
      await db.query(
        `insert into "XpEvent" (id, "userId", amount, reason, "workoutId", meta, "createdAt") values ($1, $2, $3, 'WORKOUT_COMPLETED', $4, $5, $6)`,
        [randomUUID(), uid, w.xp, workoutId, JSON.stringify(meta), finished],
      );
    }
  });
}

export async function addSubscription(login: string, sub: { endpoint: string; p256dh: string; auth: string }) {
  await withDb(async (db) => {
    await db.query(`insert into "PushSubscription" (id, "userId", endpoint, p256dh, auth) values ($1, $2, $3, $4, $5)`, [
      randomUUID(),
      await userId(db, login),
      sub.endpoint,
      sub.p256dh,
      sub.auth,
    ]);
  });
}

/** Экскурсию снова показать (в e2e ONBOARDING_TOUR=off — новые пользователи её уже «прошли»). */
export async function resetOnboarding(login: string) {
  await withDb((db) => db.query(`update "User" set "onboardedAt" = null where login = $1`, [login]));
}

/** Режим тренера с ником и кодом приглашения; возвращает код (без дефиса). */
export async function enableCoach(login: string, nickname: string) {
  // Алфавит кода друга/тренера — без 0/O, 1/I/L
  const ABC = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const code = Array.from(randomUUID().replace(/-/g, "").slice(0, 8), (ch) => ABC[parseInt(ch, 16) % ABC.length]).join("");
  await withDb((db) =>
    db.query(`update "User" set nickname = $2, "nicknameKey" = lower($2), "isCoach" = true, "coachCode" = $3 where login = $1`, [
      login,
      nickname,
      code,
    ]),
  );
  return code;
}

/** Активная связь тренер → клиент (минуя экран согласия). */
export async function linkCoach(coachLogin: string, clientLogin: string) {
  await withDb(async (db) => {
    await db.query(`insert into "CoachLink" (id, "coachId", "clientId") values ($1, $2, $3)`, [
      randomUUID(),
      await userId(db, coachLogin),
      await userId(db, clientLogin),
    ]);
  });
}

export async function activeCoachLinks(clientLogin: string) {
  return withDb(async (db) => {
    const { rows } = await db.query<{ coach: string }>(
      `select c.login as coach from "CoachLink" l join "User" c on c.id = l."coachId" join "User" u on u.id = l."clientId"
       where u.login = $1 and l."endedAt" is null`,
      [clientLogin],
    );
    return rows.map((r) => r.coach);
  });
}

export async function idOf(login: string) {
  return withDb((db) => userId(db, login));
}

/** Шаблон тренера из двух встроенных упражнений; возвращает id. */
export async function coachTemplate(coachLogin: string, name: string) {
  return withDb(async (db) => {
    const id = randomUUID();
    await db.query(`insert into "WorkoutTemplate" (id, "userId", name, "updatedAt") values ($1, $2, $3, now())`, [
      id,
      await userId(db, coachLogin),
      name,
    ]);
    const { rows } = await db.query<{ id: string }>(
      `select id from "Exercise" where "userId" is null and name in ('Приседания со штангой', 'Жим ногами') order by name desc`,
    );
    for (const [order, ex] of rows.entries()) {
      await db.query(
        `insert into "TemplateExercise" (id, "templateId", "exerciseId", "order", "targetSets", "targetReps") values ($1, $2, $3, $4, 3, 10)`,
        [randomUUID(), id, ex.id, order],
      );
    }
    return id;
  });
}

/** Разовое назначение тренера клиенту на дату (минуя UI); возвращает ключ вхождения `e:<id>`. */
export async function coachAssignOnce(coachLogin: string, clientLogin: string, templateId: string, title: string, date: string, time = "19:00") {
  return withDb(async (db) => {
    const id = randomUUID();
    await db.query(
      `insert into "PlanEntry" (id, "userId", "coachId", "templateId", title, date, time, "durationMin", "updatedAt")
       values ($1, $2, $3, $4, $5, $6, $7, 60, now())`,
      [id, await userId(db, clientLogin), await userId(db, coachLogin), templateId, title, date, time],
    );
    return `e:${id}`;
  });
}
