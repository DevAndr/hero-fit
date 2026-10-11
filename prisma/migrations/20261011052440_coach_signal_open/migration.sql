-- Один открытый сигнал на тренер + клиент + тип (Prisma частичные индексы не видит — не удалять при migrate dev)
CREATE UNIQUE INDEX "CoachSignal_open" ON "CoachSignal" ("coachId", "clientId", kind) WHERE "resolvedAt" IS NULL;
