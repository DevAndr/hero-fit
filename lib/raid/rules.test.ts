import { describe, expect, it } from "vitest";
import { bossForWeek } from "@/lib/boss/bosses";
import { addWeeks } from "@/lib/progress/weekly-streak";
import {
  chestOpenable,
  hitCounts,
  memberShare,
  pickMvp,
  raidBossForWeek,
  raidBossName,
  raidHp,
  raidReminderDue,
  raidReminderText,
  raidRewardXp,
  raidReminderDay,
  raidWindow,
} from "./rules";

const DAY = 24 * 3_600_000;

describe("memberShare", () => {
  it("idle or new member — base share", () => expect(memberShare([0, 0, 0, 0])).toBe(1000));
  it("averages only weeks with damage", () => expect(memberShare([2000, 0, 1000, 0])).toBe(1500));
  it("single week", () => expect(memberShare([3000])).toBe(3000));
  it("no history at all", () => expect(memberShare([])).toBe(1000));
});

describe("raidHp", () => {
  it("not below the minimum", () => expect(raidHp([1000])).toBe(1500));
  it("sum × 1.2", () => expect(raidHp([1500, 2000])).toBe(4200));
  it("rounded to hundreds", () => expect(raidHp([1234, 1000])).toBe(2700));
});

describe("raidBossForWeek", () => {
  it("never the same as the personal boss over a full cycle", () => {
    for (let i = 0; i < 12; i++) {
      const w = addWeeks("2026-10-05", i);
      expect(raidBossForWeek(w)).not.toBe(bossForWeek(w));
    }
  });
  it("is the personal rotation shifted by 6 weeks", () => {
    expect(raidBossForWeek("2026-10-05")).toBe(bossForWeek(addWeeks("2026-10-05", 6)));
  });
  it("name", () => expect(raidBossName("golem")).toBe("Древний Железный Голем"));
});

describe("raidRewardXp", () => {
  it("equal share", () => expect(raidRewardXp(4000, 2, false)).toBe(100));
  it("MVP × 1.5", () => expect(raidRewardXp(4000, 2, true)).toBe(150));
  it("cap", () => expect(raidRewardXp(20000, 1, false)).toBe(400));
  it("MVP on top of the cap", () => expect(raidRewardXp(20000, 1, true)).toBe(600));
});

describe("hitCounts", () => {
  const startsAt = new Date("2026-10-04T21:00:00Z");
  const endsAt = new Date(startsAt.getTime() + 7 * DAY);
  const joinedAt = new Date("2026-10-01T00:00:00Z");
  it("before joining — no", () =>
    expect(hitCounts({ finishedAt: new Date("2026-10-06T10:00:00Z"), joinedAt: new Date("2026-10-06T11:00:00Z"), startsAt, endsAt })).toBe(false));
  it("end of the window is exclusive", () => expect(hitCounts({ finishedAt: endsAt, joinedAt, startsAt, endsAt })).toBe(false));
  it("start of the window is inclusive", () => expect(hitCounts({ finishedAt: startsAt, joinedAt, startsAt, endsAt })).toBe(true));
});

describe("pickMvp", () => {
  const t = (s: number) => new Date(Date.UTC(2026, 9, 6, 10, 0, s));
  it("no hits", () => expect(pickMvp([])).toBeNull());
  it("sums hits per player", () =>
    expect(
      pickMvp([
        { userId: "a", damage: 300, createdAt: t(1) },
        { userId: "b", damage: 400, createdAt: t(2) },
        { userId: "a", damage: 200, createdAt: t(3) },
      ]),
    ).toBe("a"));
  it("tie — earlier first hit", () =>
    expect(
      pickMvp([
        { userId: "b", damage: 200, createdAt: t(2) },
        { userId: "a", damage: 200, createdAt: t(1) },
      ]),
    ).toBe("a"));
});

describe("chestOpenable", () => {
  const d = new Date("2026-10-06T10:00:00Z");
  it("within 4 weeks", () => expect(chestOpenable(d, new Date(d.getTime() + 27 * DAY))).toBe(true));
  it("after 4 weeks", () => expect(chestOpenable(d, new Date(d.getTime() + 28 * DAY))).toBe(false));
});

describe("raidReminderDue", () => {
  const base = { tz: "Europe/Moscow", startsAt: new Date("2026-10-04T21:00:00Z"), defeated: false, notified: false };
  it("before Thursday noon", () => expect(raidReminderDue({ ...base, now: new Date("2026-10-08T08:59:00Z") })).toBe(false));
  it("Thursday noon", () => expect(raidReminderDue({ ...base, now: new Date("2026-10-08T09:00:00Z") })).toBe(true));
  it("only on Thursday — not on Friday (the text says 4 days left)", () =>
    expect(raidReminderDue({ ...base, now: new Date("2026-10-09T10:00:00Z") })).toBe(false));
  it("defeated", () => expect(raidReminderDue({ ...base, defeated: true, now: new Date("2026-10-08T10:00:00Z") })).toBe(false));
  it("already sent", () => expect(raidReminderDue({ ...base, notified: true, now: new Date("2026-10-08T10:00:00Z") })).toBe(false));
});

it("raidReminderText", () => {
  expect(raidReminderText(1200).body).toBe("Гильдии не хватает 1200 урона — до конца рейда 4 дня");
});

describe("raidWindow", () => {
  const msk = "Europe/Moscow";
  it("first raid — local week of now", () => {
    const w = raidWindow({ now: new Date("2026-10-07T10:00:00Z"), tz: msk, last: null });
    expect(w).toEqual({ week: "2026-10-05", startsAt: new Date("2026-10-04T21:00:00Z"), endsAt: new Date("2026-10-11T21:00:00Z") });
  });
  it("leader moved east: the new raid starts when the previous one ends (no overlap)", () => {
    // Прошлый рейд по −10 кончается пн 10:00Z; глава теперь в +3 — его понедельник начался в вс 21:00Z
    const last = { week: "2026-10-05", endsAt: new Date("2026-10-12T10:00:00Z") };
    const w = raidWindow({ now: new Date("2026-10-12T11:00:00Z"), tz: msk, last });
    expect(w).toEqual({ week: "2026-10-12", startsAt: last.endsAt, endsAt: new Date("2026-10-18T21:00:00Z") });
  });
  it("leader moved west: the same local week — the previous raid is extended to the new local Monday", () => {
    // Прошлый рейд по +12 кончился вс 12:00Z; глава теперь в −10 — у него ещё воскресенье
    const last = { week: "2026-10-05", endsAt: new Date("2026-10-11T12:00:00Z") };
    const w = raidWindow({ now: new Date("2026-10-11T13:00:00Z"), tz: "Etc/GMT+10", last });
    expect(w).toEqual({ extendTo: new Date("2026-10-12T10:00:00Z") });
  });
});

describe("raidReminderDay", () => {
  // Четверг 12:00 в поясах −12…+14 — это UTC от ср 22:00 до пт 00:00
  it("Wednesday–Friday UTC — maybe", () => {
    expect(raidReminderDay(new Date("2026-10-07T22:00:00Z"))).toBe(true);
    expect(raidReminderDay(new Date("2026-10-08T12:00:00Z"))).toBe(true);
    expect(raidReminderDay(new Date("2026-10-09T00:30:00Z"))).toBe(true);
  });
  it("other days — no work", () => {
    expect(raidReminderDay(new Date("2026-10-05T12:00:00Z"))).toBe(false);
    expect(raidReminderDay(new Date("2026-10-11T12:00:00Z"))).toBe(false);
  });
});
