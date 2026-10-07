-- Серии в днях нельзя читать как недели: иначе лестница streakw:N сразу выдаст ачивки, XP и заморозки.
-- Обнуляем всех, кого ещё не пересчитали по истории (recomputeStreak всегда заполняет weekWorkoutsKey);
-- настоящие значения восстанавливает npm run db:migrate-streak.
UPDATE "User" SET "currentStreak" = 0, "longestStreak" = 0 WHERE "weekWorkoutsKey" IS NULL;
UPDATE "User" SET "streakFreezes" = 3 WHERE "streakFreezes" > 3;
