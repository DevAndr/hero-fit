-- CreateTable
CREATE TABLE "CoachComment" (
    "id" TEXT NOT NULL,
    "coachId" TEXT,
    "clientId" TEXT NOT NULL,
    "workoutId" TEXT NOT NULL,
    "workoutExerciseId" TEXT,
    "text" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoachComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CoachComment_workoutExerciseId_key" ON "CoachComment"("workoutExerciseId");

-- CreateIndex
CREATE INDEX "CoachComment_workoutId_idx" ON "CoachComment"("workoutId");

-- CreateIndex
CREATE INDEX "CoachComment_clientId_readAt_idx" ON "CoachComment"("clientId", "readAt");

-- AddForeignKey
ALTER TABLE "CoachComment" ADD CONSTRAINT "CoachComment_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachComment" ADD CONSTRAINT "CoachComment_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachComment" ADD CONSTRAINT "CoachComment_workoutId_fkey" FOREIGN KEY ("workoutId") REFERENCES "Workout"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachComment" ADD CONSTRAINT "CoachComment_workoutExerciseId_fkey" FOREIGN KEY ("workoutExerciseId") REFERENCES "WorkoutExercise"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Один общий комментарий на тренировку (Prisma частичные индексы не видит — не удалять при migrate dev)
CREATE UNIQUE INDEX "CoachComment_workout_general" ON "CoachComment"("workoutId") WHERE "workoutExerciseId" IS NULL;
