-- CreateTable
CREATE TABLE "CoachNote" (
    "coachId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoachNote_pkey" PRIMARY KEY ("coachId","clientId")
);

-- CreateIndex
CREATE INDEX "CoachNote_clientId_idx" ON "CoachNote"("clientId");

-- AddForeignKey
ALTER TABLE "CoachNote" ADD CONSTRAINT "CoachNote_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachNote" ADD CONSTRAINT "CoachNote_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
