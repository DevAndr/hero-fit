import "dotenv/config";
import { hash } from "@node-rs/argon2";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import type { MuscleGroup, RecordType } from "../generated/prisma/enums";
import { levelProgress } from "../lib/progress/level";
import { recomputeStreak } from "../lib/progress/streak-db";
import { epley1RM } from "../lib/progress/records";
import { addWeeks, localMidnight, STREAK_WEEK_TARGET, weekKey, weeksBetween } from "../lib/progress/weekly-streak";
import type { RecapData } from "../lib/recap/types";
import { PR_XP, workoutXp } from "../lib/progress/xp";
import { bossForWeek } from "../lib/boss/bosses";
import { addDays } from "../lib/plans/expand";
import { MIN_HP, SET_DAMAGE } from "../lib/boss/damage";
import { clubKey } from "../lib/club/rules";
import { slugify } from "../lib/club/public";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

type SeedExercise = {
  name: string;
  muscleGroups: MuscleGroup[]; // первая — основная
  restSec: number;
  bodyweight?: boolean;
};

const EXERCISES: SeedExercise[] = [
  // Грудь
  { name: "Жим штанги лёжа", muscleGroups: ["CHEST", "TRICEPS", "SHOULDERS"], restSec: 120 },
  { name: "Жим гантелей на наклонной скамье", muscleGroups: ["CHEST", "SHOULDERS"], restSec: 90 },
  { name: "Отжимания на брусьях", muscleGroups: ["CHEST", "TRICEPS"], restSec: 90, bodyweight: true },
  { name: "Сведение рук в кроссовере", muscleGroups: ["CHEST"], restSec: 60 },
  // Спина
  { name: "Становая тяга", muscleGroups: ["BACK", "LEGS", "TRAPS", "FOREARMS"], restSec: 180 },
  { name: "Подтягивания", muscleGroups: ["BACK", "BICEPS"], restSec: 90, bodyweight: true },
  { name: "Тяга штанги в наклоне", muscleGroups: ["BACK", "BICEPS"], restSec: 90 },
  { name: "Тяга верхнего блока", muscleGroups: ["BACK", "BICEPS"], restSec: 75 },
  // Ноги
  { name: "Приседания со штангой", muscleGroups: ["LEGS", "ABS"], restSec: 180 },
  { name: "Жим ногами", muscleGroups: ["LEGS"], restSec: 120 },
  { name: "Румынская тяга", muscleGroups: ["LEGS", "BACK"], restSec: 120 },
  { name: "Выпады с гантелями", muscleGroups: ["LEGS"], restSec: 90 },
  // Плечи
  { name: "Жим штанги стоя", muscleGroups: ["SHOULDERS", "TRICEPS"], restSec: 120 },
  { name: "Махи гантелями в стороны", muscleGroups: ["SHOULDERS"], restSec: 60 },
  { name: "Тяга к лицу", muscleGroups: ["SHOULDERS", "TRAPS"], restSec: 60 },
  // Бицепс
  { name: "Подъём штанги на бицепс", muscleGroups: ["BICEPS", "FOREARMS"], restSec: 60 },
  { name: "Молотки с гантелями", muscleGroups: ["BICEPS", "FOREARMS"], restSec: 60 },
  // Трицепс
  { name: "Французский жим", muscleGroups: ["TRICEPS"], restSec: 60 },
  { name: "Разгибание рук на блоке", muscleGroups: ["TRICEPS"], restSec: 60 },
  // Предплечья
  { name: "Сгибание запястий со штангой", muscleGroups: ["FOREARMS"], restSec: 45 },
  { name: "Прогулка фермера", muscleGroups: ["FOREARMS", "TRAPS"], restSec: 90 },
  // Икры
  { name: "Подъём на носки стоя", muscleGroups: ["CALVES"], restSec: 60 },
  { name: "Подъём на носки сидя", muscleGroups: ["CALVES"], restSec: 60 },
  // Трапеция
  { name: "Шраги со штангой", muscleGroups: ["TRAPS"], restSec: 60 },
  // Пресс
  { name: "Скручивания", muscleGroups: ["ABS"], restSec: 45, bodyweight: true },
  { name: "Подъём ног в висе", muscleGroups: ["ABS"], restSec: 60, bodyweight: true },
];

type SeedTemplate = {
  name: string;
  program: string;
  description: string;
  exercises: [name: string, sets: number, reps: number][];
};

const PROGRAMS: SeedTemplate[] = [
  {
    name: "Push",
    program: "Push / Pull / Legs",
    description: "Жимовые движения: грудь, плечи, трицепс",
    exercises: [
      ["Жим штанги лёжа", 4, 8],
      ["Жим гантелей на наклонной скамье", 3, 10],
      ["Жим штанги стоя", 3, 8],
      ["Махи гантелями в стороны", 3, 15],
      ["Разгибание рук на блоке", 3, 12],
    ],
  },
  {
    name: "Pull",
    program: "Push / Pull / Legs",
    description: "Тяговые движения: спина, бицепс, трапеция",
    exercises: [
      ["Становая тяга", 3, 5],
      ["Подтягивания", 4, 8],
      ["Тяга штанги в наклоне", 3, 10],
      ["Тяга к лицу", 3, 15],
      ["Подъём штанги на бицепс", 3, 12],
      ["Шраги со штангой", 3, 12],
    ],
  },
  {
    name: "Legs",
    program: "Push / Pull / Legs",
    description: "Ноги, икры, пресс",
    exercises: [
      ["Приседания со штангой", 4, 8],
      ["Румынская тяга", 3, 10],
      ["Жим ногами", 3, 12],
      ["Выпады с гантелями", 3, 10],
      ["Подъём на носки стоя", 4, 15],
      ["Подъём ног в висе", 3, 12],
    ],
  },
  {
    name: "Full Body",
    program: "Full Body",
    description: "Все основные группы мышц за одну тренировку",
    exercises: [
      ["Приседания со штангой", 3, 8],
      ["Жим штанги лёжа", 3, 8],
      ["Тяга штанги в наклоне", 3, 8],
      ["Жим штанги стоя", 3, 10],
      ["Скручивания", 3, 15],
    ],
  },
  {
    name: "5×5 — день A",
    program: "5×5",
    description: "Силовая программа: присед, жим лёжа, тяга в наклоне",
    exercises: [
      ["Приседания со штангой", 5, 5],
      ["Жим штанги лёжа", 5, 5],
      ["Тяга штанги в наклоне", 5, 5],
    ],
  },
  {
    name: "5×5 — день B",
    program: "5×5",
    description: "Силовая программа: присед, жим стоя, становая",
    exercises: [
      ["Приседания со штангой", 5, 5],
      ["Жим штанги стоя", 5, 5],
      ["Становая тяга", 1, 5],
    ],
  },
];

// Встроенные записи имеют userId = null; в Postgres NULL не участвует в unique,
// поэтому upsert делаем вручную через findFirst — сид можно запускать повторно.
async function seedExercises() {
  const ids = new Map<string, string>();

  for (const e of EXERCISES) {
    const data = {
      muscleGroups: e.muscleGroups,
      defaultRestSec: e.restSec,
      isBodyweight: e.bodyweight ?? false,
    };
    const existing = await db.exercise.findFirst({ where: { userId: null, name: e.name } });
    const exercise = existing
      ? await db.exercise.update({ where: { id: existing.id }, data })
      : await db.exercise.create({ data: { name: e.name, ...data } });
    ids.set(e.name, exercise.id);
  }

  return ids;
}

async function seedPrograms(exerciseIds: Map<string, string>) {
  for (const t of PROGRAMS) {
    const exercises = t.exercises.map(([name, sets, reps], order) => {
      const exerciseId = exerciseIds.get(name);
      if (!exerciseId) throw new Error(`Неизвестное упражнение в программе «${t.name}»: ${name}`);
      return { exerciseId, order, targetSets: sets, targetReps: reps };
    });

    const existing = await db.workoutTemplate.findFirst({
      where: { userId: null, program: t.program, name: t.name },
    });

    if (existing) {
      await db.workoutTemplate.update({
        where: { id: existing.id },
        data: {
          description: t.description,
          exercises: { deleteMany: {}, create: exercises },
        },
      });
    } else {
      await db.workoutTemplate.create({
        data: {
          name: t.name,
          program: t.program,
          description: t.description,
          exercises: { create: exercises },
        },
      });
    }
  }
}

// Тестовая учётка для локальной разработки (в production не создаётся).
const DEMO_USER = { login: "demo", email: "demo@hero-fit.local", name: "Demo", password: "Demo1234" };

async function seedDemoUser(): Promise<string | null> {
  if (process.env.NODE_ENV === "production") return null;
  // Те же параметры Argon2id, что в lib/auth/password.ts (его нельзя импортировать: server-only)
  const passwordHash = await hash(DEMO_USER.password, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
  const { login, email, name } = DEMO_USER;
  // Повторный сид сбрасывает пароль, прогресс не трогает
  await db.user.upsert({
    where: { login },
    create: { login, email, name, passwordHash },
    update: { passwordHash },
  });
  return passwordHash;
}

// ───────────── Тестовые друзья demo (лента, лига, заявки) — только для разработки ─────────────

type SeedSet = [exercise: string, weight: number, reps: number, sets: number];
type SeedWorkout = {
  name: string;
  hoursAgo: number;
  minutes: number;
  exercises: SeedSet[];
  records?: [exercise: string, type: RecordType, value: number][];
  achievements?: [code: string, title: string][];
};
type SeedFriend = {
  login: string;
  name: string;
  nickname: string;
  hideWeights?: boolean;
  /** false — входящая заявка к demo (ещё не друзья). */
  accepted: boolean;
  /** Сколько прошлых недель перед текущей добить «пн/ср/пт» тренировками — для недельной серии. */
  fillerWeeks?: number;
  /** Самая свежая тренировка побеждает босса недели («⚔ Босс повержен» в ленте, ⚔ в лиге). */
  bossWin?: boolean;
  workouts: SeedWorkout[];
};

const HOUR = 3_600_000;
/** Часов с начала текущей недели (пн 00:00 UTC — пояс тестовых друзей) — их свежие тренировки кладём внутрь неё. */
const WEEK_H = (Date.now() - Date.parse(`${weekKey(new Date(), "UTC")}T00:00:00Z`)) / HOUR;

function fillerWorkouts(weeks: number): SeedWorkout[] {
  return Array.from({ length: weeks }, (_, k) =>
    [0, 2, 4].map((day) => ({
      name: "Full Body",
      // пн/ср/пт 18:00 UTC (k + 1) недель назад
      hoursAgo: WEEK_H + (k + 1) * 7 * 24 - (day * 24 + 18),
      minutes: 50,
      exercises: [
        ["Приседания со штангой", 100, 5, 3],
        ["Жим штанги лёжа", 95, 5, 3],
        ["Подтягивания", 0, 8, 3],
      ] satisfies SeedSet[],
    })),
  ).flat();
}

const DEMO_FRIENDS: SeedFriend[] = [
  {
    login: "demo.masha",
    name: "Маша",
    nickname: "Iron_Masha",
    accepted: true,
    // 3 недели по 3 тренировки + 3 на этой неделе: свежая Push засчитывает 4-ю неделю — веха серии в ленте
    fillerWeeks: 3,
    bossWin: true,
    workouts: [
      {
        name: "Legs",
        hoursAgo: WEEK_H * 0.85,
        minutes: 64,
        exercises: [
          ["Приседания со штангой", 110, 5, 4],
          ["Жим ногами", 180, 10, 3],
          ["Подъём на носки стоя", 60, 15, 3],
        ],
        records: [["Приседания со штангой", "ONE_RM", 128.3]],
      },
      {
        name: "Pull",
        hoursAgo: WEEK_H * 0.5,
        minutes: 55,
        exercises: [
          ["Становая тяга", 140, 5, 3],
          ["Подтягивания", 0, 10, 3],
          ["Тяга штанги в наклоне", 70, 8, 3],
        ],
      },
      {
        name: "Push",
        hoursAgo: Math.min(3, WEEK_H * 0.15),
        minutes: 52,
        exercises: [
          ["Жим штанги лёжа", 102.5, 5, 4],
          ["Жим штанги стоя", 50, 8, 3],
          ["Разгибание рук на блоке", 30, 12, 3],
        ],
        records: [["Жим штанги лёжа", "MAX_WEIGHT", 102.5]],
        achievements: [["lift:bench:100", "Клуб сотки: жим лёжа"]],
      },
    ],
  },
  {
    login: "demo.boris",
    name: "Борис",
    nickname: "Борис",
    hideWeights: true,
    accepted: true,
    workouts: [
      {
        name: "Full Body",
        hoursAgo: 75,
        minutes: 70,
        exercises: [
          ["Приседания со штангой", 90, 8, 3],
          ["Жим штанги лёжа", 70, 8, 3],
          ["Тяга верхнего блока", 55, 10, 3],
        ],
      },
      {
        name: "Ноги",
        hoursAgo: 7,
        minutes: 48,
        exercises: [
          ["Приседания со штангой", 100, 5, 5],
          ["Румынская тяга", 80, 8, 3],
        ],
        records: [["Приседания со штангой", "ONE_RM", 116.7]],
      },
    ],
  },
  {
    login: "demo.kate",
    name: "Катя",
    nickname: "kettle.kate",
    accepted: false,
    workouts: [
      {
        name: "Кардио + пресс",
        hoursAgo: 27,
        minutes: 40,
        exercises: [
          ["Скручивания", 0, 20, 3],
          ["Подъём ног в висе", 0, 12, 3],
          ["Прогулка фермера", 24, 20, 3],
        ],
      },
    ],
  },
];

/** История друга пересоздаётся при каждом сиде относительно «сейчас» — лента и лига всегда свежие. */
async function seedFriendHistory(userId: string, friend: SeedFriend, exerciseIds: Map<string, string>) {
  await db.workout.deleteMany({ where: { userId } });
  // XpEvent при удалении тренировки остаётся (workoutId = null) — без чистки XP задвоился бы в лиге
  await db.xpEvent.deleteMany({ where: { userId } });
  await db.personalRecord.deleteMany({ where: { userId } });
  await db.bossWeek.deleteMany({ where: { userId } });

  let xp = 0;
  const workoutIds: string[] = [];
  // meta тренировки — как в lib/workouts/finish.ts: счёт недели и недельная серия на момент тренировки
  const weekCounts = new Map<string, number>();
  let streak = 0;
  let lastWeek: string | null = null;
  const all = [...fillerWorkouts(friend.fillerWeeks ?? 0), ...friend.workouts].sort((a, b) => b.hoursAgo - a.hoursAgo);
  for (const w of all) {
    const finishedAt = new Date(Date.now() - w.hoursAgo * HOUR);
    const startedAt = new Date(finishedAt.getTime() - w.minutes * 60_000);
    const week = weekKey(finishedAt, "UTC");
    const weekCount = (weekCounts.get(week) ?? 0) + 1;
    weekCounts.set(week, weekCount);
    const streakExtended = weekCount === STREAK_WEEK_TARGET;
    if (streakExtended) {
      streak = lastWeek && weeksBetween(lastWeek, week) === 1 ? streak + 1 : 1;
      lastWeek = week;
    }
    const totals = w.exercises.reduce(
      (t, [, weight, reps, sets]) => ({
        sets: t.sets + sets,
        reps: t.reps + reps * sets,
        volume: t.volume + weight * reps * sets,
      }),
      { sets: 0, reps: 0, volume: 0 },
    );
    const baseXp = workoutXp(totals);
    const recordsXp = (w.records?.length ?? 0) * PR_XP;
    const xpBefore = xp;
    xp += baseXp + recordsXp;

    const workout = await db.workout.create({
      data: {
        userId,
        name: w.name,
        status: "COMPLETED",
        startedAt,
        finishedAt,
        durationSec: w.minutes * 60,
        totalSets: totals.sets,
        totalReps: totals.reps,
        totalVolume: totals.volume,
        xpEarned: baseXp + recordsXp,
        exercises: {
          create: w.exercises.map(([name, weight, reps, sets], order) => {
            const exerciseId = exerciseIds.get(name);
            if (!exerciseId) throw new Error(`Неизвестное упражнение у тестового друга: ${name}`);
            return {
              exerciseId,
              order,
              sets: {
                create: Array.from({ length: sets }, (_, i) => ({ order: i, weight, reps, completedAt: finishedAt })),
              },
            };
          }),
        },
      },
      select: { id: true },
    });
    workoutIds.push(workout.id);

    const records = (w.records ?? []).map(([exerciseName, type, value]) => ({
      exerciseId: exerciseIds.get(exerciseName)!,
      exerciseName,
      type,
      value,
      previous: Math.round(value * 0.95 * 10) / 10,
    }));
    // Та же форма, что FinishMeta в lib/workouts/finish.ts — по ней строится лента
    const meta = {
      xpBefore,
      levelBefore: levelProgress(xpBefore).level,
      levelAfter: levelProgress(xp).level,
      workoutXp: baseXp,
      recordsXp,
      achievementsXp: 0,
      records,
      achievements: (w.achievements ?? []).map(([code, title]) => ({ code, title, description: "", xpReward: 0 })),
      streak,
      streakExtended,
      streakReset: false,
      usedFreezes: 0,
      weekCount,
      // Победа над боссом — свежей тренировкой (форма FinishMeta.boss); сама BossWeek — ниже
      ...(friend.bossWin && w === all.at(-1)
        ? { boss: { week, code: bossForWeek(week), damage: totals.sets * SET_DAMAGE, crits: 0, hpBefore: totals.sets * SET_DAMAGE, hpAfter: 0, hp: MIN_HP, defeated: true } }
        : {}),
    };
    if (friend.bossWin && w === all.at(-1)) {
      await db.bossWeek.create({ data: { userId, week, bossCode: bossForWeek(week), hp: MIN_HP, defeatedAt: finishedAt } });
      // Титул за эту победу — виден в лиге, ленте и списке друзей
      await db.user.update({ where: { id: userId }, data: { titleCode: `boss:${bossForWeek(week)}:1` } });
    }
    await db.xpEvent.create({
      data: { userId, workoutId: workout.id, amount: baseXp, reason: "WORKOUT_COMPLETED", meta, createdAt: finishedAt },
    });
    if (recordsXp) {
      await db.xpEvent.create({
        data: {
          userId,
          workoutId: workout.id,
          amount: recordsXp,
          reason: "PERSONAL_RECORD",
          meta: { records },
          createdAt: finishedAt,
        },
      });
    }
  }

  await db.user.update({ where: { id: userId }, data: { xp, level: levelProgress(xp).level, timeZone: "UTC" } });
  await recomputeStreak(db, userId, new Date());
  return workoutIds;
}

async function seedDemoFriends(exerciseIds: Map<string, string>, passwordHash: string) {
  const demo = await db.user.findUniqueOrThrow({
    where: { login: DEMO_USER.login },
    select: { id: true, nickname: true },
  });
  // Ник demo задаём, только если его ещё нет — свой выбор при повторном сиде не трогаем
  if (!demo.nickname) {
    const taken = await db.user.findUnique({ where: { nicknameKey: "demo_hero" }, select: { id: true } });
    if (!taken) await db.user.update({ where: { id: demo.id }, data: { nickname: "Demo_Hero", nicknameKey: "demo_hero" } });
  }

  const latest = new Map<string, string>();
  const ids = new Map<string, string>();
  for (const f of DEMO_FRIENDS) {
    const profile = {
      name: f.name,
      nickname: f.nickname,
      nicknameKey: f.nickname.toLowerCase(),
      hideWeights: f.hideWeights ?? false,
      shareActivity: true,
    };
    const user = await db.user.upsert({
      where: { login: f.login },
      create: { login: f.login, email: `${f.login}@hero-fit.local`, passwordHash, ...profile },
      update: { passwordHash, ...profile },
      select: { id: true },
    });
    ids.set(f.login, user.id);
    latest.set(f.login, (await seedFriendHistory(user.id, f, exerciseIds)).at(-1)!);

    await db.friendship.deleteMany({
      where: {
        OR: [
          { requesterId: demo.id, addresseeId: user.id },
          { requesterId: user.id, addresseeId: demo.id },
        ],
      },
    });
    await db.friendship.create({
      data: f.accepted
        ? { requesterId: demo.id, addresseeId: user.id, status: "ACCEPTED", acceptedAt: new Date() }
        : { requesterId: user.id, addresseeId: demo.id }, // входящая заявка к demo
    });
  }

  // Маша и Борис дружат и дают друг другу 👊 — в ленте demo видно «кто поддержал»
  const masha = ids.get("demo.masha")!;
  const boris = ids.get("demo.boris")!;
  const pair = await db.friendship.findFirst({
    where: {
      OR: [
        { requesterId: masha, addresseeId: boris },
        { requesterId: boris, addresseeId: masha },
      ],
    },
  });
  if (!pair) {
    await db.friendship.create({ data: { requesterId: masha, addresseeId: boris, status: "ACCEPTED", acceptedAt: new Date() } });
  }
  await db.kudos.createMany({
    data: [
      { workoutId: latest.get("demo.masha")!, userId: boris },
      { workoutId: latest.get("demo.boris")!, userId: masha },
    ],
    skipDuplicates: true,
  });
}


// ───────────── Архив «Итогов недели» для demo — готовые снимки, свои тренировки demo не трогаем ─────────────

type SeedRecapWeek = {
  workouts: number;
  minutes: number;
  volume: number;
  sets: number;
  /** XP за неделю: demo, Iron_Masha, Борис. */
  league: [me: number, masha: number, boris: number];
  best: [exercise: string, weight: number, reps: number, record: boolean];
  streak: number;
  frozen?: boolean;
  prs?: [exercise: string, type: RecordType, value: number][];
  achievements?: [code: string, title: string][];
  level?: [from: number, to: number];
  muscles: [MuscleGroup, number][];
  forgotten?: MuscleGroup;
  plan?: [done: number, planned: number];
};

/** От старой недели (9 недель назад) к новой (прошлая неделя) — рост, спад, заморозка, прерванная серия. */
const DEMO_RECAP_WEEKS: SeedRecapWeek[] = [
  { workouts: 3, minutes: 150, volume: 9800, sets: 42, league: [260, 310, 180], best: ["Жим штанги лёжа", 80, 6, false], streak: 1,
    muscles: [["CHEST", 12], ["LEGS", 10], ["BACK", 9], ["SHOULDERS", 6]] },
  { workouts: 3, minutes: 165, volume: 11200, sets: 46, league: [300, 280, 210], best: ["Приседания со штангой", 100, 5, true], streak: 2,
    prs: [["Приседания со штангой", "MAX_WEIGHT", 100]], achievements: [["streakw:2", "В ударе: 2 недели"]],
    muscles: [["LEGS", 14], ["CHEST", 11], ["BACK", 10], ["BICEPS", 5]] },
  { workouts: 4, minutes: 210, volume: 13900, sets: 58, league: [380, 350, 190], best: ["Жим штанги лёжа", 85, 5, true], streak: 3,
    prs: [["Жим штанги лёжа", "ONE_RM", 99.2]], plan: [3, 4],
    muscles: [["CHEST", 15], ["LEGS", 14], ["BACK", 12], ["SHOULDERS", 9], ["TRICEPS", 8]] },
  { workouts: 2, minutes: 95, volume: 7100, sets: 28, league: [170, 330, 240], best: ["Становая тяга", 120, 3, false], streak: 3, frozen: true,
    muscles: [["BACK", 10], ["CHEST", 9], ["BICEPS", 6]] },
  { workouts: 3, minutes: 160, volume: 12400, sets: 50, league: [310, 300, 260], best: ["Становая тяга", 130, 3, true], streak: 4,
    prs: [["Становая тяга", "MAX_WEIGHT", 130]], achievements: [["streakw:4", "В ударе: 4 недели"], ["workouts:20", "20 тренировок"]],
    muscles: [["BACK", 13], ["CHEST", 12], ["SHOULDERS", 10], ["ABS", 6]], forgotten: "LEGS" },
  { workouts: 1, minutes: 55, volume: 3900, sets: 15, league: [90, 360, 200], best: ["Жим штанги лёжа", 85, 4, false], streak: 0,
    muscles: [["CHEST", 8], ["TRICEPS", 7]], plan: [1, 3] },
  { workouts: 3, minutes: 170, volume: 13100, sets: 52, league: [330, 320, 150], best: ["Приседания со штангой", 110, 4, true], streak: 1,
    prs: [["Приседания со штангой", "MAX_WEIGHT", 110], ["Подтягивания", "MAX_REPS", 12]], level: [2, 3],
    muscles: [["LEGS", 16], ["BACK", 12], ["CHEST", 10], ["BICEPS", 7]] },
  { workouts: 4, minutes: 225, volume: 15800, sets: 64, league: [420, 390, 230], best: ["Жим штанги лёжа", 90, 5, true], streak: 2,
    prs: [["Жим штанги лёжа", "MAX_WEIGHT", 90]], achievements: [["workouts:25", "25 тренировок"]], plan: [4, 4],
    muscles: [["CHEST", 16], ["LEGS", 15], ["BACK", 14], ["SHOULDERS", 10], ["TRICEPS", 9]] },
];

function demoRecapData(week: string, w: SeedRecapWeek, prev: SeedRecapWeek | undefined, exerciseIds: Map<string, string>): RecapData {
  const id = (name: string) => {
    const exerciseId = exerciseIds.get(name);
    if (!exerciseId) throw new Error(`Неизвестное упражнение в демо-итогах: ${name}`);
    return exerciseId;
  };
  const members = [
    { nickname: "Demo_Hero", xp: w.league[0], me: true },
    { nickname: "Iron_Masha", xp: w.league[1], me: false },
    { nickname: "Борис", xp: w.league[2], me: false },
  ].sort((a, b) => b.xp - a.xp);
  const rows = members.map((m, i) => ({ ...m, place: i + 1 }));
  const me = rows.find((r) => r.me)!;
  const [exercise, weight, reps, isRecord] = w.best;
  const credited = w.workouts >= STREAK_WEEK_TARGET;
  const hasRecords = w.prs || w.achievements || w.level;
  return {
    version: 1,
    week,
    totals: {
      workouts: w.workouts,
      minutes: w.minutes,
      volume: w.volume,
      sets: w.sets,
      prev: prev ? { workouts: prev.workouts, minutes: prev.minutes, volume: prev.volume, sets: prev.sets } : null,
    },
    league: { place: me.place, of: rows.length, xp: me.xp, rows },
    bestSet: { exerciseId: id(exercise), exerciseName: exercise, weight, reps, e1rm: epley1RM(weight, reps), isRecord },
    streak: { weekCount: w.workouts, target: STREAK_WEEK_TARGET, credited, streak: w.streak, frozen: w.frozen ?? false },
    ...(hasRecords
      ? {
          records: {
            prs: (w.prs ?? []).map(([name, type, value]) => ({ exerciseId: id(name), exerciseName: name, type, value })),
            achievements: (w.achievements ?? []).map(([code, title]) => ({ code, title })),
            level: w.level ? { from: w.level[0], to: w.level[1] } : null,
          },
        }
      : {}),
    muscles: { groups: w.muscles.map(([group, sets]) => ({ group, sets })), forgotten: w.forgotten ?? null },
    ...(w.plan ? { plan: { done: w.plan[0], planned: w.plan[1] } } : {}),
  };
}

/**
 * Снимки WeeklyRecap для demo за 8 недель (последняя — прошлая неделя). Помечены demo: true в JSON — повторный сид
 * пересоздаёт только их; недели с настоящими итогами пропускаются. Прошлая неделя — только если у demo на ней
 * нет своих тренировок (иначе итоги соберутся из реальных данных) и непросмотренная: карточка «новое» на дашборде.
 */
async function seedDemoRecaps(exerciseIds: Map<string, string>) {
  const demo = await db.user.findUniqueOrThrow({ where: { login: DEMO_USER.login }, select: { id: true, timeZone: true } });
  await db.$executeRaw`DELETE FROM "WeeklyRecap" WHERE "userId" = ${demo.id} AND (data->>'demo')::boolean IS TRUE`;
  const real = new Set((await db.weeklyRecap.findMany({ where: { userId: demo.id }, select: { week: true } })).map((r) => r.week));
  const lastWeek = addWeeks(weekKey(new Date(), demo.timeZone), -1);
  const lastWeekWorkouts = await db.workout.count({
    where: {
      userId: demo.id,
      status: "COMPLETED",
      finishedAt: { gte: localMidnight(lastWeek, demo.timeZone), lt: localMidnight(addWeeks(lastWeek, 1), demo.timeZone) },
    },
  });
  const now = new Date();
  const rows = DEMO_RECAP_WEEKS.map((w, i) => {
    const week = addWeeks(lastWeek, i - (DEMO_RECAP_WEEKS.length - 1));
    const archived = week !== lastWeek;
    return {
      userId: demo.id,
      week,
      data: { ...demoRecapData(week, w, DEMO_RECAP_WEEKS[i - 1], exerciseIds), demo: true },
      pushedAt: now,
      seenAt: archived ? now : null,
    };
  }).filter((r) => !real.has(r.week) && (r.week !== lastWeek || lastWeekWorkouts === 0));
  await db.weeklyRecap.createMany({ data: rows, skipDuplicates: true });
  return rows.length;
}

// ───────────── Тестовый тренер (режим тренера) — только для разработки ─────────────

/** Постоянный код приглашения demo.coach: /coach/join/DEMXTRNR (алфавит кода — без 0/O/1/I/L). */
const DEMO_COACH = { login: "demo.coach", name: "Тренер", nickname: "Coach_Demo", code: "DEMXTRNR", clients: ["demo.masha", "demo.boris"] };

/** Шаблон тренера и его назначение Маше: пн/ср/пт 19:00 с понедельника прошлой недели на 8 недель; задания на 2 упражнения. */
const COACH_TEMPLATE = {
  name: "Ноги — база",
  exercises: [
    { name: "Приседания со штангой", sets: 3, reps: 8 },
    { name: "Румынская тяга", sets: 3, reps: 10 },
    { name: "Жим ногами", sets: 3, reps: 12 },
    { name: "Подъём на носки стоя", sets: 4, reps: 15 },
  ],
};

async function seedCoachPlans(coachId: string, exerciseIds: Map<string, string>) {
  await db.workoutTemplate.deleteMany({ where: { userId: coachId, name: COACH_TEMPLATE.name } });
  const template = await db.workoutTemplate.create({
    data: {
      userId: coachId,
      name: COACH_TEMPLATE.name,
      exercises: {
        create: COACH_TEMPLATE.exercises.map((e, order) => ({ exerciseId: exerciseIds.get(e.name)!, order, targetSets: e.sets, targetReps: e.reps })),
      },
    },
  });
  const masha = await db.user.findUniqueOrThrow({ where: { login: "demo.masha" }, select: { id: true, timeZone: true } });
  await db.planSeries.deleteMany({ where: { userId: masha.id, coachId } });
  await db.planEntry.deleteMany({ where: { userId: masha.id, coachId, seriesId: null } });
  const monday = addWeeks(weekKey(new Date(), masha.timeZone), -1);
  const endDate = addDays(monday, 8 * 7 - 1);
  await db.planSeries.createMany({
    data: [0, 2, 4].map((weekday) => ({
      userId: masha.id,
      coachId,
      templateId: template.id,
      title: template.name,
      weekday,
      time: "19:00",
      startDate: addDays(monday, weekday),
      endDate,
    })),
  });
  // Задания Маше (шаблон пересоздан — прежние ушли каскадом): присед — полностью и с прогрессией (одна неудача), румынская тяга — только вес
  await db.coachTarget.createMany({
    data: [
      { clientId: masha.id, templateId: template.id, exerciseId: exerciseIds.get("Приседания со штангой")!, sets: 4, reps: 8, weight: 42.5, step: 2.5, fails: 1 },
      { clientId: masha.id, templateId: template.id, exerciseId: exerciseIds.get("Румынская тяга")!, weight: 35 },
    ],
  });
}

async function seedDemoCoach(passwordHash: string, exerciseIds: Map<string, string>) {
  const profile = { name: DEMO_COACH.name, nickname: DEMO_COACH.nickname, nicknameKey: DEMO_COACH.nickname.toLowerCase(), isCoach: true, coachCode: DEMO_COACH.code };
  const coach = await db.user.upsert({
    where: { login: DEMO_COACH.login },
    create: { login: DEMO_COACH.login, email: `${DEMO_COACH.login}@hero-fit.local`, passwordHash, onboardedAt: new Date(), ...profile },
    update: { passwordHash, ...profile },
    select: { id: true },
  });
  const clients = await db.user.findMany({ where: { login: { in: DEMO_COACH.clients } }, select: { id: true } });
  const clientIds = clients.map((c) => c.id);
  // Пересоздаём: связи тренера и активные связи его клиентов с другими (у клиента одна активная)
  await db.coachLink.deleteMany({ where: { OR: [{ coachId: coach.id }, { clientId: { in: clientIds }, endedAt: null }] } });
  const day = 86_400_000;
  await db.coachLink.createMany({
    data: clientIds.map((clientId, i) => ({ coachId: coach.id, clientId, createdAt: new Date(Date.now() - (14 + i * 7) * day) })),
  });
  await seedCoachPlans(coach.id, exerciseIds);
  await seedCoachComments(coach.id);
  // Опубликованная страница /trainer/Coach_Demo (клиентов двое — цифр по клиентам на ней нет: порог 3)
  const page = {
    displayName: "Тренер Демо",
    city: "Москва",
    format: "BOTH" as const,
    specialties: ["strength", "beginners"],
    about:
      "Помогаю начать с нуля и выйти на первые силовые результаты: техника базовых движений, понятный план на неделю и прогрессия весов без травм.\n\nРаботаю онлайн и в зале.",
    hiddenStats: [],
    publishedAt: new Date(),
  };
  await db.coachProfile.upsert({ where: { userId: coach.id }, create: { userId: coach.id, ...page }, update: page });
}

/** Комментарии тренера к свежей тренировке Маши: общий и заметка к первому упражнению. */
async function seedCoachComments(coachId: string) {
  const masha = await db.user.findUniqueOrThrow({ where: { login: "demo.masha" }, select: { id: true } });
  await db.coachComment.deleteMany({ where: { coachId, clientId: masha.id } });
  const workout = await db.workout.findFirst({
    where: { userId: masha.id, status: "COMPLETED" },
    orderBy: { finishedAt: "desc" },
    select: { id: true, exercises: { orderBy: { order: "asc" }, take: 1, select: { id: true } } },
  });
  if (!workout) return;
  await db.coachComment.createMany({
    data: [
      { coachId, clientId: masha.id, workoutId: workout.id, text: "Отличная работа и новый рекорд! В следующий раз держи паузу внизу на секунду." },
      ...workout.exercises.map((we) => ({
        coachId,
        clientId: masha.id,
        workoutId: workout.id,
        workoutExerciseId: we.id,
        text: "Темп хороший, последний подход можно было дожать ещё на один повтор.",
      })),
    ],
  });
}

/**
 * Цели demo: силовая по жиму (+15 % к рекорду, без рекорда — 60 кг; срок — 3 месяца) и журнал веса за 4 недели. Только пока у demo
 * нет своих целей и взвешиваний — настоящие данные сид не трогает.
 */
async function seedDemoGoals() {
  const demo = await db.user.findUniqueOrThrow({ where: { login: DEMO_USER.login }, select: { id: true, timeZone: true } });
  const tz = demo.timeZone;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
  const shift = (days: number) => {
    const d = new Date(`${today}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  };
  const created: string[] = [];
  if ((await db.goal.count({ where: { userId: demo.id } })) === 0) {
    const bench = await db.exercise.findFirst({ where: { name: "Жим штанги лёжа", userId: null }, select: { id: true } });
    const pr = bench
      ? await db.personalRecord.findUnique({ where: { userId_exerciseId_type: { userId: demo.id, exerciseId: bench.id, type: "MAX_WEIGHT" } } })
      : null;
    if (bench) {
      const d = new Date(`${today}T12:00:00Z`);
      d.setUTCMonth(d.getUTCMonth() + 3);
      await db.goal.create({
        data: {
          userId: demo.id,
          type: "STRENGTH",
          exerciseId: bench.id,
          metric: "MAX_WEIGHT",
          startValue: pr?.value ?? 0,
          target: pr ? Math.ceil((pr.value * 1.15) / 2.5) * 2.5 : 60,
          deadline: d.toISOString().slice(0, 10),
          createdAt: new Date(Date.now() - 14 * 86_400_000),
        },
      });
      created.push("жим");
    }
  }
  if ((await db.bodyWeightEntry.count({ where: { userId: demo.id } })) === 0) {
    const weights: [number, number][] = [[-28, 82.4], [-21, 82], [-14, 81.6], [-7, 81.1], [0, 80.8]];
    await db.bodyWeightEntry.createMany({ data: weights.map(([days, weight]) => ({ userId: demo.id, date: shift(days), weight })) });
    await db.user.update({ where: { id: demo.id }, data: { bodyWeight: 80.8 } });
    created.push("вес");
  }
  return created.length ? created.join(", ") : "уже есть";
}

type SeedClub = {
  code: string;
  name: string;
  city: string;
  address: string;
  about: string;
  admin: string;
  members: string[];
  /** Публичная страница /gym/<город>/<зал> опубликована. */
  published: boolean;
  task: { type: "WORKOUTS"; mode: "CLUB" | "EACH"; target: number };
};

/**
 * Клубы залов: у Маши — опубликованный с тремя участниками (цифры на странице видны) и заданием «всем клубом»,
 * у demo — свой, ещё не опубликованный (проверять редактор), с заданием «каждому». В клуб Маши demo вступает по
 * приглашению /clubs/join/<код>. Состав, задания и вклад пересоздаются при каждом сиде.
 */
const DEMO_CLUBS: SeedClub[] = [
  {
    code: "DEMGYM22",
    name: "Железный двор",
    city: "Москва",
    address: "ул. Тверская, 12",
    about:
      "Зал в центре: шесть силовых рам, помосты для становой, гантели до 60 кг и отдельная зона кардио.\n\nОткрыты с 7:00 до 23:00, по выходным — с 9:00.",
    admin: "demo.masha",
    members: ["demo.masha", "demo.boris", "demo.coach"],
    published: true,
    task: { type: "WORKOUTS", mode: "CLUB", target: 30 },
  },
  {
    code: "DEMGYM33",
    name: "Демо Фитнес",
    city: "Казань",
    address: "ул. Баумана, 7",
    about: "Небольшой зал у дома: стойки для приседа, скамьи, блочные тренажёры и дружная утренняя компания.",
    admin: DEMO_USER.login,
    members: [DEMO_USER.login, "demo.kate"],
    published: false,
    task: { type: "WORKOUTS", mode: "EACH", target: 12 },
  },
];

async function seedDemoClubs() {
  const day = 86_400_000;
  const now = Date.now();
  const logins = [...new Set(DEMO_CLUBS.flatMap((c) => [c.admin, ...c.members]))];
  const users = new Map((await db.user.findMany({ where: { login: { in: logins } }, select: { id: true, login: true } })).map((u) => [u.login, u.id]));
  // Флаг clubs демо-учёткам — списком, не затирая остальных и не включая выключенный флаг
  await db.$executeRaw`
    INSERT INTO "FeatureFlag" (key, enabled, percent, "userIds", "updatedAt")
    VALUES ('clubs', true, 0, ${[...users.values()]}, now())
    ON CONFLICT (key) DO UPDATE SET "userIds" = ARRAY(SELECT DISTINCT unnest("FeatureFlag"."userIds" || EXCLUDED."userIds")), "updatedAt" = now()`;

  for (const c of DEMO_CLUBS) {
    const adminId = users.get(c.admin)!;
    const data = {
      name: c.name,
      nameKey: clubKey(c.name),
      city: c.city,
      cityKey: clubKey(c.city),
      address: c.address,
      addressKey: clubKey(c.address),
      contact: "+7 900 000-00-00",
      adminId,
      status: "APPROVED" as const,
      reviewedAt: new Date(),
      about: c.about,
      slug: c.published ? slugify(c.name) : null,
      citySlug: c.published ? slugify(c.city, "city") : null,
      publishedAt: c.published ? new Date() : null,
    };
    const club = await db.club.upsert({ where: { code: c.code }, create: { code: c.code, ...data }, update: data, select: { id: true } });
    const memberIds = c.members.map((l) => users.get(l)!);
    const joinedAt = new Date(now - 30 * day);
    await db.clubMember.deleteMany({ where: { OR: [{ clubId: club.id }, { userId: { in: memberIds } }] } });
    await db.clubBan.deleteMany({ where: { clubId: club.id } });
    await db.clubMember.createMany({ data: memberIds.map((userId) => ({ userId, clubId: club.id, joinedAt })) });

    // Задание: две недели назад … через две недели; вклад — завершённые тренировки участников в окне
    await db.clubTask.deleteMany({ where: { clubId: club.id } });
    const startsAt = new Date(now - 14 * day);
    const task = await db.clubTask.create({
      data: { clubId: club.id, ...c.task, startsAt, endsAt: new Date(now + 14 * day), membersAtStart: memberIds.length, createdById: adminId },
      select: { id: true },
    });
    const workouts = await db.workout.findMany({
      where: { userId: { in: memberIds }, status: "COMPLETED", finishedAt: { gte: startsAt } },
      select: { id: true, userId: true },
    });
    await db.clubTaskHit.createMany({ data: workouts.map((w) => ({ taskId: task.id, userId: w.userId, workoutId: w.id, amount: 1 })) });
  }
  return DEMO_CLUBS.map((c) => `«${c.name}» /clubs/join/${c.code}${c.published ? ` (страница /gym/${slugify(c.city, "city")}/${slugify(c.name)})` : ""}`).join(", ");
}

async function main() {
  const exerciseIds = await seedExercises();
  await seedPrograms(exerciseIds);
  console.log(`Seeded ${EXERCISES.length} exercises, ${PROGRAMS.length} program templates`);
  const demoHash = await seedDemoUser();
  if (demoHash) {
    console.log(`Demo user: ${DEMO_USER.login} / ${DEMO_USER.password}`);
    await seedDemoFriends(exerciseIds, demoHash);
    // Серия demo — по его истории (недельный streak)
    const demo = await db.user.findUniqueOrThrow({ where: { login: DEMO_USER.login }, select: { id: true } });
    await recomputeStreak(db, demo.id, new Date());
    console.log(`Demo weekly recaps: ${await seedDemoRecaps(exerciseIds)}`);
    console.log(`Demo goals: ${await seedDemoGoals()}`);
    console.log(`Demo friends: ${DEMO_FRIENDS.map((f) => f.login).join(", ")} (тот же пароль)`);
    await seedDemoCoach(demoHash, exerciseIds);
    console.log(`Demo coach: ${DEMO_COACH.login} (тот же пароль), клиенты ${DEMO_COACH.clients.join(", ")} (Маше назначен «${COACH_TEMPLATE.name}» пн/ср/пт и оставлены комментарии к свежей тренировке), приглашение /coach/join/${DEMO_COACH.code}`);
    console.log(`Demo clubs: ${await seedDemoClubs()}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
