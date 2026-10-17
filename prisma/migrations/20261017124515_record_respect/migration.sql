-- AlterEnum
ALTER TYPE "AchievementCategory" ADD VALUE 'SOCIAL';

-- CreateTable
CREATE TABLE "RecordRespect" (
    "id" TEXT NOT NULL,
    "workoutId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecordRespect_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RecordRespect_exerciseId_idx" ON "RecordRespect"("exerciseId");

-- CreateIndex
CREATE UNIQUE INDEX "RecordRespect_workoutId_exerciseId_userId_key" ON "RecordRespect"("workoutId", "exerciseId", "userId");

-- AddForeignKey
ALTER TABLE "RecordRespect" ADD CONSTRAINT "RecordRespect_workoutId_fkey" FOREIGN KEY ("workoutId") REFERENCES "Workout"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordRespect" ADD CONSTRAINT "RecordRespect_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordRespect" ADD CONSTRAINT "RecordRespect_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
