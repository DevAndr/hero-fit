-- Streak стал недельным: окно 24 ч и напоминание «на окно» больше не нужны
ALTER TABLE "User" DROP COLUMN "lastStreakAt",
DROP COLUMN "streakReminderFor";
