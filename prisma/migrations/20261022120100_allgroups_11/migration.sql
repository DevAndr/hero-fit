-- «Без слабых мест» (все группы за неделю): групп стало 11 — полученная за 10 и выбранный титул переезжают на новый код
UPDATE "UserAchievement"
SET code = 'allgroups:11', threshold = 11, description = replace(description, 'все 10 групп', 'все 11 групп')
WHERE code = 'allgroups:10';
UPDATE "User" SET "titleCode" = 'ach:allgroups:11' WHERE "titleCode" = 'ach:allgroups:10';
