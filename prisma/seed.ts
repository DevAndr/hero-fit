import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import type { MuscleGroup } from "../generated/prisma/enums";

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

async function main() {
  const exerciseIds = await seedExercises();
  await seedPrograms(exerciseIds);
  console.log(`Seeded ${EXERCISES.length} exercises, ${PROGRAMS.length} program templates`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
