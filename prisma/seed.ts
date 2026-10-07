import "dotenv/config";
import { hash } from "@node-rs/argon2";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import type { MuscleGroup, RecordType } from "../generated/prisma/enums";
import { levelProgress } from "../lib/progress/level";
import { recomputeStreak } from "../lib/progress/streak-db";
import { STREAK_WEEK_TARGET, weekKey, weeksBetween } from "../lib/progress/weekly-streak";
import { PR_XP, workoutXp } from "../lib/progress/xp";

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

  let xp = 0;
  const workoutIds: string[] = [];
  // meta тренировки — как в lib/workouts/finish.ts: счёт недели и недельная серия на момент тренировки
  const weekCounts = new Map<string, number>();
  let streak = 0;
  let lastWeek: string | null = null;
  const all = [...fillerWorkouts(friend.fillerWeeks ?? 0), ...friend.workouts];
  for (const w of all.sort((a, b) => b.hoursAgo - a.hoursAgo)) {
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
    };
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
    console.log(`Demo friends: ${DEMO_FRIENDS.map((f) => f.login).join(", ")} (тот же пароль)`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
