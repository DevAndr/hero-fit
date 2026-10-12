import { describe, expect, it } from "vitest";
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
      exercises: [{ name: "Жим штанги лёжа", sets: [{ weight: 60, reps: 8, rir: 2, isWarmup: false, completedAt: new Date("2026-10-12T10:10:00Z") }] }],
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
  raids: [],
  guild: null,
  club: null,
  coachComments: [],
  notifications: [],
});

describe("buildExport", () => {
  const out = buildExport(raw(), new Date("2026-10-13T00:00:00Z"));
  const text = JSON.stringify(out);

  it("секретов и чужих id/логинов нет", () => {
    for (const bad of ["passwordHash", "secret-hash", "telegramId", "telegramChatId", "777", "888", "u_friend", "demo.masha", "u_coach"]) {
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
    expect(out.workouts[0].exercises[0].sets[0]).toEqual({ weight: 60, reps: 8, rir: 2, warmup: false, done: true });
  });
});
