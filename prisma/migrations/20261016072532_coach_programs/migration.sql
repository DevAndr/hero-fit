-- CreateEnum
CREATE TYPE "ProgramStep" AS ENUM ('PERCENT', 'KG');

-- AlterTable
ALTER TABLE "PlanSeries" ADD COLUMN     "programAssignmentId" TEXT;

-- CreateTable
CREATE TABLE "CoachProgram" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "weeks" INTEGER NOT NULL,
    "stepKind" "ProgramStep" NOT NULL,
    "stepValue" DOUBLE PRECISION NOT NULL,
    "deloadEvery" INTEGER,
    "deloadPct" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoachProgram_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoachProgramDay" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "templateId" TEXT NOT NULL,
    "time" TEXT NOT NULL,
    "durationMin" INTEGER NOT NULL DEFAULT 60,

    CONSTRAINT "CoachProgramDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramAssignment" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "coachId" TEXT,
    "programId" TEXT,
    "name" TEXT NOT NULL,
    "startDate" TEXT NOT NULL,
    "weeks" INTEGER NOT NULL,
    "stepKind" "ProgramStep" NOT NULL,
    "stepValue" DOUBLE PRECISION NOT NULL,
    "deloadEvery" INTEGER,
    "deloadPct" DOUBLE PRECISION NOT NULL,
    "endedAt" TIMESTAMP(3),
    "remindedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgramAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramBase" (
    "assignmentId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,
    "fromWeek" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ProgramBase_pkey" PRIMARY KEY ("assignmentId","templateId","exerciseId")
);

-- CreateIndex
CREATE INDEX "CoachProgram_coachId_idx" ON "CoachProgram"("coachId");

-- CreateIndex
CREATE INDEX "CoachProgramDay_templateId_idx" ON "CoachProgramDay"("templateId");

-- CreateIndex
CREATE UNIQUE INDEX "CoachProgramDay_programId_weekday_key" ON "CoachProgramDay"("programId", "weekday");

-- CreateIndex
CREATE INDEX "ProgramAssignment_clientId_endedAt_idx" ON "ProgramAssignment"("clientId", "endedAt");

-- CreateIndex
CREATE INDEX "ProgramAssignment_coachId_endedAt_idx" ON "ProgramAssignment"("coachId", "endedAt");

-- CreateIndex
CREATE INDEX "PlanSeries_programAssignmentId_idx" ON "PlanSeries"("programAssignmentId");

-- AddForeignKey
ALTER TABLE "PlanSeries" ADD CONSTRAINT "PlanSeries_programAssignmentId_fkey" FOREIGN KEY ("programAssignmentId") REFERENCES "ProgramAssignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachProgram" ADD CONSTRAINT "CoachProgram_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachProgramDay" ADD CONSTRAINT "CoachProgramDay_programId_fkey" FOREIGN KEY ("programId") REFERENCES "CoachProgram"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachProgramDay" ADD CONSTRAINT "CoachProgramDay_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "WorkoutTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramAssignment" ADD CONSTRAINT "ProgramAssignment_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramAssignment" ADD CONSTRAINT "ProgramAssignment_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramAssignment" ADD CONSTRAINT "ProgramAssignment_programId_fkey" FOREIGN KEY ("programId") REFERENCES "CoachProgram"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramBase" ADD CONSTRAINT "ProgramBase_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "ProgramAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
