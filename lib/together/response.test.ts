import { describe, expect, it } from "vitest";
import { buildResponse, type ResponseInput } from "./response";

const t = (hhmm: string) => new Date(`2026-10-26T${hhmm}:00Z`);

const base: ResponseInput = {
  session: { status: "ACTIVE", createdAt: t("10:00"), acceptedAt: t("10:02"), endedAt: null, endReason: null, hostId: "h" },
  viewerId: "h",
  partner: { nickname: "Аня", hideWeights: false },
  workout: {
    status: "IN_PROGRESS",
    startedAt: t("10:01"),
    finishedAt: null,
    exercises: [
      {
        name: "Присед",
        exerciseId: "sq",
        sets: [
          { reps: 5, weight: 100, completedAt: t("10:20") },
          { reps: 5, weight: 100, completedAt: null },
        ],
      },
    ],
  },
  bests: new Map([["sq", 90]]),
  cheers: [t("10:21")],
  since: t("10:19"),
  now: t("10:22"),
};

describe("buildResponse", () => {
  it("срез партнёра, роль, 👊 и событие рекорда после since", () => {
    const r = buildResponse(base);
    expect(r.role).toBe("host");
    expect(r.partnerName).toBe("Аня");
    expect(r.partner?.current).toEqual({ exercise: "Присед", doneSets: 1, totalSets: 2 });
    expect(r.cheers).toEqual([{ at: t("10:21").toISOString() }]);
    expect(r.events).toEqual([{ kind: "record", exercise: "Присед", at: t("10:20").toISOString() }]);
    expect(r.now).toBe(t("10:22").toISOString());
  });

  it("рекорд до since — без повторного события; первый опрос (since = null) — без событий", () => {
    expect(buildResponse({ ...base, since: t("10:20") }).events).toEqual([]);
    expect(buildResponse({ ...base, since: null }).events).toEqual([]);
    expect(buildResponse({ ...base, since: null }).cheers).toEqual([]);
  });

  it("скрытые веса партнёра не попадают в ответ", () => {
    const r = buildResponse({ ...base, partner: { nickname: "Аня", hideWeights: true } });
    expect(JSON.stringify(r)).not.toContain("100");
    expect(r.partner?.hideWeights).toBe(true);
    expect(r.partner?.exercises[0].record).toBe(true);
  });

  it("партнёр отменил тренировку — сессия ENDED, событие left, partner = null", () => {
    const r = buildResponse({
      ...base,
      session: { ...base.session, status: "ENDED", endedAt: t("10:21"), endReason: "cancelled" },
      workout: null,
    });
    expect(r.status).toBe("ENDED");
    expect(r.partner).toBeNull();
    expect(r.events).toEqual([{ kind: "left", at: t("10:21").toISOString() }]);
  });

  it("партнёр закончил — событие finished", () => {
    const r = buildResponse({ ...base, workout: { ...base.workout!, status: "COMPLETED", finishedAt: t("10:21") } });
    expect(r.partner?.finished).toBe(true);
    expect(r.events.map((e) => e.kind)).toContain("finished");
  });

  it("приглашение — срок истечения; истёкшее — EXPIRED", () => {
    const invited = { ...base, session: { ...base.session, status: "INVITED" as const, acceptedAt: null }, workout: null, now: t("10:10") };
    expect(buildResponse(invited).inviteExpiresAt).toBe(t("10:15").toISOString());
    expect(buildResponse({ ...invited, now: t("10:15") }).status).toBe("EXPIRED");
  });
});
