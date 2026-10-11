-- CreateTable
CREATE TABLE "CoachGroup" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoachGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoachGroupMember" (
    "groupId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoachGroupMember_pkey" PRIMARY KEY ("groupId","clientId")
);

-- CreateIndex
CREATE UNIQUE INDEX "CoachGroup_coachId_nameKey_key" ON "CoachGroup"("coachId", "nameKey");

-- CreateIndex
CREATE INDEX "CoachGroupMember_clientId_idx" ON "CoachGroupMember"("clientId");

-- AddForeignKey
ALTER TABLE "CoachGroup" ADD CONSTRAINT "CoachGroup_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachGroupMember" ADD CONSTRAINT "CoachGroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "CoachGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachGroupMember" ADD CONSTRAINT "CoachGroupMember_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
