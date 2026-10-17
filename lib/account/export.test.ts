import { describe, expect, it } from "vitest";
import { SHOP_ITEMS } from "@/lib/shop/catalog";
import { buildExport, EXPORT_SECTIONS, type ExportRaw } from "./export";

const raw = (): ExportRaw => ({
  user: {
    login: "demo",
    email: "demo@x.ru",
    name: "Демо",
    nickname: "Demo_Hero",
    timeZone: "Europe/Moscow",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    privacyAcceptedAt: new Date("2026-01-01T00:00:00Z"),
    xp: 1200,
    currentStreak: 3,
    longestStreak: 5,
    hideWeights: false,
    shareActivity: true,
    notifyRest: true,
    notifyGoal: false,
    passwordHash: "$argon2id$secret-hash",
    telegramId: BigInt(777),
    telegramChatId: BigInt(888),
  },
  workouts: [
    {
      name: "Грудь",
      status: "COMPLETED",
      startedAt: new Date("2026-10-12T10:00:00Z"),
      finishedAt: new Date("2026-10-12T11:00:00Z"),
      durationSec: 3600,
      totalVolume: 1000,
      rpe: 7,
      notes: null,
      wellbeing: null,
      exercises: [{ name: "Жим штанги лёжа", supersetGroup: 1, sets: [{ weight: 60, reps: 8, rir: 2, isWarmup: false, completedAt: new Date("2026-10-12T10:10:00Z") }] }],
    },
  ],
  friends: [{ nickname: "Маша", status: "ACCEPTED", since: new Date("2026-02-01T00:00:00Z"), id: "u_friend", login: "demo.masha" }],
  coach: [{ nickname: "Coach_Demo", since: new Date("2026-03-01T00:00:00Z"), until: null, id: "u_coach" }],
  clients: [],
  exercises: [],
  templates: [],
  plans: [],
  goals: [],
  bodyWeight: [],
  records: [],
  achievements: [],
  xpHistory: [],
  recaps: [],
  boss: [],
  goblins: [],
  raids: [],
  guild: null,
  club: null,
  coachComments: [],
  coachNotesAboutMe: [{ text: "Колено: без глубоких выпадов", updatedAt: new Date("2026-10-14T00:00:00Z"), coach: "Coach_Demo", coachId: "u_coach" }],
  clientNotes: [{ text: "Цель — 100 кг в жиме", updatedAt: new Date("2026-10-15T00:00:00Z"), client: "Петя", clientId: "u_client" }],
  programs: [
    {
      name: "Сила",
      startDate: "2026-10-19",
      weeks: 8,
      stepKind: "PERCENT",
      stepValue: 2.5,
      deloadEvery: 4,
      deloadPct: 10,
      endedAt: null,
      id: "pa_secret",
      bases: [{ template: "Жим", exercise: "Жим штанги лёжа", weight: 100, fromWeek: 1, assignmentId: "pa_secret" }],
    },
  ],
  coachPrograms: [{ name: "Сила", weeks: 8, stepKind: "PERCENT", stepValue: 2.5, deloadEvery: 4, deloadPct: 10, id: "cp_secret", days: [{ weekday: 0, template: "Жим", time: "18:00", id: "d_secret" }] }],
  notifications: [],
  whoop: null,
  shop: {
    coins: 120,
    items: [
      { code: "avatar:__none__", acquiredAt: new Date("2026-10-01T00:00:00Z") },
      { code: "zzz:unknown", acquiredAt: new Date("2026-10-02T00:00:00Z") },
    ],
    coinHistory: [{ amount: 10, reason: "WORKOUT", createdAt: new Date("2026-10-03T00:00:00Z"), key: "secret-key" }],
  },
});

describe("buildExport", () => {
  const out = buildExport(raw(), new Date("2026-10-13T00:00:00Z"));
  const text = JSON.stringify(out);

  it("секретов и чужих id/логинов нет", () => {
    for (const bad of ["passwordHash", "secret-hash", "telegramId", "telegramChatId", "777", "888", "u_friend", "demo.masha", "u_coach", "u_client", "pa_secret", "cp_secret", "d_secret"]) {
      expect(text).not.toContain(bad);
    }
  });
  it("профиль — whitelist + telegramLinked", () => {
    expect(out.profile).toMatchObject({ login: "demo", nickname: "Demo_Hero", telegramLinked: true, notifications: { notifyRest: true, notifyGoal: false } });
  });
  it("друзья и тренер — только ники и даты", () => {
    expect(Object.keys(out.friends[0]).sort()).toEqual(["nickname", "since", "status"]);
    expect(Object.keys(out.coach[0]).sort()).toEqual(["nickname", "since", "until"]);
  });
  it("разделы верхнего уровня — по спеке", () => {
    expect(Object.keys(out)).toEqual(["version", "exportedAt", ...EXPORT_SECTIONS]);
    expect(out.version).toBe(1);
    expect(out.workouts[0].exercises[0].sets[0]).toEqual({ weight: 60, reps: 8, rir: 2, warmup: false, done: true, durationSec: null, distanceM: null });
    expect(out.workouts[0].exercises[0].superset).toBe(1);
  });
  it("раздел shop: баланс, названия из каталога, неизвестный код — код, без ключей событий", () => {
    const known = SHOP_ITEMS[0];
    const r = raw();
    r.shop.items[0].code = known.code;
    const o = buildExport(r, new Date("2026-10-13T00:00:00Z"));
    expect(o.shop.coins).toBe(120);
    expect(o.shop.items[0]).toEqual({ code: known.code, name: known.name, acquiredAt: new Date("2026-10-01T00:00:00Z") });
    expect(o.shop.items[1].name).toBe("zzz:unknown");
    expect(Object.keys(o.shop.coinHistory[0]).sort()).toEqual(["amount", "createdAt", "reason"]);
    expect(JSON.stringify(o)).not.toContain("secret-key");
  });
});

describe("export — cardio sets", () => {
  it("time and distance in JSON", () => {
    const r = raw();
    r.workouts[0].exercises[0].sets[0] = { ...r.workouts[0].exercises[0].sets[0], durationSec: 1720, distanceM: 5200 };
    expect(buildExport(r, new Date("2026-10-13T00:00:00Z")).workouts[0].exercises[0].sets[0]).toMatchObject({ durationSec: 1720, distanceM: 5200 });
  });
});

describe("export — coach notes", () => {
  it("заметки тренера обо мне и мои заметки о клиентах — текст, дата и ник", () => {
    const o = buildExport(raw(), new Date("2026-10-16T00:00:00Z"));
    expect(o.coachNotesAboutMe).toEqual([{ text: "Колено: без глубоких выпадов", updatedAt: new Date("2026-10-14T00:00:00Z"), coach: "Coach_Demo" }]);
    expect(o.clientNotes).toEqual([{ text: "Цель — 100 кг в жиме", updatedAt: new Date("2026-10-15T00:00:00Z"), client: "Петя" }]);
  });
});

describe("export — coach programs", () => {
  it("программы клиента и библиотека тренера — без id", () => {
    const o = buildExport(raw(), new Date("2026-10-16T00:00:00Z"));
    expect(o.programs).toEqual([
      {
        name: "Сила",
        startDate: "2026-10-19",
        weeks: 8,
        rule: { stepKind: "PERCENT", stepValue: 2.5, deloadEvery: 4, deloadPct: 10 },
        ended: false,
        bases: [{ template: "Жим", exercise: "Жим штанги лёжа", weight: 100, fromWeek: 1 }],
      },
    ]);
    expect(o.coachPrograms).toEqual([
      { name: "Сила", weeks: 8, rule: { stepKind: "PERCENT", stepValue: 2.5, deloadEvery: 4, deloadPct: 10 }, days: [{ weekday: 0, template: "Жим", time: "18:00" }] },
    ]);
  });
});

describe("export — whoop", () => {
  it("раздел whoop есть в списке", () => {
    expect(EXPORT_SECTIONS).toContain("whoop");
  });
  it("без токенов на любом уровне", () => {
    const r = raw();
    r.whoop = {
      whoopUserId: "123",
      connectedAt: new Date("2026-10-01T00:00:00Z"),
      consentAt: new Date("2026-10-01T00:00:00Z"),
      workouts: [{ id: "w1", sportName: "weightlifting", avgHr: 120 }],
    };
    const o = buildExport(r, new Date("2026-10-17T00:00:00Z"));
    expect(o.whoop?.workouts).toHaveLength(1);
    expect(o.whoop?.whoopUserId).toBe("123");
    expect(JSON.stringify(o)).not.toMatch(/accessToken|refreshToken/);
  });
  it("не подключён — null", () => {
    expect(buildExport(raw(), new Date()).whoop).toBeNull();
  });
});
