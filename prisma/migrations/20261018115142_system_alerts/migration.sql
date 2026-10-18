-- CreateEnum
CREATE TYPE "SystemAlertKind" AS ENUM ('BANNER', 'POPUP');

-- CreateEnum
CREATE TYPE "SystemAlertTone" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- CreateEnum
CREATE TYPE "SystemAlertDismiss" AS ENUM ('NEVER', 'SESSION', 'FOREVER');

-- CreateTable
CREATE TABLE "SystemAlert" (
    "id" TEXT NOT NULL,
    "kind" "SystemAlertKind" NOT NULL,
    "tone" "SystemAlertTone" NOT NULL DEFAULT 'INFO',
    "title" TEXT,
    "body" TEXT NOT NULL,
    "ctaLabel" TEXT,
    "ctaHref" TEXT,
    "dismiss" "SystemAlertDismiss" NOT NULL DEFAULT 'FOREVER',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,

    CONSTRAINT "SystemAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemAlertDismissal" (
    "alertId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SystemAlertDismissal_pkey" PRIMARY KEY ("alertId","userId")
);

-- CreateIndex
CREATE INDEX "SystemAlert_enabled_startsAt_idx" ON "SystemAlert"("enabled", "startsAt");

-- CreateIndex
CREATE INDEX "SystemAlertDismissal_userId_idx" ON "SystemAlertDismissal"("userId");

-- AddForeignKey
ALTER TABLE "SystemAlertDismissal" ADD CONSTRAINT "SystemAlertDismissal_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "SystemAlert"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemAlertDismissal" ADD CONSTRAINT "SystemAlertDismissal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
