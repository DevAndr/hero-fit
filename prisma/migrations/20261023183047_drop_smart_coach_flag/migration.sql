-- Флаг smart_coach удалён из кода (раскатан на 100 %): строка состояния больше не нужна
DELETE FROM "FeatureFlag" WHERE key = 'smart_coach';
