# Бестиарий и титулы — дизайн

Дата: 2026-10-08. Ветка `feat/boss-titles` (от `feat/weekly-boss`).

## Зачем

Победа над боссом недели сейчас оставляет мало следа: XP из сундука, ачивку и ⚔ в лиге на одну неделю. Нужно, чтобы победы копились (коллекция — бестиарий) и были видны друзьям (титул рядом с ником). Титулы также дают статус за вершины ключевых лестниц ачивок.

Критерии успеха:
- у каждого босса видно, сколько раз он побеждён, звёзды и какие титулы он даёт;
- пользователь выбирает один титул из открытых, и друзья видят его в лиге, ленте и списке друзей;
- о новом титуле пользователь узнаёт в момент открытия (сводка тренировки или тост ачивки).

Не входит: платная косметика, рамки ников, серия побед над боссами, титулы в итогах недели.

## Модель данных

Одно новое поле: `User.titleCode String?` — выбранный титул (`null` — без титула). Доступность титулов **вычисляется** из уже существующих данных и нигде не хранится:
- строки `Achievement` пользователя (коды);
- победы — `BossWeek` с `defeatedAt IS NOT NULL`, сгруппированные по `bossCode`.

Ачивки не отзываются, победы не отменяются, поэтому открытый титул не пропадает. Выбранный код при показе проходит через `titleLabel`; неизвестный код (переименование каталога) просто не показывается.

## Каталог титулов (`lib/titles/catalog.ts`, чистые функции)

Тексты без рода.

Титулы боссов — код `boss:<bossCode>:<звёзды>`, звёзды за 1 / 3 / 10 побед (`BOSS_STAR_WINS = [1, 3, 10]`):

| Звёзды | golem | troll | dragon | knight |
|---|---|---|---|---|
| 1 | Гроза Голема | Гроза Тролля | Гроза Дракона | Гроза Рыцаря |
| 2 | Кошмар Голема | Кошмар Тролля | Кошмар Дракона | Кошмар Рыцаря |
| 3 | Железное сердце | Ледяная кровь | Драконья чешуя | Тень среди теней |

`legend` — «Легенда бестиария»: у всех боссов из `BOSSES` хотя бы 1 звезда.

Титулы ачивок — код `ach:<код ачивки>`:

| Ачивка | Титул |
|---|---|
| `streakw:12` | Железная воля |
| `workouts:100` | Ветеран зала |
| `level:25` | Титан |
| `records:50` | Рекордсмен |
| `volume:100` | Тяжеловес |
| `league1:1` | Чемпион лиги |
| `allgroups:<MUSCLE_GROUPS.length>` | Без слабых мест |
| `login:100` | Завсегдатай |

Функции:
- `bossStars(wins: number): 0 | 1 | 2 | 3`;
- `availableTitles({ achievementCodes: Iterable<string>, bossWins: Partial<Record<BossCode, number>> }): Title[]` — `Title = { code, label, source: "boss" | "achievement" }`, порядок: боссы в порядке `BOSSES` по звёздам, затем `legend`, затем ачивки в порядке таблицы;
- `titleLabel(code: string | null): string | null`;
- `titleForAchievement(achievementCode: string): Title | null`;
- `titlesUnlockedByWin(winsBefore: Partial<Record<BossCode, number>>, code: BossCode): Title[]` — титулы, которые открывает одна новая победа над `code` (порог звезды или первая звезда у последнего босса для `legend`);
- `bossTitles(code: BossCode): Title[]` — 3 титула босса (для бестиария).

## Бестиарий

Вкладка на `/achievements`: «Ачивки» | «Бестиарий», выбор — `?tab=bestiary` (по умолчанию ачивки).

Данные — `getBestiary(userId, tz, now)` в `lib/boss/queries.ts`: победы по боссам (число, первая дата `defeatedAt`), лучший урон за неделю по каждому боссу (`damageByWeek` за период от первой `BossWeek` до текущей недели, сопоставленный с `bossCode` недели) → чистая `bestiary(rows, currentWeek)` в `lib/boss/bestiary.ts`:

```ts
type BestiaryEntry = {
  code: BossCode; name: string;
  wins: number; stars: 0 | 1 | 2 | 3;
  firstWin: string | null;   // ISO
  bestDamage: number;        // 0 — не бился
  weeksUntil: number;        // 0 — босс текущей недели
};
```

`weeksUntil` — через сколько недель от `currentWeek` `bossForWeek` вернёт этого босса.

Компонент `components/boss/bestiary.tsx` — карточка на босса (`data-testid="bestiary-<code>"`):
- открыт (`wins > 0`): спрайт, имя, «Побед: N», звёзды ★★☆ (`aria-label="2 звезды из 3"`), «Первая победа: 12 октября 2026», «Лучший урон за неделю: 2 400»;
- не открыт: спрайт затемнён (`brightness-0 opacity-40`), имя «???», при `bestDamage > 0` — «Лучший урон за неделю: …»;
- у всех: «На арене сейчас» (`weeksUntil = 0`) или «Придёт через N недель»;
- список трёх титулов босса — полученные обычным цветом, остальные `text-muted-foreground` с порогом («3 победы»).

Над сеткой — строка «Легенда бестиария»: получена или «звёзды у N из 4 боссов».

В `BossCard` на дашборде — ссылка «Бестиарий» на `/achievements?tab=bestiary`.

## Выбор титула

`/settings`, карточка с ником, блок «Титул» (`id="title"`): `components/social/title-select.tsx` — Select из доступных титулов + «Без титула» и превью «<ник> · <титул>». Если доступных нет — текст «Титулы открываются за победы над боссами и вершины ачивок» со ссылкой на бестиарий.

`setTitleAction(code: string | null)` (`lib/titles/actions.ts`): `requireUser`; `null` снимает; иначе код должен быть в `availableTitles` пользователя, иначе `{ ok: false, error: "Титул ещё не открыт" }`. Затем `revalidatePath("/", "layout")`.

`getAvailableTitles(userId)` (`lib/titles/queries.ts`, server-only): коды ачивок + `groupBy` побед → `availableTitles`.

## Показ титула

Сервер добавляет к людям поле `title: string | null` (уже `titleLabel`):
- лига — `lib/social/queries.ts` → `league-table.tsx`: строкой под ником (`data-testid="member-title"`);
- лента — `lib/social/feed.ts` / запрос ленты → `activity-feed.tsx`: после ника через « · » (в компактном виде — не показывается);
- друзья и входящие заявки, баннер приглашения — `friends-panel.tsx`, `/friends`.

Стиль: `text-xs text-muted-foreground truncate`. Своё «Вы» в ленте — тоже с титулом.

## Уведомление об открытии

- Сводка тренировки: `FinishMeta.boss` получает `titles?: string[]` — названия из `titlesUnlockedByWin(winsBefore, code)` при победе (`winsBefore` — победы по боссам до этой, считаются в той же транзакции `finishWorkout`). `BossDamage` показывает «Открыт титул «Гроза Голема»» и ссылку «Выбрать» → `/settings#title` (`data-testid="boss-title-unlocked"`).
- Тост ачивки (`achievement-toaster.tsx`): если `titleForAchievement(code)` — дополнительная строка «+ титул «…»».
- Отдельного уведомления в колокольчике нет.

## Сид и документация

- `prisma/seed.ts`: demo.masha — `titleCode = "boss:<код её побеждённого босса>:1"` (победа у неё уже есть в сиде).
- CLAUDE.md — абзац про бестиарий и титулы.

## Тесты

Unit (`lib/titles/catalog.test.ts`, `lib/boss/bestiary.test.ts`):
- `bossStars`: 0, 1, 2 → 1, 3 → 2, 9 → 2, 10 → 3;
- `availableTitles`: пусто → []; 3 победы над големом → «Гроза Голема», «Кошмар Голема»; `legend` только при ≥1 победе у всех 4; ачивка `streakw:12` → «Железная воля», `streakw:8` → ничего; порядок;
- `titlesUnlockedByWin`: 0→1, 2→3, 9→10 открывают; 1→2, 3→4 — нет; последняя недостающая первая звезда добавляет `legend`;
- `titleLabel`: известный, неизвестный, `null`;
- `bestiary`: звёзды, `weeksUntil` (0 для текущего, 1…3 для остальных), не открытый босс с `bestDamage > 0`.

e2e (`e2e/titles.spec.ts`):
- вкладка «Бестиарий»: победы из БД (`e2e/db.ts`) → у голема 1 звезда и «Гроза Голема» получен, остальные «???»;
- выбор титула в `/settings` → друг видит его в лиге (`member-title`) и в ленте;
- в списке выбора нет закрытых титулов (отказ `setTitleAction` для закрытого кода опирается на `availableTitles`, покрытый unit-тестами);
- победа над боссом в тренировке → в сводке `boss-title-unlocked`.
