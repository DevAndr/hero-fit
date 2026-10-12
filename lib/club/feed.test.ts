import { describe, expect, it } from "vitest";
import { collectEvents, toClubEvents, type ClubFeedRow } from "./feed";

const row = (o: Partial<ClubFeedRow> = {}): ClubFeedRow => ({
  id: "w1",
  userId: "u1",
  nickname: "Маша",
  titleCode: null,
  hideWeights: false,
  finishedAt: new Date("2026-10-12T10:00:00Z"),
  meta: null,
  ...o,
});

const weightRecord = { records: [{ exerciseName: "Жим", type: "MAX_WEIGHT" as const, value: 80 }] };

describe("toClubEvents", () => {
  it("только события: ачивки без login:*, уровень; весовые рекорды скрыты при hideWeights", () => {
    const e = toClubEvents(
      row({
        hideWeights: true,
        meta: {
          achievements: [
            { code: "login:7", title: "Вход" },
            { code: "workouts:5", title: "5 тренировок" },
          ],
          levelBefore: 2,
          levelAfter: 3,
          records: [
            { exerciseName: "Жим", type: "MAX_WEIGHT", value: 80 },
            { exerciseName: "Жим", type: "MAX_REPS", value: 12 },
          ],
        },
      }),
      "viewer",
    )!;
    expect(e.achievements).toEqual(["5 тренировок"]);
    expect(e.levelUp).toBe(3);
    expect(e.records.map((r) => r.value)).toEqual([null, 12]);
    expect(e.nickname).toBe("Маша");
    expect(e.me).toBe(false);
  });

  it("не отдаёт данные тренировки", () => {
    const e = toClubEvents(row({ meta: { levelBefore: 1, levelAfter: 2 } }), "v")!;
    for (const key of ["id", "name", "volume", "exercises", "durationSec", "kudos", "userId"]) expect(e).not.toHaveProperty(key);
    expect(e.key).not.toContain("w1");
  });

  it("при hideWeights силовые ачивки с весами не показываются чужим", () => {
    const meta = {
      achievements: [
        { code: "lift:bench:100", title: "Клуб сотки: жим лёжа" },
        { code: "weightkg:ex1:10", title: "Жим: +10 кг" },
        { code: "bwratio:bench:125", title: "Жим лёжа: ×1,25 веса тела" },
        { code: "workouts:5", title: "5 тренировок" },
      ],
    };
    expect(toClubEvents(row({ hideWeights: true, meta }), "v")!.achievements).toEqual(["5 тренировок"]);
    expect(toClubEvents(row({ hideWeights: false, meta }), "v")!.achievements).toHaveLength(4);
    expect(toClubEvents(row({ userId: "v", hideWeights: true, meta }), "v")!.achievements).toHaveLength(4);
  });

  it("свои веса не скрываются", () => {
    expect(toClubEvents(row({ userId: "viewer", hideWeights: true, meta: weightRecord }), "viewer")!.records[0].value).toBe(80);
  });

  it("без событий — null", () => {
    expect(toClubEvents(row({ meta: { achievements: [{ code: "login:3", title: "x" }] } }), "v")).toBeNull();
    expect(toClubEvents(row({ meta: null }), "v")).toBeNull();
  });

  it("цели: без веса тела, при скрытых весах — feedTitle", () => {
    const e = toClubEvents(
      row({
        hideWeights: true,
        meta: {
          goals: {
            achieved: [
              { id: "g1", type: "STRENGTH", title: "Жим 100 кг", feedTitle: "Цель по жиму" },
              { id: "g2", type: "BODY_WEIGHT", title: "Вес 80 кг" },
            ],
            advanced: [],
          },
        } as ClubFeedRow["meta"],
      }),
      "v",
    )!;
    expect(e.goals).toEqual(["Цель по жиму"]);
  });
});

describe("collectEvents", () => {
  const empty = row({ meta: null });
  const withAch = row({ meta: { achievements: [{ code: "workouts:1", title: "Первая тренировка" }] } });

  it("пустые страницы не обрывают подгрузку; не больше 3 запросов", async () => {
    const pages = [
      { rows: [empty, empty], next: "c1" },
      { rows: [withAch], next: "c2" },
      { rows: [empty], next: "c3" },
      { rows: [withAch], next: null },
    ];
    const seen: (string | null)[] = [];
    const r = await collectEvents(
      async (c) => {
        seen.push(c);
        return pages.shift()!;
      },
      "v",
      null,
      20,
    );
    expect(seen).toEqual([null, "c1", "c2"]);
    expect(r.events).toHaveLength(1);
    expect(r.next).toBe("c3");
  });

  it("набрал страницу — останавливается", async () => {
    const r = await collectEvents(async () => ({ rows: [withAch, withAch], next: "c1" }), "v", null, 2);
    expect(r.events).toHaveLength(2);
    expect(r.next).toBe("c1");
  });
});
