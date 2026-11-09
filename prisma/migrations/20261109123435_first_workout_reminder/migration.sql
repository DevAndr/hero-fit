-- AlterEnum
ALTER TYPE "CampaignCondition" ADD VALUE 'DRAFT_WAITING';

-- AlterTable
ALTER TABLE "CampaignSend" ADD COLUMN     "trainedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "PlanEntry" ADD COLUMN     "emailReminder" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Workout" ADD COLUMN     "scheduleAskedAt" TIMESTAMP(3);

-- Backfill: первая завершённая тренировка в течение 72 часов после рассылки
UPDATE "CampaignSend" s SET "trainedAt" = (
  SELECT min(w."finishedAt") FROM "Workout" w
  WHERE w."userId" = s."userId" AND w.status = 'COMPLETED'
    AND w."finishedAt" >= s."sentAt" AND w."finishedAt" <= s."sentAt" + interval '72 hours'
);
