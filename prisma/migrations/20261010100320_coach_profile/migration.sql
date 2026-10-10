-- CreateEnum
CREATE TYPE "CoachFormat" AS ENUM ('ONLINE', 'OFFLINE', 'BOTH');

-- CreateTable
CREATE TABLE "CoachProfile" (
    "userId" TEXT NOT NULL,
    "displayName" TEXT,
    "city" TEXT,
    "format" "CoachFormat" NOT NULL DEFAULT 'BOTH',
    "specialties" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "about" TEXT NOT NULL DEFAULT '',
    "hiddenStats" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoachProfile_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE INDEX "CoachProfile_publishedAt_idx" ON "CoachProfile"("publishedAt");

-- AddForeignKey
ALTER TABLE "CoachProfile" ADD CONSTRAINT "CoachProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
