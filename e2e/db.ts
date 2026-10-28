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
  opts: { templateId?: string; finishedAt?: Date[] } = {},
) {
  await withDb(async (db) => {
    const uid = await userId(db, login);
    const { rows } = await db.query<{ id: string }>(`select id from "Exercise" where name = $1 and "userId" is null`, [
      exerciseName,
    ]);
    const exerciseId = rows[0].id;
    for (const [i, w] of workouts.entries()) {
      const finished = opts.finishedAt?.[i] ?? new Date(Date.now() - (daysAgo - i) * 24 * 3600 * 1000);
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
 * records — названия упражнений с рекордом в meta, ups — повышения веса тренером (meta.progression). Возвращает id тренировок и их упражнений (по порядку).
 */
export async function seedRecapWeek(
  login: string,
  weekStart: string,
  workouts: { day: number; time: string; exercise: string; weight: number; reps: number; sets: number; xp: number; records?: string[]; ups?: { from: number; to: number }[] }[],
) {
  return withDb(async (db) => {
    const ids: { workoutId: string; workoutExerciseId: string }[] = [];
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
        records: (w.records ?? []).map((exerciseName) => ({ exerciseId: rows[0].id, exerciseName, type: "MAX_WEIGHT", value: w.weight, previous: w.weight - 5 })),
        achievements: [], streak: 1, streakExtended: false, streakReset: false, usedFreezes: 0, weekCount: i + 1,
        // Прогрессия тренера (как у finishWorkout): повышение веса упражнения тренировки
        ...(w.ups ? { progression: w.ups.map((u) => ({ exercise: w.exercise, kind: "up", from: u.from, to: u.to, fails: 0, bodyweight: false })) } : {}),
      };
      await db.query(
        `insert into "XpEvent" (id, "userId", amount, reason, "workoutId", meta, "createdAt") values ($1, $2, $3, 'WORKOUT_COMPLETED', $4, $5, $6)`,
        [randomUUID(), uid, w.xp, workoutId, JSON.stringify(meta), finished],
      );
      ids.push({ workoutId, workoutExerciseId: weId });
    }
    return ids;
  });
}

export async function addSubscription(
  login: string,
  sub: { endpoint: string; p256dh: string; auth: string },
  kind: "WEB" | "UNIFIEDPUSH" | "EMBEDDED" = "WEB",
) {
  await withDb(async (db) => {
    await db.query(`insert into "PushSubscription" (id, "userId", endpoint, p256dh, auth, kind) values ($1, $2, $3, $4, $5, $6::"PushKind")`, [
      randomUUID(),
      await userId(db, login),
      sub.endpoint,
      sub.p256dh,
      sub.auth,
      kind,
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

/** Профиль публичной страницы тренера (минуя UI); publish — сразу опубликован; contacts/consent/listed — каталог тренеров. */
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
    format?: "ONLINE" | "OFFLINE" | "BOTH";
    contacts?: Partial<Record<"telegram" | "whatsapp" | "vk" | "phone" | "email", string>>;
    consent?: boolean;
    listed?: boolean;
    /** Кнопка «Заниматься» на странице; по умолчанию включена. */
    join?: boolean;
  },
) {
  const c = p.contacts ?? {};
  await withDb(async (db) => {
    await db.query(
      `insert into "CoachProfile" ("userId", "displayName", city, about, specialties, "hiddenStats", "publishedAt", "showAwards", format,
         telegram, whatsapp, vk, phone, email, "contactsConsentAt", "catalogListed", "joinEnabled", "updatedAt")
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, now())
       on conflict ("userId") do update set "displayName" = $2, city = $3, about = $4, specialties = $5, "hiddenStats" = $6, "publishedAt" = $7,
         "showAwards" = $8, format = $9, telegram = $10, whatsapp = $11, vk = $12, phone = $13, email = $14, "contactsConsentAt" = $15,
         "catalogListed" = $16, "joinEnabled" = $17, "updatedAt" = now()`,
      [
        await userId(db, coachLogin),
        p.displayName ?? null,
        p.city ?? null,
        p.about,
        p.specialties ?? [],
        p.hiddenStats ?? [],
        p.publish ? new Date() : null,
        p.showAwards ?? true,
        p.format ?? "BOTH",
        c.telegram ?? null,
        c.whatsapp ?? null,
        c.vk ?? null,
        c.phone ?? null,
        c.email ?? null,
        p.consent ? new Date() : null,
        p.listed ?? false,
        p.join ?? true,
      ],
    );
  });
}

/** Открытия контактов тренера, всего. */
export async function contactClicks(coachLogin: string): Promise<number> {
  return withDb(async (db) => {
    const { rows } = await db.query<{ n: number }>(
      `select coalesce(sum(count), 0)::int n from "CoachContactClick" where "coachId" = $1`,
      [await userId(db, coachLogin)],
    );
    return rows[0].n;
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
    type: "STRENGTH" | "WORKOUTS" | "STREAK" | "HOURS" | "BODY_WEIGHT" | "STRETCH_HOLD" | "STRETCH_WEEKLY";
    target: number;
    stretchUnit?: "SESSIONS" | "MINUTES";
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
      `insert into "Goal" (id, "userId", type, "exerciseId", metric, target, "startValue", deadline, status, "createdAt", "achievedAt", "closedAt", "stretchUnit")
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11, $12)`,
      [id, uid, g.type, exerciseId, g.metric ?? (g.exerciseName && g.type === "STRENGTH" ? "MAX_WEIGHT" : null), g.target, g.startValue ?? 0, g.deadline ?? null, g.status ?? "ACTIVE", g.createdAt ?? new Date(), achieved, g.stretchUnit ?? null],
    );
    return id;
  });
}

/** Завершённые сессии растяжки (одно встроенное упражнение, один выполненный подход `sec` с) в моменты `finishedAt`. */
export async function seedStretchSessions(login: string, exerciseName: string, finishedAt: Date[], sec = 60) {
  await withDb(async (db) => {
    const uid = await userId(db, login);
    const { rows } = await db.query<{ id: string }>(`select id from "Exercise" where name = $1 and "userId" is null and kind = 'STRETCH'`, [exerciseName]);
    for (const finished of finishedAt) {
      const workoutId = randomUUID();
      const weId = randomUUID();
      const started = new Date(finished.getTime() - 15 * 60_000);
      await db.query(
        `insert into "Workout" (id, "userId", name, status, "startedAt", "finishedAt", "durationSec", "stretchOnly", "createdAt", "updatedAt")
         values ($1, $2, 'Растяжка', 'COMPLETED', $3, $4, 900, true, $3, $4)`,
        [workoutId, uid, started, finished],
      );
      await db.query(`insert into "WorkoutExercise" (id, "workoutId", "exerciseId", "order", "restSec") values ($1, $2, $3, 0, 30)`, [weId, workoutId, rows[0].id]);
      await db.query(
        `insert into "WorkoutSet" (id, "workoutExerciseId", "order", weight, reps, "durationSec", "isWarmup", "completedAt") values ($1, $2, 0, 0, 0, $3, false, $4)`,
        [randomUUID(), weId, sec, finished],
      );
    }
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

/** Логины админа в e2e (ADMIN_LOGINS в playwright.config.ts). */
export const E2E_ADMIN = "e2e_flag_admin";
/** Свой логин у спеки рассылок: makeAdmin соседних спек забирает E2E_ADMIN себе, и админка рассылок отвечала 404. */
export const E2E_CAMPAIGNS_ADMIN = "e2e_campaigns_admin";
/** Свой логин у спеки метрик: её сценарии часто переназначают админа и отбирали E2E_ADMIN у модерации клубов. */
export const E2E_METRICS_ADMIN = "e2e_metrics_admin";

/** Сделать пользователя админом: логин admin освобождается у прежнего владельца (прошлые тесты и прогоны). */
export async function makeAdmin(login: string, admin = E2E_ADMIN) {
  await withDb(async (db) => {
    await db.query(`update "User" set login = 'e2e_old_' || id where login = $1`, [admin]);
    await db.query(`update "User" set login = $2 where login = $1`, [login, admin]);
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

/** Включить помощника (registerUser по умолчанию его выключает). */
export async function enableAssistant(login: string) {
  await withDb((db) => db.query(`update "User" set "assistantEnabled" = true where login = $1`, [login]));
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

/** Курс «Сесть на шпагат»: следующее занятие идущего курса — n (подготовка финала, середины курса). */
export async function setCourseSession(login: string, n: number) {
  await withDb((db) =>
    db.query(
      `update "StretchCourse" set "nextSession" = $2
       where "userId" = (select id from "User" where login = $1) and status in ('ACTIVE', 'MAINTENANCE')`,
      [login, n],
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

/** Публикация страницы клуба минуя интерфейс; адрес по умолчанию — `testograd/e2e-<случайно>`. */
export async function publishClub(clubId: string, o: { about?: string; slug?: string; citySlug?: string } = {}): Promise<{ path: string }> {
  const slug = o.slug ?? `e2e-${Math.random().toString(36).slice(2, 8)}`;
  const citySlug = o.citySlug ?? "testograd";
  const about = o.about ?? "Просторный зал с тремя стойками для приседа, помостами и зоной кардио. Работаем круглосуточно.";
  await withDb((db) =>
    db.query(`update "Club" set about = $2, slug = $3, "citySlug" = $4, "publishedAt" = now() where id = $1`, [clubId, about, slug, citySlug]),
  );
  return { path: `/gym/${citySlug}/${slug}` };
}

export async function clubSlug(clubId: string): Promise<{ slug: string | null; citySlug: string | null; publishedAt: Date | null }> {
  return withDb(async (db) => {
    const { rows } = await db.query<{ slug: string | null; citySlug: string | null; publishedAt: Date | null }>(
      `select slug, "citySlug", "publishedAt" from "Club" where id = $1`,
      [clubId],
    );
    return rows[0];
  });
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

/** Завершённая тренировка с событием WORKOUT_COMPLETED (опыт и meta сводки) — для рейтинга и ленты клуба. */
export async function seedXpWorkout(login: string, o: { xp: number; meta?: object; finishedAt?: Date; name?: string }) {
  await withDb(async (db) => {
    const uid = await userId(db, login);
    const finished = o.finishedAt ?? new Date();
    const started = new Date(finished.getTime() - 3600 * 1000);
    const workoutId = randomUUID();
    await db.query(
      `insert into "Workout" (id, "userId", name, status, "startedAt", "finishedAt", "durationSec", "totalVolume", "totalSets", "totalReps", "createdAt", "updatedAt")
       values ($1, $2, $3, 'COMPLETED', $4, $5, 3600, 4321, 5, 50, $4, $5)`,
      [workoutId, uid, o.name ?? "Seed", started, finished],
    );
    // Одно упражнение с подходом — как настоящая тренировка (итоги недели ищут лучший подход)
    const ex = (await db.query<{ id: string }>(`select id from "Exercise" where name = 'Жим штанги лёжа' and "userId" is null`)).rows[0].id;
    const weId = randomUUID();
    await db.query(`insert into "WorkoutExercise" (id, "workoutId", "exerciseId", "order", "restSec") values ($1, $2, $3, 0, 90)`, [weId, workoutId, ex]);
    await db.query(
      `insert into "WorkoutSet" (id, "workoutExerciseId", "order", weight, reps, "isWarmup", "completedAt") values ($1, $2, 0, 40, 10, false, $3)`,
      [randomUUID(), weId, finished],
    );
    await db.query(
      `insert into "XpEvent" (id, "userId", amount, reason, "workoutId", meta, "createdAt") values ($1, $2, $3, 'WORKOUT_COMPLETED', $4, $5, $6)`,
      // records/achievements — как у настоящей сводки (итоги недели читают их без проверки)
      [randomUUID(), uid, o.xp, workoutId, JSON.stringify({ records: [], achievements: [], ...o.meta }), finished],
    );
  });
}

/** Пачка завершённых тренировок без событий (meta пустая), новые — ближе к текущему времени. */
export async function seedXpWorkouts(login: string, n: number) {
  for (let i = 0; i < n; i++) await seedXpWorkout(login, { xp: 50, finishedAt: new Date(Date.now() - (n - i) * 60_000) });
}

/** Задание клуба минуя интерфейс и минимумы; окно по умолчанию — со вчера на 7 дней. */
export async function createClubTask(
  clubId: string,
  o: { type: "WORKOUTS" | "VOLUME" | "REPS" | "HOURS"; mode: "CLUB" | "EACH"; target: number; exerciseName?: string; startsAt?: Date; endsAt?: Date },
): Promise<string> {
  const startsAt = o.startsAt ?? new Date(Date.now() - 24 * 3600 * 1000);
  const endsAt = o.endsAt ?? new Date(startsAt.getTime() + 7 * 24 * 3600 * 1000);
  return withDb(async (db) => {
    const ex = o.exerciseName
      ? (await db.query<{ id: string }>(`select id from "Exercise" where name = $1 and "userId" is null`, [o.exerciseName])).rows[0].id
      : null;
    const { rows } = await db.query<{ id: string }>(
      `insert into "ClubTask" (id, "clubId", type, mode, "exerciseId", target, "startsAt", "endsAt", "membersAtStart")
       values ('task_' || md5(random()::text), $1, $2::"ClubTaskType", $3::"ClubTaskMode", $4, $5, $6, $7,
               (select count(*) from "ClubMember" where "clubId" = $1)) returning id`,
      [clubId, o.type, o.mode, ex, o.target, startsAt, endsAt],
    );
    return rows[0].id;
  });
}

export async function clubTaskOf(id: string): Promise<{ completedAt: Date | null; cancelledAt: Date | null; hits: number; amount: number }> {
  return withDb(async (db) => {
    const { rows } = await db.query<{ completedAt: Date | null; cancelledAt: Date | null; hits: number; amount: number }>(
      `select t."completedAt", t."cancelledAt", (select count(*)::int from "ClubTaskHit" h where h."taskId" = t.id) as hits,
              (select coalesce(sum(amount), 0)::int from "ClubTaskHit" h where h."taskId" = t.id) as amount
       from "ClubTask" t where t.id = $1`,
      [id],
    );
    return rows[0];
  });
}

/** Логины получивших сундук задания. */
export async function clubTaskRewards(id: string): Promise<string[]> {
  return withDb(async (db) => {
    const { rows } = await db.query<{ login: string }>(
      `select u.login from "ClubTaskReward" r join "User" u on u.id = r."userId" where r."taskId" = $1 order by u.login`,
      [id],
    );
    return rows.map((r) => r.login);
  });
}

/** Есть ли пользователь с таким логином (удаление аккаунта). */
export async function userExists(login: string): Promise<boolean> {
  return withDb(async (db) => ((await db.query(`select 1 from "User" where login = $1`, [login])).rowCount ?? 0) > 0);
}

/** Сколько курсов шпагата у пользователя (по логину). */
export async function courseCount(login: string): Promise<number> {
  return withDb(async (db) => Number((await db.query(`select count(*) from "StretchCourse" c join "User" u on u.id = c."userId" where u.login = $1`, [login])).rows[0].count));
}

/** Ники строк лиги во всех снимках итогов недели пользователя. */
export async function recapLeagueNicks(login: string): Promise<string[]> {
  return withDb(async (db) => {
    const { rows } = await db.query<{ nickname: string }>(
      `select r->>'nickname' as nickname from "WeeklyRecap" w join "User" u on u.id = w."userId",
         jsonb_array_elements(coalesce(w.data->'league'->'rows', '[]'::jsonb)) r where u.login = $1`,
      [login],
    );
    return rows.map((r) => r.nickname);
  });
}

/** Заголовки уведомлений пользователя. */
export async function notificationTitles(login: string): Promise<string[]> {
  return withDb(async (db) => {
    const { rows } = await db.query<{ title: string }>(`select n.title from "Notification" n join "User" u on u.id = n."userId" where u.login = $1`, [login]);
    return rows.map((r) => r.title);
  });
}

/** Баланс монет (lib/shop). */
export async function coinBalance(login: string) {
  return withDb(async (db) => {
    const { rows } = await db.query<{ coins: number }>(`select coins from "User" where login = $1`, [login]);
    return rows[0].coins;
  });
}

export async function setCoins(login: string, coins: number) {
  await withDb((db) => db.query(`update "User" set coins = $2 where login = $1`, [login, coins]));
}

/** Момент, с которого считаются монеты (история до него идёт в стартовый баланс). */
export async function setCoinsSince(login: string, since: Date) {
  await withDb((db) => db.query(`update "User" set "coinsSince" = $2 where login = $1`, [login, since]));
}

/** Журнал монет пользователя, старые сверху. */
export async function coinTx(login: string) {
  return withDb(async (db) => {
    const uid = await userId(db, login);
    const { rows } = await db.query<{ reason: string; amount: number; key: string }>(
      `select reason::text, amount, key from "CoinTx" where "userId" = $1 order by "createdAt", id`,
      [uid],
    );
    return rows;
  });
}

/** Коды купленной косметики. */
export async function userItems(login: string) {
  return withDb(async (db) => {
    const uid = await userId(db, login);
    const { rows } = await db.query<{ code: string }>(`select code from "UserItem" where "userId" = $1 order by code`, [uid]);
    return rows.map((r) => r.code);
  });
}

/** Выдать предмет магазина и надеть его (минуя UI): вставка UserItem и запись в поле User.*Code. */
export async function equipItem(login: string, kind: "avatar" | "frame" | "nickColor" | "theme", code: string) {
  const column = { avatar: "avatarCode", frame: "frameCode", nickColor: "nickColorCode", theme: "themeCode" }[kind];
  await withDb(async (db) => {
    const uid = await userId(db, login);
    await db.query(
      `insert into "UserItem" (id, "userId", code, source) values ($1, $2, $3, 'coins') on conflict ("userId", code) do nothing`,
      [randomUUID(), uid, code],
    );
    await db.query(`update "User" set "${column}" = $2 where id = $1`, [uid, code]);
  });
}

/** Дни журнала заходов пользователя (YYYY-MM-DD, по возрастанию); по логину или id. */
export async function visitDays(user: { login?: string; id?: string }): Promise<string[]> {
  return withDb(async (db) => {
    const id = user.id ?? (await userId(db, user.login!));
    const { rows } = await db.query<{ day: string }>(`select to_char(day, 'YYYY-MM-DD') as day from "UserVisit" where "userId" = $1 order by day`, [id]);
    return rows.map((r) => r.day);
  });
}

/** Журнал часов захода пользователя: «YYYY-MM-DD HH» по порядку. */
export async function visitHours(login: string): Promise<string[]> {
  return withDb(async (db) => {
    const { rows } = await db.query<{ h: string }>(
      `select to_char(day, 'YYYY-MM-DD') || ' ' || lpad(hour::text, 2, '0') as h from "UserVisitHour" where "userId" = $1 order by day, hour`,
      [await userId(db, login)],
    );
    return rows.map((r) => r.h);
  });
}

/** Перенести пользователя в прошлое для когорт: дата регистрации, пояс, журнал заходов заменяется данными днями. */
export async function backdateUser(login: string, s: { createdAt: Date; timeZone: string; visitDays: string[] }) {
  await withDb(async (db) => {
    const id = await userId(db, login);
    await db.query(`update "User" set "createdAt" = $2, "timeZone" = $3 where id = $1`, [id, s.createdAt, s.timeZone]);
    await db.query(`delete from "UserVisit" where "userId" = $1`, [id]);
    for (const day of s.visitDays) await db.query(`insert into "UserVisit" ("userId", day) values ($1, $2::date)`, [id, day]);
  });
}

/** Источник регистрации игрока (как его записала бы форма регистрации). */
export async function setSignupSource(login: string, landing: string | null, referrer: string | null) {
  await withDb(async (db) => {
    await db.query(`update "User" set "signupLanding" = $2, "signupReferrer" = $3 where id = $1`, [await userId(db, login), landing, referrer]);
  });
}

/** Рекламная метка регистрации игрока (как её записала бы форма регистрации из cookie hf_utm). */
export async function setSignupUtm(login: string, source: string | null, campaign: string | null) {
  await withDb(async (db) => {
    await db.query(`update "User" set "signupUtmSource" = $2, "signupUtmCampaign" = $3 where id = $1`, [await userId(db, login), source, campaign]);
  });
}

/**
 * База e2e живёт между прогонами: игроков, перенесённых в эту когорту прошлыми прогонами (`backdateUser`),
 * возвращаем в «сейчас», чтобы строка когорты считалась по одному игроку текущего прогона.
 */
export async function clearCohort(from: Date, to: Date) {
  await withDb((db) => db.query(`update "User" set "createdAt" = now() where "createdAt" >= $1 and "createdAt" < $2`, [from, to]));
}

/** Группа ошибок с одним событием (минуя приём) — для админки; id группы. */
export async function insertErrorGroup(p: { message: string; source: "SERVER" | "CLIENT"; count: number; resolved?: boolean }) {
  return withDb(async (db) => {
    const id = randomUUID();
    await db.query(
      `insert into "ErrorGroup" (id, fingerprint, source, message, stack, path, count, users, "firstSeen", "lastSeen", version, "resolvedAt")
       values ($1, $2, $3, $4, $5, '/dashboard', $6, 0, now(), now(), '0.7.0', $7)`,
      [id, `e2e-${id}`, p.source, p.message, `Error: ${p.message}\n    at e2e (/app/lib/e2e.ts:1:1)`, p.count, p.resolved ? new Date() : null],
    );
    await db.query(`insert into "ErrorEvent" (id, "groupId", at, path, "userAgent", version) values ($1, $2, now(), '/dashboard', 'Mozilla/5.0 Chrome/130', '0.7.0')`, [randomUUID(), id]);
    return id;
  });
}

/** Группа ошибок по сообщению: счётчик, события и пользователи событий. */
export async function errorGroupByMessage(message: string) {
  return withDb(async (db) => {
    const { rows } = await db.query<{ id: string; source: string; count: number; events: number; resolved: boolean }>(
      `select g.id, g.source, g.count, (select count(*)::int from "ErrorEvent" e where e."groupId" = g.id) as events, g."resolvedAt" is not null as resolved
       from "ErrorGroup" g where g.message = $1`,
      [message],
    );
    return rows;
  });
}

/** userId событий группы по сообщению (null — обезличено). */
export async function errorEventUsers(message: string) {
  return withDb(async (db) => {
    const { rows } = await db.query<{ userId: string | null }>(
      `select e."userId" from "ErrorEvent" e join "ErrorGroup" g on g.id = e."groupId" where g.message = $1`,
      [message],
    );
    return rows.map((r) => r.userId);
  });
}

export async function resolveErrorGroup(message: string) {
  await withDb((db) => db.query(`update "ErrorGroup" set "resolvedAt" = now() where message = $1`, [message]));
}

/** Золотой гоблин для идущей тренировки пользователя, появившийся `minutesAgo` минут назад (минуя случайность). */
export async function spawnGoblin(login: string, minutesAgo = 0) {
  await withDb((db) =>
    db.query(
      `insert into "GoblinEncounter" (id, "userId", "workoutId", "spawnedAt")
       select $2, u.id, w.id, now() - make_interval(mins => $3::int)
       from "User" u join "Workout" w on w."userId" = u.id and w.status = 'IN_PROGRESS'
       where u.login = $1`,
      [login, randomUUID(), minutesAgo],
    ),
  );
}

/** Встречи с гоблином пользователя: поймана ли, открыт ли сундук. */
export async function goblinRows(login: string) {
  return withDb(async (db) => {
    const { rows } = await db.query<{ caught: boolean; opened: boolean }>(
      `select g."caughtAt" is not null as caught, g."rewardOpenedAt" is not null as opened
       from "GoblinEncounter" g join "User" u on u.id = g."userId" where u.login = $1`,
      [login],
    );
    return rows;
  });
}

/** Группы суперсетов упражнений последней тренировки пользователя (по порядку). */
export async function exerciseGroups(login: string) {
  return withDb(async (db) => {
    const { rows } = await db.query<{ g: number | null }>(
      `select we."supersetGroup" g from "WorkoutExercise" we
       where we."workoutId" = (select w.id from "Workout" w join "User" u on u.id = w."userId" where u.login = $1 order by w."createdAt" desc limit 1)
       order by we."order"`,
      [login],
    );
    return rows.map((r) => r.g);
  });
}

/** Проставить группы суперсетов упражнениям идущей тренировки (по порядку). */
export async function setExerciseGroups(login: string, groups: (number | null)[]) {
  await withDb(async (db) => {
    for (const [i, g] of groups.entries()) {
      await db.query(
        `update "WorkoutExercise" we set "supersetGroup" = $3
         from "Workout" w join "User" u on u.id = w."userId"
         where we."workoutId" = w.id and u.login = $1 and w.status in ('PLANNED', 'IN_PROGRESS') and we."order" = $2`,
        [login, i, g],
      );
    }
  });
}

/** Подходы на время / кардио последней завершённой тренировки пользователя: время и дистанция. */
export async function timedSets(login: string) {
  return withDb(async (db) => {
    const { rows } = await db.query<{ name: string; durationSec: number | null; distanceM: number | null }>(
      `select e.name, s."durationSec", s."distanceM" from "WorkoutSet" s
       join "WorkoutExercise" we on we.id = s."workoutExerciseId"
       join "Exercise" e on e.id = we."exerciseId"
       join "Workout" w on w.id = we."workoutId"
       join "User" u on u.id = w."userId"
       where u.login = $1 and w.status = 'COMPLETED' and e.kind in ('TIME', 'CARDIO')
       order by we."order", s."order"`,
      [login],
    );
    return rows;
  });
}

/** Программа тренера: сдвинуть старт активного назначения клиента на N недель назад (идёт уже неделя N + 1). */
export async function shiftProgramStart(clientLogin: string, weeks: number) {
  await withDb(async (db) => {
    await db.query(
      `update "ProgramAssignment" set "startDate" = to_char("startDate"::date - $2::int * 7, 'YYYY-MM-DD') where "clientId" = $1 and "endedAt" is null`,
      [await userId(db, clientLogin), weeks],
    );
  });
}


/** Сколько серий программ клиента дают тренировку сегодня (в поясе e2e). */
export async function programSeriesToday(clientLogin: string): Promise<number> {
  return withDb(async (db) => {
    const { rows } = await db.query(
      `with d as (select (now() at time zone $2)::date as day)
       select count(*)::int as n from "PlanSeries", d
       where "userId" = $1 and "programAssignmentId" is not null and weekday = extract(isodow from d.day)::int - 1
         and "startDate" <= to_char(d.day, 'YYYY-MM-DD') and ("endDate" is null or "endDate" >= to_char(d.day, 'YYYY-MM-DD'))`,
      [await userId(db, clientLogin), E2E_TZ],
    );
    return rows[0].n as number;
  });
}

/** `whoopUserId` подключения WHOOP; null — не подключён. */
export async function whoopUserIdOf(login: string): Promise<string | null> {
  return withDb(async (db) => {
    const { rows } = await db.query<{ id: string }>(
      `select c."whoopUserId" as id from "WhoopConnection" c join "User" u on u.id = c."userId" where u.login = $1`,
      [login],
    );
    return rows[0]?.id ?? null;
  });
}

/** Подключение WHOOP без обращения к API (токены-заглушки: расшифровка не удастся, отзыв при удалении проглатывается). */
export async function insertWhoopConnection(login: string, scopes = "read:workout read:profile read:recovery read:sleep offline"): Promise<void> {
  await withDb(async (db) => {
    await db.query(
      `insert into "WhoopConnection" ("userId", "whoopUserId", "accessToken", "refreshToken", "expiresAt", scopes, "consentAt")
       values ($1, $2, 'x', 'x', now() + interval '1 hour', $3, now())`,
      [await userId(db, login), String(9_100_000_000_000_000 + Math.floor(Math.random() * 1e12)), scopes],
    );
  });
}

/** Сколько активностей WHOOP сохранено у пользователя. */
export async function whoopWorkoutCount(login: string): Promise<number> {
  return withDb(async (db) => {
    const { rows } = await db.query<{ n: number }>(
      `select count(*)::int as n from "WhoopWorkout" w join "User" u on u.id = w."userId" where u.login = $1`,
      [login],
    );
    return rows[0].n;
  });
}

/** Выданные scope подключения WHOOP; null — не подключён. */
export async function whoopScopes(login: string): Promise<string | null> {
  return withDb(async (db) => {
    const { rows } = await db.query<{ s: string }>(
      `select c.scopes as s from "WhoopConnection" c join "User" u on u.id = c."userId" where u.login = $1`,
      [login],
    );
    return rows[0]?.s ?? null;
  });
}

/** Подменить scope подключения WHOOP (старое подключение без сна и восстановления). */
export async function setWhoopScopes(login: string, scopes: string): Promise<void> {
  await withDb(async (db) => {
    await db.query(`update "WhoopConnection" c set scopes = $2 from "User" u where u.id = c."userId" and u.login = $1`, [login, scopes]);
  });
}

/** Сколько снов WHOOP сохранено у пользователя. */
export async function whoopSleepCount(login: string): Promise<number> {
  return withDb(async (db) => {
    const { rows } = await db.query<{ n: number }>(
      `select count(*)::int as n from "WhoopSleep" s join "User" u on u.id = s."userId" where u.login = $1`,
      [login],
    );
    return rows[0].n;
  });
}

/** Вставить сон WHOOP, закончившийся в `night.end`; остальные поля можно переопределить. */
export async function insertWhoopSleep(
  login: string,
  night: { end: Date; id?: string; sleepMs?: number; needMs?: number; performancePct?: number; recoveryPct?: number | null; restingHr?: number; hrvMs?: number; calibrating?: boolean },
): Promise<string> {
  return withDb(async (db) => {
    const id = night.id ?? randomUUID();
    const recoveryPct = night.recoveryPct === undefined ? 70 : night.recoveryPct;
    const sleepMs = night.sleepMs ?? 8 * 3_600_000;
    await db.query(
      `insert into "WhoopSleep" (id, "userId", "cycleId", start, "end", "sleepScoreState", "sleepMs", "needMs", "performancePct",
         "recoveryScoreState", "recoveryPct", "restingHr", "hrvMs", calibrating, "updatedAt")
       values ($1, $2, $3, $4, $5, 'SCORED', $6, $7, $13, $8, $9, $10, $11, $12, now())`,
      [
        id,
        await userId(db, login),
        String(Date.now()),
        new Date(night.end.getTime() - sleepMs - 30 * 60_000).toISOString(),
        night.end.toISOString(),
        sleepMs,
        night.needMs ?? 8 * 3_600_000,
        recoveryPct === null ? null : "SCORED",
        recoveryPct,
        night.restingHr ?? 55,
        night.hrvMs ?? 80,
        night.calibrating ?? false,
        night.performancePct ?? 90,
      ],
    );
    return id;
  });
}

/** Поля сна WHOOP у пользователя по id; null — строки нет. */
export async function whoopSleepRow(
  login: string,
  id: string,
): Promise<{ id: string; recoveryPct: number | null; restingHr: number | null; hrvMs: number | null; sleepMs: number | null } | null> {
  return withDb(async (db) => {
    const { rows } = await db.query<{ id: string; recoveryPct: number | null; restingHr: number | null; hrvMs: number | null; sleepMs: number | null }>(
      `select s.id, s."recoveryPct", s."restingHr", s."hrvMs", s."sleepMs" from "WhoopSleep" s join "User" u on u.id = s."userId" where u.login = $1 and s.id = $2`,
      [login, id],
    );
    return rows[0] ?? null;
  });
}

/** Последняя завершённая тренировка пользователя. */
export async function latestWorkout(login: string): Promise<{ id: string; startedAt: Date; finishedAt: Date }> {
  return withDb(async (db) => {
    const { rows } = await db.query<{ id: string; startedAt: Date; finishedAt: Date }>(
      // колонки без зоны хранят UTC — читаем как timestamptz, иначе pg сдвинет на пояс процесса
      `select w.id, w."startedAt" at time zone 'UTC' as "startedAt", w."finishedAt" at time zone 'UTC' as "finishedAt" from "Workout" w join "User" u on u.id = w."userId"
       where u.login = $1 and w.status = 'COMPLETED' order by w."finishedAt" desc limit 1`,
      [login],
    );
    return rows[0];
  });
}

/** Сбросить отметку последней синхронизации WHOOP — снять ограничение «Обновить» раз в минуту. */
export async function resetWhoopSync(login: string): Promise<void> {
  await withDb(async (db) => {
    await db.query(`update "WhoopConnection" c set "lastSyncAt" = null from "User" u where u.id = c."userId" and u.login = $1`, [login]);
  });
}

/** Отметка последней синхронизации WHOOP (ставится по окончании истории в callback); null — не было или не подключён. */
export async function whoopLastSyncAt(login: string): Promise<Date | null> {
  return withDb(async (db) => {
    const { rows } = await db.query<{ v: Date | null }>(
      `select c."lastSyncAt" at time zone 'UTC' as v from "WhoopConnection" c join "User" u on u.id = c."userId" where u.login = $1`,
      [login],
    );
    return rows[0]?.v ?? null;
  });
}

/** Состарить access-токен WHOOP: следующий запрос приложения пойдёт через refresh. */
export async function expireWhoopToken(login: string): Promise<void> {
  await withDb(async (db) => {
    await db.query(
      `update "WhoopConnection" c set "expiresAt" = now() - interval '1 hour' from "User" u where u.id = c."userId" and u.login = $1`,
      [login],
    );
  });
}

/** Флаг «нужно переподключить WHOOP»; null — не подключён. */
export async function whoopNeedsReauth(login: string): Promise<boolean | null> {
  return withDb(async (db) => {
    const { rows } = await db.query<{ v: boolean }>(
      `select c."needsReauth" as v from "WhoopConnection" c join "User" u on u.id = c."userId" where u.login = $1`,
      [login],
    );
    return rows[0]?.v ?? null;
  });
}

/** Помечает подключение WHOOP как требующее переподключения. */
export async function setWhoopNeedsReauth(login: string): Promise<void> {
  await withDb(async (db) => {
    await db.query(`update "WhoopConnection" c set "needsReauth" = true from "User" u where u.id = c."userId" and u.login = $1`, [login]);
  });
}

/**
 * Снимок «Итогов недели» тренера с одной строкой клиента (минимальные data); возвращает id снимка.
 * Снимок недели уже есть (его мог построить фоновый воркер — в понедельник после 09:00) — перезаписывается
 * как новый: data, не отправлен и не просмотрен, строки клиентов — только эта.
 */
export async function seedCoachRecap(coachLogin: string, clientLogin: string, week: string) {
  return withDb(async (db) => {
    const totals = { version: 1, clients: 1, trained: 1, plan: null, prevPlanPct: null, workouts: 1, records: 0, ups: 0, attention: 0, unanswered: 0 };
    const row = {
      version: 1,
      isNew: false,
      plan: null,
      workouts: 1,
      prevWorkouts: 0,
      records: { count: 0, names: [] },
      progression: { items: [], more: 0, ups: 0 },
      program: null,
      signals: [],
      unanswered: 0,
    };
    const { rows } = await db.query<{ id: string }>(
      `insert into "CoachWeeklyRecap" (id, "coachId", week, data) values ($1, $2, $3, $4)
       on conflict ("coachId", week) do update set data = excluded.data, "pushedAt" = null, "seenAt" = null, "createdAt" = now()
       returning id`,
      [randomUUID(), await userId(db, coachLogin), week, JSON.stringify(totals)],
    );
    const id = rows[0].id;
    await db.query(`delete from "CoachRecapClient" where "recapId" = $1`, [id]);
    await db.query(`insert into "CoachRecapClient" ("recapId", "clientId", data) values ($1, $2, $3)`, [id, await userId(db, clientLogin), JSON.stringify(row)]);
    return id;
  });
}

/** Сколько строк клиента (по id) в снимках тренеров и сколько снимков у тренера. */
export async function coachRecapCounts(coachLogin: string, clientId: string) {
  return withDb(async (db) => {
    const client = (await db.query(`select count(*)::int as n from "CoachRecapClient" where "clientId" = $1`, [clientId])).rows[0].n as number;
    const recaps = (await db.query(`select count(*)::int as n from "CoachWeeklyRecap" where "coachId" = $1`, [await userId(db, coachLogin)])).rows[0].n as number;
    return { client, recaps };
  });
}

/** Уведомления «Итоги недели клиентов» тренеру (тип COACH) по порядку. */
export async function coachRecapNotifications(login: string) {
  return withDb(async (db) => {
    const { rows } = await db.query<{ title: string; body: string; url: string }>(
      `select title, body, url from "Notification" where "userId" = $1 and type = 'COACH' and url like '/coach/recap/%' order by "createdAt"`,
      [await userId(db, login)],
    );
    return rows;
  });
}

/** Снимки итогов недели тренера: неделя, отправлен ли push, просмотрен ли. */
export async function coachRecapRows(coachLogin: string) {
  return withDb(async (db) => {
    const { rows } = await db.query<{ week: string; pushedAt: Date | null; seenAt: Date | null }>(
      `select week, "pushedAt", "seenAt" from "CoachWeeklyRecap" where "coachId" = $1 order by week`,
      [await userId(db, coachLogin)],
    );
    return rows;
  });
}

/** Комментарий тренера к тренировке клиента (workoutExerciseId — к упражнению, иначе общий). */
export async function coachCommentOn(coachLogin: string, clientLogin: string, workoutId: string, workoutExerciseId?: string) {
  await withDb(async (db) => {
    await db.query(
      `insert into "CoachComment" (id, "coachId", "clientId", "workoutId", "workoutExerciseId", text, "updatedAt") values ($1, $2, $3, $4, $5, 'Хорошо', now())`,
      [randomUUID(), await userId(db, coachLogin), await userId(db, clientLogin), workoutId, workoutExerciseId ?? null],
    );
  });
}

/** Пояс пользователя — любой IANA (например, клиент западнее тренера). */
export async function setUserTimeZone(login: string, timeZone: string) {
  await withDb((db) => db.query(`update "User" set "timeZone" = $2 where login = $1`, [login, timeZone]));
}

/**
 * Завершённая тренировка с рекордами в meta (форма FinishMeta, с exerciseId) — для «Респекта за рекорд».
 * Упражнения — встроенные по названию; нет такого — создаётся своё упражнение пользователя (длинные названия).
 */
export async function seedRecordWorkout(
  login: string,
  records: { exercise: string; type?: string; value: number }[],
  /** exerciseOwner — логин владельца своих упражнений (по умолчанию автор тренировки, например тренер клиента). */
  o: { name?: string; exerciseOwner?: string } = {},
) {
  return withDb(async (db) => {
    const uid = await userId(db, login);
    const ownerId = o.exerciseOwner ? await userId(db, o.exerciseOwner) : uid;
    const finished = new Date();
    const started = new Date(finished.getTime() - 3600 * 1000);
    const workoutId = randomUUID();
    await db.query(
      `insert into "Workout" (id, "userId", name, status, "startedAt", "finishedAt", "durationSec", "totalVolume", "totalSets", "totalReps", "createdAt", "updatedAt")
       values ($1, $2, $3, 'COMPLETED', $4, $5, 3600, 1000, 5, 50, $4, $5)`,
      [workoutId, uid, o.name ?? "Рекордная", started, finished],
    );
    const exerciseIds: Record<string, string> = {};
    const metaRecords: object[] = [];
    for (const [i, r] of records.entries()) {
      let id = (
        await db.query<{ id: string }>(`select id from "Exercise" where name = $1 and ("userId" is null or "userId" = $2) order by "userId" nulls first`, [r.exercise, ownerId])
      ).rows[0]?.id;
      if (!id) {
        id = randomUUID();
        await db.query(
          `insert into "Exercise" (id, "userId", name, "muscleGroups", "updatedAt") values ($1, $2, $3, ARRAY['CHEST']::"MuscleGroup"[], now())`,
          [id, ownerId, r.exercise],
        );
      }
      exerciseIds[r.exercise] = id;
      const weId = randomUUID();
      await db.query(`insert into "WorkoutExercise" (id, "workoutId", "exerciseId", "order", "restSec") values ($1, $2, $3, $4, 90)`, [weId, workoutId, id, i]);
      await db.query(
        `insert into "WorkoutSet" (id, "workoutExerciseId", "order", weight, reps, "isWarmup", "completedAt") values ($1, $2, 0, $3, 5, false, $4)`,
        [randomUUID(), weId, r.value, finished],
      );
      metaRecords.push({ exerciseId: id, exerciseName: r.exercise, type: r.type ?? "MAX_WEIGHT", value: r.value, previous: r.value - 5 });
    }
    const meta = {
      xpBefore: 0, levelBefore: 1, levelAfter: 1, workoutXp: 50, recordsXp: 0, achievementsXp: 0,
      records: metaRecords, achievements: [], streak: 1, streakExtended: false, streakReset: false, usedFreezes: 0, weekCount: 1,
    };
    await db.query(
      `insert into "XpEvent" (id, "userId", amount, reason, "workoutId", meta, "createdAt") values ($1, $2, 50, 'WORKOUT_COMPLETED', $3, $4, $5)`,
      [randomUUID(), uid, workoutId, JSON.stringify(meta), finished],
    );
    return { workoutId, exerciseIds };
  });
}

/** n фиктивных пользователей ставят респект на рекорд (минуя UI). */
export async function seedRespects(workoutId: string, exerciseId: string, n: number) {
  await withDb(async (db) => {
    for (let i = 0; i < n; i++) {
      const uid = randomUUID();
      const login = `e2e_resp_${uid.slice(0, 12)}`;
      await db.query(`insert into "User" (id, login, email, "passwordHash", nickname, "nicknameKey", "updatedAt") values ($1, $2, $3, 'x', $4, $4, now())`, [
        uid,
        login,
        `${login}@test.local`,
        `fan${i}_${uid.slice(0, 6)}`,
      ]);
      await db.query(`insert into "RecordRespect" (id, "workoutId", "exerciseId", "userId") values ($1, $2, $3, $4)`, [randomUUID(), workoutId, exerciseId, uid]);
    }
  });
}

/** Число респектов на рекорды тренировки. */
export async function respectCount(workoutId: string, exerciseId?: string) {
  return withDb(async (db) => {
    const { rows } = await db.query<{ c: number }>(
      `select count(*)::int c from "RecordRespect" where "workoutId" = $1 and ($2::text is null or "exerciseId" = $2)`,
      [workoutId, exerciseId ?? null],
    );
    return rows[0].c;
  });
}

/** Программа тренера в библиотеке (минуя UI): неделя из одного дня на шаблон; publish — сразу в каталоге. Возвращает id. */
export async function seedCoachProgram(
  coachLogin: string,
  templateId: string,
  o: { name: string; weeks?: number; weekdays?: number[]; stepValue?: number; publish?: boolean; description?: string },
): Promise<string> {
  return withDb(async (db) => {
    const id = randomUUID();
    await db.query(
      `insert into "CoachProgram" (id, "coachId", name, weeks, "stepKind", "stepValue", "deloadEvery", "deloadPct", "publishedAt", "catalogDescription", "updatedAt")
       values ($1, $2, $3, $4, 'PERCENT', $5, 4, 10, $6, $7, now())`,
      [id, await userId(db, coachLogin), o.name, o.weeks ?? 8, o.stepValue ?? 2.5, o.publish ? new Date() : null, o.description ?? null],
    );
    for (const weekday of o.weekdays ?? [0]) {
      await db.query(`insert into "CoachProgramDay" (id, "programId", weekday, "templateId", time, "durationMin") values ($1, $2, $3, $4, '18:00', 60)`, [
        randomUUID(),
        id,
        weekday,
        templateId,
      ]);
    }
    return id;
  });
}

/** Свои шаблоны пользователя: id, название, группа (program). */
export async function templatesOf(login: string) {
  return withDb(async (db) => {
    const { rows } = await db.query<{ id: string; name: string; program: string | null }>(
      `select id, name, program from "WorkoutTemplate" where "userId" = $1 order by "createdAt"`,
      [await userId(db, login)],
    );
    return rows;
  });
}

/** Упражнения шаблона по порядку: «название sets×reps». */
export async function templateExerciseLines(templateId: string) {
  return withDb(async (db) => {
    const { rows } = await db.query<{ line: string }>(
      `select e.name || ' ' || t."targetSets" || '×' || coalesce(t."targetReps"::text, '-') as line
       from "TemplateExercise" t join "Exercise" e on e.id = t."exerciseId" where t."templateId" = $1 order by t."order"`,
      [templateId],
    );
    return rows.map((r) => r.line);
  });
}

/** Активные назначения программ пользователя (новые сверху). */
export async function activeAssignments(login: string) {
  return withDb(async (db) => {
    const { rows } = await db.query<{ name: string; coachId: string | null; catalogProgramId: string | null }>(
      `select name, "coachId", "catalogProgramId" from "ProgramAssignment" where "clientId" = $1 and "endedAt" is null order by "createdAt" desc`,
      [await userId(db, login)],
    );
    return rows;
  });
}

/** Активное назначение программы тренером (минуя UI): с понедельника этой недели, 8 недель, без серий. */
export async function seedCoachAssignment(coachLogin: string, clientLogin: string, name: string) {
  await withDb(async (db) => {
    await db.query(
      `insert into "ProgramAssignment" (id, "clientId", "coachId", name, "startDate", weeks, "stepKind", "stepValue", "deloadEvery", "deloadPct")
       values ($1, $2, $3, $4, $5, 8, 'PERCENT', 2.5, 4, 10)`,
      [randomUUID(), await userId(db, clientLogin), await userId(db, coachLogin), name, mondayWeeksAgo(0)],
    );
  });
}

/** Снять программу с публикации / вернуть (минуя UI). */
export async function setProgramPublished(programId: string, published: boolean) {
  await withDb((db) => db.query(`update "CoachProgram" set "publishedAt" = $2 where id = $1`, [programId, published ? new Date() : null]));
}

/** Серии программ пользователя, у которых есть вхождения после сегодня (в поясе e2e). */
export async function programSeriesAfterToday(login: string): Promise<number> {
  return withDb(async (db) => {
    const { rows } = await db.query(
      `select count(*)::int as n from "PlanSeries"
       where "userId" = $1 and "programAssignmentId" is not null and ("endDate" is null or "endDate" > to_char((now() at time zone $2)::date, 'YYYY-MM-DD'))`,
      [await userId(db, login), E2E_TZ],
    );
    return rows[0].n as number;
  });
}

// ───────────── Системные оповещения (e2e/system-alerts.spec.ts) ─────────────

type AlertSeed = {
  kind: "BANNER" | "POPUP";
  body: string;
  tone?: "INFO" | "WARNING" | "CRITICAL";
  title?: string;
  ctaLabel?: string;
  ctaHref?: string;
  dismiss?: "NEVER" | "SESSION" | "FOREVER";
  /** сдвиг начала от «сейчас», мс; по умолчанию — минуту назад */
  startsInMs?: number;
  /** сдвиг конца от «сейчас», мс; не задан — без конца */
  endsInMs?: number;
  enabled?: boolean;
  /** кому: по умолчанию — всем */
  audience?: "ALL" | "USERS" | "COACHES";
};

/** Оповещение минуя админку; возвращает id. Живое видят все — только в проекте alerts-global. */
export async function createAlert(a: AlertSeed): Promise<string> {
  const id = randomUUID();
  const now = Date.now();
  await withDb((db) =>
    db.query(
      `insert into "SystemAlert" (id, kind, tone, title, body, "ctaLabel", "ctaHref", dismiss, "startsAt", "endsAt", enabled, audience, "updatedAt")
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now())`,
      [
        id,
        a.kind,
        a.tone ?? "INFO",
        a.title ?? null,
        a.body,
        a.ctaLabel ?? null,
        a.ctaHref ?? null,
        a.dismiss ?? "FOREVER",
        new Date(now + (a.startsInMs ?? -60_000)),
        a.endsInMs === undefined ? null : new Date(now + a.endsInMs),
        a.enabled ?? true,
        a.audience ?? "ALL",
      ],
    ),
  );
  return id;
}

/** Удалить все оповещения (с записями о закрытии — каскадом). */
export async function clearAlerts(): Promise<void> {
  await withDb((db) => db.query(`delete from "SystemAlert"`));
}

/** Сколько человек закрыли оповещение навсегда. */
export async function alertDismissalCount(alertId: string): Promise<number> {
  return withDb(async (db) =>
    Number((await db.query<{ n: string }>(`select count(*) as n from "SystemAlertDismissal" where "alertId" = $1`, [alertId])).rows[0].n),
  );
}

/** Записать «закрыл навсегда» минуя интерфейс. */
export async function dismissAlertFor(login: string, alertId: string): Promise<void> {
  await withDb(async (db) =>
    db.query(`insert into "SystemAlertDismissal" ("alertId", "userId") values ($1, $2)`, [alertId, await userId(db, login)]),
  );
}

// ───────────── Обратная связь (e2e/feedback.spec.ts) ─────────────

/** n обращений пользователя минуя форму (лимит, выгрузка); возвращает id. */
export async function seedFeedback(login: string, n: number, over: { status?: string; body?: string; adminNote?: string } = {}): Promise<string[]> {
  return withDb(async (db) => {
    const uid = await userId(db, login);
    const ids: string[] = [];
    for (let i = 0; i < n; i++) {
      const id = randomUUID();
      await db.query(
        `insert into "Feedback" (id, "userId", kind, body, status, "adminNote", "updatedAt") values ($1, $2, 'IDEA', $3, $4, $5, now())`,
        [id, uid, over.body ?? `Пожелание номер ${i + 1}`, over.status ?? "NEW", over.adminNote ?? null],
      );
      ids.push(id);
    }
    return ids;
  });
}

/** Обращения с таким текстом (у всех пользователей). */
export async function feedbackRows(body: string): Promise<{ page: string | null; version: string | null; status: string }[]> {
  return withDb(async (db) => (await db.query(`select page, version, status from "Feedback" where body = $1`, [body])).rows);
}

/** Источник регистрации пользователя (спека 2026-10-20-signup-sources). */
export async function signupSourceOf(login: string): Promise<{ landing: string | null; referrer: string | null }> {
  return withDb(async (db) => {
    const { rows } = await db.query<{ signupLanding: string | null; signupReferrer: string | null }>(
      `select "signupLanding", "signupReferrer" from "User" where login = $1`,
      [login],
    );
    return { landing: rows[0].signupLanding, referrer: rows[0].signupReferrer };
  });
}

/** Рекламная метка регистрации пользователя. */
export async function signupUtmOf(login: string): Promise<{ source: string | null; campaign: string | null }> {
  return withDb(async (db) => {
    const { rows } = await db.query<{ signupUtmSource: string | null; signupUtmCampaign: string | null }>(
      `select "signupUtmSource", "signupUtmCampaign" from "User" where login = $1`,
      [login],
    );
    return { source: rows[0].signupUtmSource, campaign: rows[0].signupUtmCampaign };
  });
}

export type CampaignSeed = {
  condition: "INACTIVE" | "NO_WORKOUT" | "NEVER_TRAINED" | "STREAK_LOST";
  days?: number | null;
  name?: string;
  title?: string;
  body?: string;
  url?: string;
  push?: boolean;
  telegram?: boolean;
  hour?: number;
  status?: "DRAFT" | "ACTIVE" | "PAUSED" | "ARCHIVED";
  createdAt?: Date;
};

/** Кампания рассылки минуя админку; по умолчанию активная, час 20, оба канала. */
export async function createCampaign(c: CampaignSeed): Promise<string> {
  const id = randomUUID();
  await withDb((db) =>
    db.query(
      `insert into "Campaign" (id, name, condition, days, title, body, url, push, telegram, hour, status, "createdAt", "updatedAt")
       values ($1, $2, $3::"CampaignCondition", $4, $5, $6, $7, $8, $9, $10, $11::"CampaignStatus", $12, now())`,
      [
        id,
        c.name ?? `e2e ${c.condition}`,
        c.condition,
        c.days ?? null,
        c.title ?? "Вернись в зал",
        c.body ?? "Мы скучаем",
        c.url ?? "/training",
        c.push ?? true,
        c.telegram ?? true,
        c.hour ?? 20,
        c.status ?? "ACTIVE",
        c.createdAt ?? new Date(),
      ],
    ),
  );
  return id;
}

/** Все кампании — в архив (тесты не видят кампаний соседних тестов и прошлых прогонов). */
export async function archiveAllCampaigns() {
  await withDb((db) => db.query(`update "Campaign" set status = 'ARCHIVED' where status <> 'ARCHIVED'`));
}

/** Отправки рассылок пользователю по порядку отправки. */
export async function campaignSends(login: string): Promise<{ campaignId: string; episode: string; sentAt: Date; returnedAt: Date | null }[]> {
  return withDb(async (db) => {
    const { rows } = await db.query<{ campaignId: string; episode: string; sentAt: Date; returnedAt: Date | null }>(
      `select s."campaignId", s.episode, s."sentAt", s."returnedAt" from "CampaignSend" s join "User" u on u.id = s."userId"
       where u.login = $1 order by s."sentAt", s.episode`,
      [login],
    );
    return rows;
  });
}

/** Сдвинуть время всех отправок рассылок пользователю. */
export async function setCampaignSentAt(login: string, sentAt: Date) {
  await withDb(async (db) => db.query(`update "CampaignSend" set "sentAt" = $2 where "userId" = $1`, [await userId(db, login), sentAt]));
}

/** Последний засчитанный день захода (YYYY-MM-DD, местный) или null. */
export async function setLastLoginDay(login: string, day: string | null) {
  await withDb((db) => db.query(`update "User" set "lastLoginDay" = $2::date where login = $1`, [login, day]));
}

export async function setNotifyComeback(login: string, on: boolean) {
  await withDb((db) => db.query(`update "User" set "notifyComeback" = $2 where login = $1`, [login, on]));
}

/** Состояние недельной серии напрямую (недели — понедельники YYYY-MM-DD). */
export async function setStreakState(
  login: string,
  s: { currentStreak: number; lastStreakWeek: string | null; streakFreezes: number; freezeGrantedAt: Date | null },
) {
  await withDb((db) =>
    db.query(
      `update "User" set "currentStreak" = $2, "longestStreak" = greatest("longestStreak", $2), "lastStreakWeek" = $3,
         "streakFreezes" = $4, "freezeGrantedAt" = $5, "streakRestoredAt" = null, "weekWorkouts" = 0, "weekWorkoutsKey" = null
       where login = $1`,
      [login, s.currentStreak, s.lastStreakWeek, s.streakFreezes, s.freezeGrantedAt],
    ),
  );
}

/** Сколько отправок у кампании (после удаления аккаунта — должно быть 0). */
export async function campaignSendCount(campaignId: string): Promise<number> {
  return withDb(async (db) => Number((await db.query(`select count(*) from "CampaignSend" where "campaignId" = $1`, [campaignId])).rows[0].count));
}

/** Новые посетители лендинга по паре страница входа × источник — за всё время (счётчики LandingVisit). */
export async function landingVisits(landing: string, referrer: string) {
  return withDb(async (db) => {
    const { rows } = await db.query<{ n: number }>(`select coalesce(sum(count), 0)::int as n from "LandingVisit" where landing = $1 and referrer = $2`, [landing, referrer]);
    return rows[0].n;
  });
}

/** Переходы по ссылкам с меткой utm_source — за всё время (счётчики LandingUtmVisit). */
export async function landingUtmVisits(source: string) {
  return withDb(async (db) => {
    const { rows } = await db.query<{ n: number }>(`select coalesce(sum(count), 0)::int as n from "LandingUtmVisit" where source = $1`, [source]);
    return rows[0].n;
  });
}

/** Счётчик новых посетителей за час (минуя proxy) — для проверки дня в поясе админа. */
export async function addLandingVisit(hour: Date, landing: string, referrer: string, count: number) {
  await withDb(async (db) => {
    await db.query(
      `insert into "LandingVisit" (hour, landing, referrer, count) values ($1, $2, $3, $4)
       on conflict (hour, landing, referrer) do update set count = "LandingVisit".count + $4`,
      [hour, landing, referrer, count],
    );
  });
}

/** Группа клиентов тренера (минуя UI); возвращает id. */
export async function coachGroup(coachLogin: string, name: string, clientLogins: string[]): Promise<string> {
  return withDb(async (db) => {
    const id = randomUUID();
    await db.query(`insert into "CoachGroup" (id, "coachId", name, "nameKey") values ($1, $2, $3, lower($3))`, [id, await userId(db, coachLogin), name]);
    for (const login of clientLogins) await db.query(`insert into "CoachGroupMember" ("groupId", "clientId") values ($1, $2)`, [id, await userId(db, login)]);
    return id;
  });
}

/** Завершённая тренировка клиента по вхождению плана (planKey) — закрывает назначение. */
export async function completeAssignment(clientLogin: string, planKey: string, finishedAt: Date) {
  await withDb(async (db) => {
    const started = new Date(finishedAt.getTime() - 3600 * 1000);
    await db.query(
      `insert into "Workout" (id, "userId", name, status, "planKey", "startedAt", "finishedAt", "durationSec", "totalVolume", "totalSets", "totalReps", "createdAt", "updatedAt")
       values ($1, $2, 'По плану', 'COMPLETED', $3, $4, $5, 3600, 0, 0, 0, $4, $5)`,
      [randomUUID(), await userId(db, clientLogin), planKey, started, finishedAt],
    );
  });
}

/** Клиент отменил разовое назначение (`e:<id>`). */
export async function cancelAssignment(planKey: string) {
  await withDb((db) => db.query(`update "PlanEntry" set cancelled = true where id = $1`, [planKey.replace(/^e:/, "")]));
}

// ───────────────────────────── Совместная тренировка ─────────────────────────────

const userIdSql = `(select id from "User" where login = $1)`;

/** Идущая тренировка игрока (IN_PROGRESS). */
export async function activeWorkoutId(login: string): Promise<string | null> {
  return withDb(async (db) => {
    const { rows } = await db.query<{ id: string }>(`select w.id from "Workout" w join "User" u on u.id = w."userId" where u.login = $1 and w.status = 'IN_PROGRESS' order by w."startedAt" desc limit 1`, [login]);
    return rows[0]?.id ?? null;
  });
}

export type TogetherRow = { id: string; status: string; endReason: string | null; hostWorkoutId: string | null; guestWorkoutId: string | null };

/** Последняя совместная сессия, где игрок — хозяин или гость. */
export async function togetherSessionOf(login: string): Promise<TogetherRow | null> {
  return withDb(async (db) => {
    const { rows } = await db.query<TogetherRow>(
      `select s.id, s.status, s."endReason", s."hostWorkoutId", s."guestWorkoutId" from "TrainingSession" s
       where s."hostId" = ${userIdSql} or s."guestId" = ${userIdSql} order by s."createdAt" desc limit 1`,
      [login],
    );
    return rows[0] ?? null;
  });
}

/** Совместная сессия прямо в БД (минуя приглашение). */
export async function seedTogether(host: string, guest: string, s: { status: "INVITED" | "ACTIVE"; hostWorkoutId: string | null; guestWorkoutId?: string | null }): Promise<string> {
  const id = randomUUID();
  await withDb((db) =>
    db.query(
      `insert into "TrainingSession" (id, "hostId", "guestId", "hostWorkoutId", "guestWorkoutId", status, "createdAt", "acceptedAt")
       values ($1, ${userIdSql.replace("$1", "$2")}, ${userIdSql.replace("$1", "$3")}, $4, $5, $6::"TrainingSessionStatus", now(), case when $6 = 'ACTIVE' then now() end)`,
      [id, host, guest, s.hostWorkoutId, s.guestWorkoutId ?? null, s.status],
    ),
  );
  return id;
}

/** Сдвинуть время сессии назад (истечение приглашения / 4 часа). */
export async function shiftSession(id: string, minutes: { created?: number; accepted?: number }) {
  await withDb((db) =>
    db.query(
      `update "TrainingSession" set "createdAt" = "createdAt" - make_interval(mins => $2), "acceptedAt" = "acceptedAt" - make_interval(mins => $3) where id = $1`,
      [id, minutes.created ?? 0, minutes.accepted ?? 0],
    ),
  );
}

/** Сдвинуть старт тренировки назад — для пересечения совместных тренировок. */
export async function shiftWorkoutStart(workoutId: string, minutes: number) {
  await withDb((db) => db.query(`update "Workout" set "startedAt" = "startedAt" - make_interval(mins => $2) where id = $1`, [workoutId, minutes]));
}

/** Бонусы за совместные тренировки игрока. */
export async function togetherBonuses(login: string): Promise<number[]> {
  return withDb(async (db) => {
    const { rows } = await db.query<{ amount: number }>(`select e.amount from "XpEvent" e join "User" u on u.id = e."userId" where u.login = $1 and e.reason = 'TOGETHER_BONUS'`, [login]);
    return rows.map((r) => r.amount);
  });
}

/** Незавершённая тренировка игрока (IN_PROGRESS, без упражнений), запущенная в startedAt. */
export async function startWorkoutRow(login: string, startedAt: Date) {
  await withDb(async (db) => {
    const uid = await userId(db, login);
    await db.query(
      `insert into "Workout" (id, "userId", name, status, "startedAt", "createdAt", "updatedAt") values ($1, $2, 'Seed', 'IN_PROGRESS', $3, $3, $3)`,
      [randomUUID(), uid, startedAt],
    );
  });
}

/** Дни напоминаний курса напрямую (0 = пн … 6 = вс). */
export async function setCourseRemindDays(login: string, days: number[]) {
  await withDb((db) =>
    db.query(`update "StretchCourse" set "remindDays" = $2 where "userId" = (select id from "User" where login = $1)`, [login, days]),
  );
}

/** Напоминания курса: сколько уведомлений COURSE_REMINDER у пользователя. */
export async function courseReminders(login: string) {
  return withDb(async (db) => {
    const { rows } = await db.query<{ body: string }>(
      `select body from "Notification" where "userId" = (select id from "User" where login = $1) and type = 'COURSE_REMINDER'`,
      [login],
    );
    return rows.map((r) => r.body);
  });
}

/** Сколько push COURSE_REMINDER ставилось в очередь пользователю (в любом состоянии). */
export async function courseReminderPushes(login: string) {
  return withDb(async (db) => {
    const { rows } = await db.query<{ n: string }>(
      `select count(*) n from "ScheduledPush" where "userId" = (select id from "User" where login = $1) and type = 'COURSE_REMINDER'`,
      [login],
    );
    return Number(rows[0].n);
  });
}
