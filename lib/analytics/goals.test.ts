import { describe, expect, it } from "vitest";
import { addGoal, metrikaId, parseGoals, metrikaOff } from "./goals";

describe("metrikaId", () => {
  it("только в production и только числовой номер", () => {
    expect(metrikaId("production", "98765432")).toBe(98765432);
    expect(metrikaId("production", " 98765432 ")).toBe(98765432);
    expect(metrikaId("development", "98765432")).toBeNull();
    expect(metrikaId("test", "98765432")).toBeNull();
    expect(metrikaId("production", undefined)).toBeNull();
    expect(metrikaId("production", "")).toBeNull();
    expect(metrikaId("production", "abc")).toBeNull();
    expect(metrikaId("production", "123abc")).toBeNull();
  });
});

describe("очередь целей в cookie", () => {
  it("добавляет цель без повторов", () => {
    expect(addGoal(undefined, "signup")).toBe("signup");
    expect(addGoal("signup", "workout_finish")).toBe("signup.workout_finish");
    expect(addGoal("signup.workout_finish", "signup")).toBe("signup.workout_finish");
  });

  it("читает только известные цели", () => {
    expect(parseGoals(undefined)).toEqual([]);
    expect(parseGoals("")).toEqual([]);
    expect(parseGoals("signup.first_workout")).toEqual(["signup", "first_workout"]);
    expect(parseGoals("signup.evil<script>.signup")).toEqual(["signup"]);
    expect(parseGoals("onboarding_done.onboarding_skip")).toEqual(["onboarding_done", "onboarding_skip"]);
    expect(parseGoals("share_story")).toEqual(["share_story"]);
    expect(parseGoals("coach_enabled.coach_client_joined")).toEqual(["coach_enabled", "coach_client_joined"]);
  });

  it("не тащит мусор из старого значения при добавлении", () => {
    expect(addGoal("junk.signup", "workout_start")).toBe("signup.workout_start");
  });
});

describe("metrikaOff", () => {
  it("на /tg Метрики нет — в адресе подписанный initData", () => {
    expect(metrikaOff("/tg")).toBe(true);
    expect(metrikaOff("/dashboard")).toBe(false);
    expect(metrikaOff("/")).toBe(false);
  });
});
