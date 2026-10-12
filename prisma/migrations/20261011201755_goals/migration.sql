-- CreateEnum
CREATE TYPE "GoalType" AS ENUM ('STRENGTH', 'WORKOUTS', 'STREAK', 'HOURS', 'BODY_WEIGHT');

-- CreateEnum
CREATE TYPE "GoalStatus" AS ENUM ('ACTIVE', 'ACHIEVED', 'FAILED');

-- AlterEnum
ALTER TYPE "AchievementCategory" ADD VALUE 'GOAL';

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'GOAL';

-- AlterEnum
ALTER TYPE "XpReason" ADD VALUE 'GOAL_REWARD';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "notifyGoal" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "Goal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "GoalType" NOT NULL,
    "exerciseId" TEXT,
    "metric" "RecordType",
    "target" DOUBLE PRECISION NOT NULL,
    "startValue" DOUBLE PRECISION NOT NULL,
    "deadline" TEXT,
    "status" "GoalStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "achievedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "chestOpenedAt" TIMESTAMP(3),
    "reminderAt" TIMESTAMP(3),

    CONSTRAINT "Goal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BodyWeightEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BodyWeightEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Goal_userId_status_idx" ON "Goal"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "BodyWeightEntry_userId_date_key" ON "BodyWeightEntry"("userId", "date");

-- AddForeignKey
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BodyWeightEntry" ADD CONSTRAINT "BodyWeightEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Перенос уже указанного веса тела в журнал (день миграции в поясе пользователя; неизвестный Postgres пояс — UTC)
INSERT INTO "BodyWeightEntry" ("id", "userId", "date", "weight", "createdAt")
SELECT 'bw_' || u."id", u."id",
       to_char((now() AT TIME ZONE COALESCE(tz."name", 'UTC'))::date, 'YYYY-MM-DD'), u."bodyWeight", now()
FROM "User" u
LEFT JOIN pg_timezone_names tz ON tz."name" = u."timeZone"
WHERE u."bodyWeight" IS NOT NULL;
