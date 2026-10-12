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
  opts: { templateId?: string } = {},
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
        `insert into "Workout" (id, "userId", name, status, "startedAt", "finishedAt", "durationSec", "totalVolume", "totalSets", "totalReps", "createdAt", "updatedAt", "templateId")
         values ($1, $2, 'Seed', 'COMPLETED', $3, $4, 3600, $5, $6, $7, $3, $4, $8)`,
        [workoutId, uid, started, finished, w.weight * w.reps * w.sets, w.sets, w.reps * w.sets, opts.templateId ?? null],
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

/** Свой шаблон с одним упражнением (минуя UI); step — своя прогрессия. */
export async function ownTemplate(
  login: string,
  name: string,
  exerciseName: string,
  row: { sets: number; reps: number | null; weight: number | null; step: number | null; fails?: number },
) {
  return withDb(async (db) => {
    const id = randomUUID();
    await db.query(`insert into "WorkoutTemplate" (id, "userId", name, "updatedAt") values ($1, $2, $3, now())`, [id, await userId(db, login), name]);
    await db.query(
      `insert into "TemplateExercise" (id, "templateId", "exerciseId", "order", "targetSets", "targetReps", "targetWeight", step, fails)
       select $1, $2, e.id, 0, $4, $5, $6, $7, $8 from "Exercise" e where e.name = $3 and e."userId" is null`,
      [randomUUID(), id, exerciseName, row.sets, row.reps, row.weight, row.step, row.fails ?? 0],
    );
    return id;
  });
}

/** Строка своего шаблона по названию упражнения: вес цели, шаг, неудачи. */
export async function templateRow(templateId: string, exerciseName: string) {
  return withDb(async (db) => {
    const { rows } = await db.query<{ targetWeight: number | null; step: number | null; fails: number }>(
      `select t."targetWeight", t.step, t.fails from "TemplateExercise" t join "Exercise" e on e.id = t."exerciseId"
       where t."templateId" = $1 and e.name = $2`,
      [templateId, exerciseName],
    );
    return rows[0];
  });
}

/** Ник пользователю (минуя UI). */
export async function setNickname(login: string, nickname: string) {
  await withDb(async (db) => {
    await db.query(`update "User" set nickname = $2, "nicknameKey" = lower($2) where login = $1`, [login, nickname]);
  });
}

/** Настройки приватности пользователя (минуя UI). */
export async function setPrivacy(login: string, p: { shareActivity?: boolean; hideWeights?: boolean }) {
  await withDb(async (db) => {
    await db.query(`update "User" set "shareActivity" = coalesce($2, "shareActivity"), "hideWeights" = coalesce($3, "hideWeights") where login = $1`, [
      login,
      p.shareActivity ?? null,
      p.hideWeights ?? null,
    ]);
  });
}

/** Ссылки уведомлений пользователя (новые первыми). */
export async function notificationUrls(login: string) {
  return withDb(async (db) => {
    const { rows } = await db.query<{ url: string | null }>(
      `select n.url from "Notification" n join "User" u on u.id = n."userId" where u.login = $1 order by n."createdAt" desc`,
      [login],
    );
    return rows.map((r) => r.url);
  });
}

/** Гильдия пользователя: название и глава ли он; нет гильдии — null. */
export async function guildOf(login: string) {
  return withDb(async (db) => {
    const { rows } = await db.query<{ name: string; leader: boolean; code: string }>(
      `select g.name, g."leaderId" = u.id as leader, g.code from "GuildMember" m join "Guild" g on g.id = m."guildId" join "User" u on u.id = m."userId" where u.login = $1`,
      [login],
    );
    return rows[0] ?? null;
  });
}

/** Добить гильдию пользователями-заглушками до n участников. */
export async function fillGuild(code: string, n: number) {
  await withDb(async (db) => {
    const { rows } = await db.query<{ id: string; c: number }>(
      `select g.id, (select count(*)::int from "GuildMember" m where m."guildId" = g.id) c from "Guild" g where g.code = $1`,
      [code],
    );
    for (let i = rows[0].c; i < n; i++) {
      const uid = randomUUID();
      const login = `e2e_fill_${uid.slice(0, 12)}`;
      await db.query(`insert into "User" (id, login, email, "passwordHash", "updatedAt") values ($1, $2, $3, 'x', now())`, [uid, login, `${login}@test.local`]);
      await db.query(`insert into "GuildMember" ("userId", "guildId") values ($1, $2)`, [uid, rows[0].id]);
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

/** Закрыть все активные связи тренера (минуя UI и `dropAssignments`). */
export async function endCoachLinks(coachLogin: string) {
  await withDb(async (db) => {
    await db.query(`update "CoachLink" set "endedAt" = now() where "coachId" = $1 and "endedAt" is null`, [await userId(db, coachLogin)]);
  });
}

/** Строк членства в группах тренера (разрыв связи их удаляет). */
export async function coachGroupMembers(coachLogin: string) {
  return withDb(async (db) => {
    const { rows } = await db.query<{ c: number }>(
      `select count(*)::int c from "CoachGroupMember" m join "CoachGroup" g on g.id = m."groupId" where g."coachId" = $1`,
      [await userId(db, coachLogin)],
    );
    return rows[0].c;
  });
}

/** Профиль публичной страницы тренера (минуя UI); publish — сразу опубликован. */
export async function coachProfile(
  coachLogin: string,
  p: {
    about: string;
    publish?: boolean;
    city?: string;
    displayName?: string;
    hiddenStats?: string[];
    specialties?: string[];
    showAwards?: boolean;
  },
) {
  await withDb(async (db) => {
    await db.query(
      `insert into "CoachProfile" ("userId", "displayName", city, about, specialties, "hiddenStats", "publishedAt", "showAwards", "updatedAt")
       values ($1, $2, $3, $4, $5, $6, $7, $8, now())
       on conflict ("userId") do update set "displayName" = $2, city = $3, about = $4, specialties = $5, "hiddenStats" = $6, "publishedAt" = $7, "showAwards" = $8, "updatedAt" = now()`,
      [
        await userId(db, coachLogin),
        p.displayName ?? null,
        p.city ?? null,
        p.about,
        p.specialties ?? [],
        p.hiddenStats ?? [],
        p.publish ? new Date() : null,
        p.showAwards ?? true,
      ],
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

/** Рейд текущего окна гильдии игрока: HP, суммарный урон, победа, MVP (логин) и удары по игрокам; нет — null. */
export async function raidOf(login: string) {
  return withDb(async (db) => {
    const { rows } = await db.query<{ id: string; hp: number; defeated: boolean; mvp: string | null }>(
      `select r.id, r.hp, r."defeatedAt" is not null as defeated, mu.login as mvp
       from "GuildMember" m join "User" u on u.id = m."userId" join "RaidWeek" r on r."guildId" = m."guildId"
       left join "User" mu on mu.id = r."mvpUserId"
       where u.login = $1 and r."startsAt" <= (now() at time zone 'UTC') and r."endsAt" > (now() at time zone 'UTC')`,
      [login],
    );
    if (!rows[0]) return null;
    const hits = await db.query<{ login: string; damage: number }>(
      `select u.login, sum(h.damage)::int as damage from "RaidHit" h join "User" u on u.id = h."userId"
       where h."raidId" = $1 group by u.login order by u.login`,
      [rows[0].id],
    );
    return { ...rows[0], damage: hits.rows.reduce((s, h) => s + h.damage, 0), hits: hits.rows };
  });
}

/** HP рейда текущего окна гильдии игрока (рейд уже должен быть создан — тренировкой или заходом на /guild). */
export async function setRaidHp(login: string, hp: number) {
  await withDb(async (db) => {
    const { rowCount } = await db.query(
      `update "RaidWeek" r set hp = $2 from "GuildMember" m join "User" u on u.id = m."userId"
       where u.login = $1 and r."guildId" = m."guildId" and r."startsAt" <= (now() at time zone 'UTC') and r."endsAt" > (now() at time zone 'UTC')`,
      [login, hp],
    );
    if (!rowCount) throw new Error(`setRaidHp: нет рейда у ${login}`);
  });
}

/** Рейд гильдии игрока на неделю `week` (понедельник в поясе e2e) с заданным HP — для тиков с тестовыми часами. */
export async function createRaid(login: string, week: string, hp: number) {
  await withDb(async (db) => {
    const startsAt = localAt(week, "00:00");
    await db.query(
      `insert into "RaidWeek" (id, "guildId", week, "startsAt", "endsAt", "bossCode", hp)
       select $2, m."guildId", $3, $4, $5, 'golem', $6 from "GuildMember" m join "User" u on u.id = m."userId" where u.login = $1`,
      [login, randomUUID(), week, startsAt, new Date(startsAt.getTime() + 7 * 86_400_000), hp],
    );
  });
}

/** Тексты уведомлений пользователя (новые первыми). */
export async function notificationBodies(login: string) {
  return withDb(async (db) => {
    const { rows } = await db.query<{ body: string }>(
      `select n.body from "Notification" n join "User" u on u.id = n."userId" where u.login = $1 order by n."createdAt" desc`,
      [login],
    );
    return rows.map((r) => r.body);
  });
}

/** Коды полученных ачивок пользователя. */
export async function achievementCodes(login: string) {
  return withDb(async (db) => {
    const { rows } = await db.query<{ code: string }>(
      `select a.code from "UserAchievement" a join "User" u on u.id = a."userId" where u.login = $1`,
      [login],
    );
    return rows.map((r) => r.code);
  });
}

/**
 * Рейд гильдии игрока на неделю `week` (понедельник в поясе e2e) с ударами по его завершённым тренировкам этой недели:
 * 100 за выполненный рабочий подход. defeated — рейд повержен (MVP — этот игрок); leaderEastHours — пояс главы восточнее.
 */
export async function seedRaidHits(login: string, week: string, hp: number, defeated: boolean, leaderEastHours = 0) {
  await withDb(async (db) => {
    const uid = await userId(db, login);
    // Окно рейда — в поясе главы: восточнее игрока на leaderEastHours часов
    const startsAt = new Date(localAt(week, "00:00").getTime() - leaderEastHours * 3600_000);
    const endsAt = new Date(startsAt.getTime() + 7 * 86_400_000);
    const raidId = randomUUID();
    await db.query(
      `insert into "RaidWeek" (id, "guildId", week, "startsAt", "endsAt", "bossCode", hp, "defeatedAt", "mvpUserId")
       select $1, m."guildId", $2, $3, $4, 'golem', $5, $6, $7 from "GuildMember" m where m."userId" = $8`,
      [raidId, week, startsAt, endsAt, hp, defeated ? endsAt : null, defeated ? uid : null, uid],
    );
    await db.query(
      `insert into "RaidHit" (id, "raidId", "userId", "workoutId", damage, crits)
       select gen_random_uuid()::text, $1, $2, w.id,
              100 * (select count(*) from "WorkoutExercise" we join "WorkoutSet" s on s."workoutExerciseId" = we.id
                     where we."workoutId" = w.id and not s."isWarmup" and s."completedAt" is not null), 0
       from "Workout" w where w."userId" = $2 and w.status = 'COMPLETED' and w."finishedAt" >= $3 and w."finishedAt" < $4`,
      [raidId, uid, startsAt, endsAt],
    );
  });
}

/** Цель минуя UI (по умолчанию активная, без срока); exerciseName — встроенное или своё упражнение пользователя. */
export async function createGoal(
  login: string,
  g: {
    type: "STRENGTH" | "WORKOUTS" | "STREAK" | "HOURS" | "BODY_WEIGHT";
    target: number;
    startValue?: number;
    exerciseName?: string;
    metric?: "ONE_RM" | "MAX_WEIGHT" | "MAX_REPS";
    deadline?: string | null;
    createdAt?: Date;
    status?: "ACTIVE" | "ACHIEVED";
  },
) {
  return withDb(async (db) => {
    const uid = await userId(db, login);
    let exerciseId: string | null = null;
    if (g.exerciseName) {
      const { rows } = await db.query<{ id: string }>(
        `select id from "Exercise" where name = $1 and ("userId" is null or "userId" = $2) order by "userId" nulls last limit 1`,
        [g.exerciseName, uid],
      );
      exerciseId = rows[0].id;
    }
    const id = randomUUID();
    const achieved = g.status === "ACHIEVED" ? new Date() : null;
    await db.query(
      `insert into "Goal" (id, "userId", type, "exerciseId", metric, target, "startValue", deadline, status, "createdAt", "achievedAt", "closedAt")
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11)`,
      [id, uid, g.type, exerciseId, g.metric ?? (g.exerciseName ? "MAX_WEIGHT" : null), g.target, g.startValue ?? 0, g.deadline ?? null, g.status ?? "ACTIVE", g.createdAt ?? new Date(), achieved],
    );
    return id;
  });
}

export async function goalOf(id: string) {
  return withDb(async (db) => {
    const { rows } = await db.query<{ status: string; chestOpenedAt: Date | null; deadline: string | null }>(
      `select status, "chestOpenedAt", deadline from "Goal" where id = $1`,
      [id],
    );
    return rows[0] ?? null;
  });
}

/** Цели пользователя (id и статус) — по порядку постановки. */
export async function goalsOf(login: string) {
  return withDb(async (db) => {
    const uid = await userId(db, login);
    const { rows } = await db.query<{ id: string; status: string; target: number }>(
      `select id, status, target from "Goal" where "userId" = $1 order by "createdAt"`,
      [uid],
    );
    return rows;
  });
}

/** Взвешивание за местную дату `date`. */
export async function logWeight(login: string, date: string, weight: number) {
  await withDb(async (db) => {
    const uid = await userId(db, login);
    await db.query(
      `insert into "BodyWeightEntry" (id, "userId", date, weight) values ($1, $2, $3, $4)
       on conflict ("userId", date) do update set weight = excluded.weight`,
      [randomUUID(), uid, date, weight],
    );
    await db.query(`update "User" set "bodyWeight" = $2 where id = $1`, [uid, weight]);
  });
}

/** Сколько XP начислено сундуками целей. */
export async function goalRewardXp(login: string) {
  return withDb(async (db) => {
    const uid = await userId(db, login);
    const { rows } = await db.query<{ xp: number }>(
      `select coalesce(sum(amount), 0)::int as xp from "XpEvent" where "userId" = $1 and reason = 'GOAL_REWARD'`,
      [uid],
    );
    return rows[0].xp;
  });
}

/** Логин админа в e2e (ADMIN_LOGINS в playwright.config.ts). */
export const E2E_ADMIN = "e2e_flag_admin";

/** Сделать пользователя админом: логин E2E_ADMIN освобождается у прежнего владельца (прошлые прогоны). */
export async function makeAdmin(login: string) {
  await withDb(async (db) => {
    await db.query(`update "User" set login = 'e2e_old_' || id where login = $1`, [E2E_ADMIN]);
    await db.query(`update "User" set login = $2 where login = $1`, [login, E2E_ADMIN]);
  });
}

/** Состояние фича-флага (минуя админку); logins — список «всегда включён». */
export async function setFlag(key: string, s: { enabled: boolean; percent?: number; logins?: string[] }) {
  await withDb(async (db) => {
    const { rows } = await db.query<{ id: string }>(`select id from "User" where login = any($1)`, [s.logins ?? []]);
    await db.query(
      `insert into "FeatureFlag" (key, enabled, percent, "userIds", "updatedAt") values ($1, $2, $3, $4, now())
       on conflict (key) do update set enabled = $2, percent = $3, "userIds" = $4, "updatedAt" = now()`,
      [key, s.enabled, s.percent ?? 0, rows.map((r) => r.id)],
    );
  });
}

export async function resetFlag(key: string) {
  await withDb((db) => db.query(`delete from "FeatureFlag" where key = $1`, [key]));
}

/** Последний просмотренный релиз «Что нового» (null — как у старых пользователей до миграции). */
export async function setChangelogSeen(login: string, id: string | null) {
  await withDb((db) => db.query(`update "User" set "changelogSeen" = $2 where login = $1`, [login, id]));
}

/** Самочувствие из чек-ина помощника. */
export async function workoutWellbeing(id: string): Promise<string | null> {
  return withDb(async (db) => (await db.query<{ wellbeing: string | null }>(`select wellbeing from "Workout" where id = $1`, [id])).rows[0]?.wellbeing ?? null);
}

export async function assistantEnabled(login: string): Promise<boolean> {
  return withDb(async (db) => (await db.query<{ v: boolean }>(`select "assistantEnabled" as v from "User" where login = $1`, [login])).rows[0].v);
}

/** Добавить пользователя в список флага, не затирая чужих (параллельные тесты), флаг включён. */
export async function addFlagUser(key: string, login: string) {
  await withDb((db) =>
    db.query(
      `insert into "FeatureFlag" (key, enabled, percent, "userIds", "updatedAt")
       select $1, true, 0, array[id], now() from "User" where login = $2
       on conflict (key) do update set enabled = true, "userIds" = array_append(array_remove("FeatureFlag"."userIds", excluded."userIds"[1]), excluded."userIds"[1]), "updatedAt" = now()`,
      [key, login],
    ),
  );
}

/** Алфавит кода друга (lib/social/league.ts). */
const CLUB_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** Клуб в БД минуя заявку; админ — login. Ключи — как clubKey (нижний регистр, без пунктуации). */
export async function createClub(
  login: string,
  o: { status?: "PENDING" | "APPROVED" | "REJECTED" | "HIDDEN"; name?: string; city?: string; address?: string; rejectReason?: string } = {},
): Promise<{ id: string; code: string }> {
  const key = (s: string) => s.toLowerCase().replace(/ё/g, "е").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const name = o.name ?? `E2E Клуб ${Math.random().toString(36).slice(2, 8)}`;
  const city = o.city ?? "Тестоград";
  const address = o.address ?? "ул. Тестовая, 1";
  const code = Array.from({ length: 8 }, () => CLUB_CODE_ALPHABET[Math.floor(Math.random() * CLUB_CODE_ALPHABET.length)]).join("");
  return withDb(async (db) => {
    const { rows } = await db.query<{ id: string }>(
      `insert into "Club" (id, name, "nameKey", city, "cityKey", address, "addressKey", contact, code, "adminId", status, "rejectReason")
       select 'club_' || md5(random()::text), $1, $2, $3, $4, $5, $6, '+7 900 000-00-00', $7, id, $8::"ClubStatus", $9 from "User" where login = $10
       returning id`,
      [name, key(name), city, key(city), address, key(address), code, o.status ?? "APPROVED", o.rejectReason ?? null, login],
    );
    return { id: rows[0].id, code };
  });
}

/** Id клуба, в котором состоит пользователь. */
export async function clubOf(login: string): Promise<string | null> {
  return withDb(async (db) => {
    const { rows } = await db.query<{ id: string }>(`select m."clubId" as id from "ClubMember" m join "User" u on u.id = m."userId" where u.login = $1`, [login]);
    return rows[0]?.id ?? null;
  });
}

export async function clubStatus(id: string): Promise<string> {
  return withDb(async (db) => (await db.query<{ status: string }>(`select status::text from "Club" where id = $1`, [id])).rows[0].status);
}

export async function setClubStatus(id: string, status: "PENDING" | "APPROVED" | "REJECTED" | "HIDDEN") {
  await withDb((db) => db.query(`update "Club" set status = $2::"ClubStatus" where id = $1`, [id, status]));
}

export async function clubAdminLogin(id: string): Promise<string> {
  return withDb(async (db) => (await db.query<{ login: string }>(`select u.login from "Club" c join "User" u on u.id = c."adminId" where c.id = $1`, [id])).rows[0].login);
}

/** Вступить в клуб минуя интерфейс. */
export async function joinClub(login: string, clubId: string, joinedAt?: Date) {
  await withDb((db) =>
    db.query(
      `insert into "ClubMember" ("userId", "clubId", "joinedAt") select id, $2, coalesce($3, now()) from "User" where login = $1
       on conflict ("userId") do update set "clubId" = excluded."clubId", "joinedAt" = excluded."joinedAt"`,
      [login, clubId, joinedAt ?? null],
    ),
  );
}
