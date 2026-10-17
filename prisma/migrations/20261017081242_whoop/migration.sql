-- CreateTable
CREATE TABLE "WhoopConnection" (
    "userId" TEXT NOT NULL,
    "whoopUserId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consentAt" TIMESTAMP(3) NOT NULL,
    "needsReauth" BOOLEAN NOT NULL DEFAULT false,
    "lastSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhoopConnection_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "WhoopWorkout" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "start" TIMESTAMP(3) NOT NULL,
    "end" TIMESTAMP(3) NOT NULL,
    "sportName" TEXT NOT NULL,
    "scoreState" TEXT NOT NULL,
    "strain" DOUBLE PRECISION,
    "avgHr" INTEGER,
    "maxHr" INTEGER,
    "kilojoule" DOUBLE PRECISION,
    "zonesMs" INTEGER[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhoopWorkout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WhoopConnection_whoopUserId_key" ON "WhoopConnection"("whoopUserId");

-- CreateIndex
CREATE INDEX "WhoopWorkout_userId_start_idx" ON "WhoopWorkout"("userId", "start");

-- AddForeignKey
ALTER TABLE "WhoopConnection" ADD CONSTRAINT "WhoopConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhoopWorkout" ADD CONSTRAINT "WhoopWorkout_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
