import { describe, expect, it } from "vitest";
import { achievementIconKey } from "@/lib/achievements/icons";

describe("achievementIconKey", () => {
  it("maps achievement families to their badges", () => {
    expect(achievementIconKey("lift:bench:100")).toBe("100_weigth_push");
    expect(achievementIconKey("lift:squat:100")).toBe("100_weigth_push");
    expect(achievementIconKey("lift:bench:80")).toBe("push_100_kg");
    expect(achievementIconKey("lift:deadlift:140")).toBe("push_100_kg");
    expect(achievementIconKey("login:7")).toBe("visit");
    expect(achievementIconKey("login:30")).toBe("visit");
    expect(achievementIconKey("weightkg:abc:15")).toBe("add_5_kg");
    expect(achievementIconKey("sets:abc")).toBe("many_set");
    expect(achievementIconKey("template:1")).toBe("first_template");
    expect(achievementIconKey("records:1")).toBe("progress_in_training");
    expect(achievementIconKey("records:25")).toBe("progress_in_training");
    expect(achievementIconKey("workouts:1")).toBe("first_training");
    expect(achievementIconKey("weekgoal:3")).toBe("3x_training");
    expect(achievementIconKey("league1:1")).toBe("number_one_in_league");
    expect(achievementIconKey("league1:10")).toBe("number_one_in_league");
    expect(achievementIconKey("league2:1")).toBe("number_two_in_league");
    expect(achievementIconKey("league3:1")).toBe("number_three_in_league");
  });

  it("first streak step is «В ударе», longer streaks — «Стабильность»", () => {
    expect(achievementIconKey("streakw:2")).toBe("in_streak");
    expect(achievementIconKey("streakw:4")).toBe("stable_in_streak");
    expect(achievementIconKey("streakw:104")).toBe("stable_in_streak");
  });

  it("coach badges and goals", () => {
    expect(achievementIconKey("coachcomments:1")).toBe("first_comment");
    expect(achievementIconKey("coachcomments:200")).toBe("first_comment");
    expect(achievementIconKey("coachpage:1")).toBe("publish_profile");
    expect(achievementIconKey("coachgoals:5")).toBe("goal");
    expect(achievementIconKey("goal:1")).toBe("goal");
  });

  it("falls back to default", () => {
    expect(achievementIconKey("workouts:5")).toBe("default");
    expect(achievementIconKey("streak:7")).toBe("default"); // прежний дневной streak
    expect(achievementIconKey("unknown")).toBe("default");
  });
});
