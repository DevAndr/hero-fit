-- CreateTable
CREATE TABLE "UserVisit" (
    "userId" TEXT NOT NULL,
    "day" DATE NOT NULL,

    CONSTRAINT "UserVisit_pkey" PRIMARY KEY ("userId","day")
);

-- CreateIndex
CREATE INDEX "UserVisit_day_idx" ON "UserVisit"("day");

-- AddForeignKey
ALTER TABLE "UserVisit" ADD CONSTRAINT "UserVisit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
