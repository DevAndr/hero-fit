import "dotenv/config";
import { randomUUID } from "node:crypto";
import pg, { Client } from "pg";
import { E2E_TZ, E2E_TZ_OFFSET, localAt } from "./tz";

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
      `insert into "User" (id, login, email, "passwordHash", "timeZone", "updatedAt") values ($1, $2, $3, 'x', $4, now())`,
      [randomUUID(), login, `${login}@test.local`, E2E_TZ],
    ),
  );
}

/** Понедельник n недель назад в поясе e2e (e2e/tz.ts), «YYYY-MM-DD». */
export function mondayWeeksAgo(n: number, now = new Date()) {
  const local = new Date(now.getTime() + E2E_TZ_OFFSET * 3600_000);
  const weekday = (local.getUTCDay() + 6) % 7;
  return new Date(local.getTime() - (weekday + 7 * n) * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Тренировки недели weekStart (в поясе e2e) с подходами и XpEvent WORKOUT_COMPLETED (meta — как у finishWorkout).
 * day: 0 = пн … 6 = вс, time — местное «HH:MM» начала-конца не важно: тренировка длится 60 мин и заканчивается в time.
 */
export async function seedRecapWeek(
  login: string,
  weekStart: string,
  workouts: { day: number; time: string; exercise: string; weight: number; reps: number; sets: number; xp: number }[],
) {
  await withDb(async (db) => {
    const uid = await userId(db, login);
    await db.query(`update "User" set "timeZone" = $2 where id = $1`, [uid, E2E_TZ]);
    for (const [i, w] of workouts.entries()) {
      const { rows } = await db.query<{ id: string }>(`select id from "Exercise" where name = $1 and "userId" is null`, [w.exercise]);
      const date = new Date(Date.parse(`${weekStart}T12:00:00Z`) + w.day * 86_400_000).toISOString().slice(0, 10);
      const finished = localAt(date, w.time);
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
export async function linkCoach(coachLogin: string, clientLogin: string, since?: Date) {
  await withDb(async (db) => {
    await db.query(`insert into "CoachLink" (id, "coachId", "clientId", "createdAt") values ($1, $2, $3, coalesce($4, now()))`, [
      randomUUID(),
      await userId(db, coachLogin),
      await userId(db, clientLogin),
      since ?? null,
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

/** Шаблон тренера из двух встроенных упражнений (+ своё упражнение тренера ownExercise); возвращает id. */
export async function coachTemplate(coachLogin: string, name: string, ownExercise?: string) {
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
    if (ownExercise) {
      const exId = randomUUID();
      await db.query(`insert into "Exercise" (id, "userId", name, "muscleGroups", "updatedAt") values ($1, $2, $3, '{LEGS}', now())`, [
        exId,
        await userId(db, coachLogin),
        ownExercise,
      ]);
      rows.push({ id: exId });
    }
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
export async function coachAssignOnce(
  coachLogin: string,
  clientLogin: string,
  templateId: string,
  title: string,
  date: string,
  time = "19:00",
  /** Когда назначено (по умолчанию — сейчас); назначенное позже своей даты сигналом пропуска не считается. */
  assignedAt?: Date,
) {
  return withDb(async (db) => {
    const id = randomUUID();
    await db.query(
      `insert into "PlanEntry" (id, "userId", "coachId", "templateId", title, date, time, "durationMin", "createdAt", "updatedAt")
       values ($1, $2, $3, $4, $5, $6, $7, 60, coalesce($8, now()), now())`,
      [id, await userId(db, clientLogin), await userId(db, coachLogin), templateId, title, date, time, assignedAt ?? null],
    );
    return `e:${id}`;
  });
}

/** Задание тренера клиенту по упражнению шаблона (минуя UI). */
export async function coachTarget(
  clientLogin: string,
  templateId: string,
  exerciseName: string,
  t: { sets?: number; reps?: number; weight?: number; step?: number; fails?: number },
) {
  await withDb(async (db) => {
    await db.query(
      `insert into "CoachTarget" (id, "clientId", "templateId", "exerciseId", sets, reps, weight, step, fails, "updatedAt")
       select $1, $2, $3, e.id, $5, $6, $7, $8, $9, now() from "Exercise" e where e.name = $4 and e."userId" is null`,
      [randomUUID(), await userId(db, clientLogin), templateId, exerciseName, t.sets ?? null, t.reps ?? null, t.weight ?? null, t.step ?? null, t.fails ?? 0],
    );
  });
}

export async function coachTargetCount(clientLogin: string) {
  return withDb(async (db) => {
    const { rows } = await db.query<{ c: number }>(`select count(*)::int c from "CoachTarget" where "clientId" = $1`, [await userId(db, clientLogin)]);
    return rows[0].c;
  });
}

export async function coachTargetRow(clientLogin: string, exerciseName: string) {
  return withDb(async (db) => {
    const { rows } = await db.query<{ weight: number | null; fails: number }>(
      `select t.weight, t.fails from "CoachTarget" t join "Exercise" e on e.id = t."exerciseId" where t."clientId" = $1 and e.name = $2`,
      [await userId(db, clientLogin), exerciseName],
    );
    return rows[0];
  });
}

/** Задание целиком (подходы, повторы, вес, шаг, неудачи) — для проверки копирования плана. */
export async function coachTargetFull(clientLogin: string, exerciseName: string) {
  return withDb(async (db) => {
    const { rows } = await db.query<{ sets: number | null; reps: number | null; weight: number | null; step: number | null; fails: number }>(
      `select t.sets, t.reps, t.weight, t.step, t.fails from "CoachTarget" t join "Exercise" e on e.id = t."exerciseId" where t."clientId" = $1 and e.name = $2`,
      [await userId(db, clientLogin), exerciseName],
    );
    return rows[0];
  });
}

/** Профиль публичной страницы тренера (минуя UI); publish — сразу опубликован. */
export async function coachProfile(
  coachLogin: string,
  p: { about: string; publish?: boolean; city?: string; displayName?: string; hiddenStats?: string[]; specialties?: string[] },
) {
  await withDb(async (db) => {
    await db.query(
      `insert into "CoachProfile" ("userId", "displayName", city, about, specialties, "hiddenStats", "publishedAt", "updatedAt")
       values ($1, $2, $3, $4, $5, $6, $7, now())
       on conflict ("userId") do update set "displayName" = $2, city = $3, about = $4, specialties = $5, "hiddenStats" = $6, "publishedAt" = $7, "updatedAt" = now()`,
      [await userId(db, coachLogin), p.displayName ?? null, p.city ?? null, p.about, p.specialties ?? [], p.hiddenStats ?? [], p.publish ? new Date() : null],
    );
  });
}

/** Последний токен привязки Telegram пользователя. */
export async function telegramToken(login: string) {
  return withDb(async (db) => {
    const { rows } = await db.query<{ token: string }>(
      `select t.token from "TelegramLinkToken" t join "User" u on u.id = t."userId" where u.login = $1 order by t."createdAt" desc limit 1`,
      [login],
    );
    return rows[0]?.token ?? null;
  });
}

/** Привязанный чат Telegram (строкой) или null. */
export async function telegramChat(login: string) {
  return withDb(async (db) => {
    const { rows } = await db.query<{ chat: string | null }>(`select "telegramChatId"::text as chat from "User" where login = $1`, [login]);
    return rows[0]?.chat ?? null;
  });
}

/** Быстрая привязка Telegram без прохода через бота. */
export async function linkTelegram(login: string, chatId: string) {
  await withDb((db) =>
    db.query(`update "User" set "telegramChatId" = $2::bigint, "telegramUsername" = 'e2e', "telegramLinkedAt" = now() where login = $1`, [login, chatId]),
  );
}

/** Запись в очередь уведомлений (её разошлёт тик / фоновый воркер). */
export async function queuePush(login: string, p: { type: string; title: string; body: string; url?: string | null; sendAt?: Date }) {
  await withDb(async (db) => {
    await db.query(
      `insert into "ScheduledPush" (id, "userId", type, title, body, url, "sendAt") values ($1, $2, $3::"NotificationType", $4, $5, $6, $7)`,
      [randomUUID(), await userId(db, login), p.type, p.title, p.body, p.url ?? null, p.sendAt ?? new Date()],
    );
  });
}

export async function setNotifyTelegram(login: string, on: boolean) {
  await withDb((db) => db.query(`update "User" set "notifyTelegram" = $2 where login = $1`, [login, on]));
}

/** Ожидающие записи очереди пользователя — к отправке сейчас. */
export async function duePushesNow(login: string) {
  await withDb(async (db) => db.query(`update "ScheduledPush" set "sendAt" = now() where "userId" = $1 and "sentAt" is null`, [await userId(db, login)]));
}

/** Аккаунт из Telegram Mini App без email и пароля (логин tg<id>, Telegram привязан). Возвращает логин. */
export async function createTelegramUser(telegramId: string) {
  const login = `tg${telegramId}`;
  await withDb((db) =>
    db.query(
      `insert into "User" (id, login, name, "telegramId", "telegramChatId", "telegramLinkedAt", "privacyAcceptedAt", "onboardedAt", "timeZone", "updatedAt")
       values ($1, $2, 'Из Telegram', $3::bigint, $3::bigint, now(), now(), now(), $4, now())`,
      [randomUUID(), login, telegramId, E2E_TZ],
    ),
  );
  return login;
}

/** Вход в Mini App (telegramId) — строкой или null. */
export async function telegramLoginId(login: string) {
  return withDb(async (db) => {
    const { rows } = await db.query<{ id: string | null }>(`select "telegramId"::text as id from "User" where login = $1`, [login]);
    return rows[0]?.id ?? null;
  });
}

/** Подправить задание тренера (неудачи подряд, время разгрузки) — минуя прогрессию. */
export async function coachTargetSet(clientLogin: string, exerciseName: string, patch: { fails?: number; unloadedAt?: Date }) {
  await withDb(async (db) => {
    await db.query(
      `update "CoachTarget" t set fails = coalesce($3, t.fails), "unloadedAt" = coalesce($4, t."unloadedAt")
       from "Exercise" e where e.id = t."exerciseId" and e.name = $2 and t."clientId" = $1`,
      [await userId(db, clientLogin), exerciseName, patch.fails ?? null, patch.unloadedAt ?? null],
    );
  });
}

/** Уведомления тренеру (тип COACH) по порядку. */
export async function coachNotifications(coachLogin: string) {
  return withDb(async (db) => {
    const { rows } = await db.query<{ title: string; url: string }>(
      `select title, url from "Notification" where "userId" = $1 and type = 'COACH' order by "createdAt"`,
      [await userId(db, coachLogin)],
    );
    return rows;
  });
}

/** Отметить все уведомления пользователя прочитанными (как открытый колокольчик). */
export async function readNotifications(login: string) {
  await withDb(async (db) => {
    await db.query(`update "Notification" set "readAt" = now() where "userId" = $1 and "readAt" is null`, [await userId(db, login)]);
  });
}

/** Сигналы тренера (для проверки тика): тип и снят ли. */
export async function coachSignals(coachLogin: string) {
  return withDb(async (db) => {
    const { rows } = await db.query<{ kind: string; resolvedAt: Date | null }>(
      `select kind, "resolvedAt" from "CoachSignal" where "coachId" = $1 order by "createdAt"`,
      [await userId(db, coachLogin)],
    );
    return rows;
  });
}

/** Пояс пользователя = пояс e2e сразу (браузер записывает его из cookie только на следующем запросе). */
export async function setTimeZone(login: string) {
  await withDb(async (db) => {
    await db.query(`update "User" set "timeZone" = $2 where id = $1`, [await userId(db, login), E2E_TZ]);
  });
}

/** Сбросить день проверки сигналов тренера — следующий тик проверит его заново (без тестовых часов). */
export async function resetCoachSignalsDay(coachLogin: string) {
  await withDb(async (db) => {
    await db.query(`update "User" set "coachSignalsDay" = null where id = $1`, [await userId(db, coachLogin)]);
  });
}
