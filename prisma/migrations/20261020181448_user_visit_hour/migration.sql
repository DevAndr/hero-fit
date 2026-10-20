-- AlterTable
ALTER TABLE "User" ADD COLUMN     "lastVisitHour" TEXT;

-- CreateTable
CREATE TABLE "UserVisitHour" (
    "userId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "hour" INTEGER NOT NULL,

    CONSTRAINT "UserVisitHour_pkey" PRIMARY KEY ("userId","day","hour")
);

-- CreateIndex
CREATE INDEX "UserVisitHour_day_idx" ON "UserVisitHour"("day");

-- AddForeignKey
ALTER TABLE "UserVisitHour" ADD CONSTRAINT "UserVisitHour_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
