import { describe, expect, it } from "vitest";
import { signInitData, startTarget, verifyInitData } from "./init-data";

const now = new Date("2026-10-10T12:00:00Z");
const sec = (d: Date) => String(Math.floor(d.getTime() / 1000));
const user = JSON.stringify({ id: 42, first_name: "Маша", username: "masha" });
const fields = (over: Record<string, string> = {}) => ({ auth_date: sec(now), user, start_param: "join_ABCDEFGH", query_id: "q", ...over });

describe("verifyInitData", () => {
  it("валидная подпись", () => {
    const r = verifyInitData(signInitData(fields(), "T"), "T", now);
    expect(r).toMatchObject({ ok: true, user: { id: 42, firstName: "Маша", username: "masha" }, startParam: "join_ABCDEFGH" });
  });
  it("чужой токен и подмена поля — hash", () => {
    expect(verifyInitData(signInitData(fields(), "T"), "X", now)).toEqual({ ok: false, reason: "hash" });
    const forged = signInitData(fields(), "T").replace(encodeURIComponent(user), encodeURIComponent(JSON.stringify({ id: 1, first_name: "Злодей" })));
    expect(verifyInitData(forged, "T", now)).toEqual({ ok: false, reason: "hash" });
  });
  it("старше часа и из будущего — expired; 4 мин вперёд — ок", () => {
    const old = new Date(now.getTime() - 3600_000 - 1000);
    expect(verifyInitData(signInitData(fields({ auth_date: sec(old) }), "T"), "T", now)).toEqual({ ok: false, reason: "expired" });
    const future = new Date(now.getTime() + 6 * 60_000);
    expect(verifyInitData(signInitData(fields({ auth_date: sec(future) }), "T"), "T", now)).toEqual({ ok: false, reason: "expired" });
    const soon = new Date(now.getTime() + 4 * 60_000);
    expect(verifyInitData(signInitData(fields({ auth_date: sec(soon) }), "T"), "T", now).ok).toBe(true);
  });
  it("без hash, без user, user не JSON — malformed", () => {
    expect(verifyInitData(`auth_date=${sec(now)}&user=${encodeURIComponent(user)}`, "T", now)).toEqual({ ok: false, reason: "malformed" });
    const noUser = fields();
    delete (noUser as Partial<typeof noUser>).user;
    expect(verifyInitData(signInitData(noUser, "T"), "T", now)).toEqual({ ok: false, reason: "malformed" });
    expect(verifyInitData(signInitData(fields({ user: "{oops" }), "T"), "T", now)).toEqual({ ok: false, reason: "malformed" });
  });
  it("без start_param — null", () => {
    const rest = fields();
    delete (rest as Partial<typeof rest>).start_param;
    const r = verifyInitData(signInitData(rest, "T"), "T", now);
    expect(r.ok && r.startParam).toBeNull();
  });
});

describe("startTarget", () => {
  it("код тренера", () => {
    expect(startTarget("join_ABCDEFGH")).toBe("/coach/join/ABCDEFGH");
    expect(startTarget("join_abcdefgh")).toBe("/coach/join/ABCDEFGH");
  });
  it("всё остальное — дашборд", () => {
    for (const v of ["join_../x", "join_", "other", "", null]) expect(startTarget(v)).toBe("/dashboard");
  });
});

describe("startTarget — гильдия", () => {
  it("код гильдии", () => {
    expect(startTarget("guild_abcdefgh")).toBe("/guild/join/ABCDEFGH");
  });
  it("пустой или мусорный код — дашборд", () => {
    for (const v of ["guild_", "guild_../x"]) expect(startTarget(v)).toBe("/dashboard");
  });
});
