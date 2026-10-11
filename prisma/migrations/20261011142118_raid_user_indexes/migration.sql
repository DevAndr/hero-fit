-- CreateIndex
CREATE INDEX "RaidHit_userId_idx" ON "RaidHit"("userId");

-- CreateIndex
CREATE INDEX "RaidReward_userId_idx" ON "RaidReward"("userId");

-- CreateIndex
CREATE INDEX "RaidWeek_mvpUserId_idx" ON "RaidWeek"("mvpUserId");
