import { describe, expect, it } from "vitest";
import type { RecapData } from "@/lib/recap/types";
import { DELETED_PLAYER, deletionPreview, scrubRecapLeague } from "./rules";

describe("deletionPreview", () => {
  it("гильдия: с наследником — перейдёт, без — будет удалена", () => {
    expect(deletionPreview({ guild: { name: "Сталь", heir: "Маша" }, clubs: [] })).toEqual(["Гильдия «Сталь» перейдёт к Маша"]);
    expect(deletionPreview({ guild: { name: "Сталь", heir: null }, clubs: [] })).toEqual(["Гильдия «Сталь» будет удалена — в ней никого"]);
  });
  it("клубы: одобренный и скрытый передаются, заявки удаляются", () => {
    expect(
      deletionPreview({
        guild: null,
        clubs: [
          { name: "Железо", status: "APPROVED", heir: "Борис" },
          { name: "Тень", status: "HIDDEN", heir: null },
          { name: "Новый", status: "PENDING", heir: "Катя" },
          { name: "Отказ", status: "REJECTED", heir: null },
        ],
      }),
    ).toEqual([
      "Клуб «Железо» перейдёт к Борис",
      "Клуб «Тень» будет удалён — в нём никого",
      "Заявка на клуб «Новый» будет удалена",
      "Заявка на клуб «Отказ» будет удалена",
    ]);
  });
  it("ничего — пусто", () => {
    expect(deletionPreview({ guild: null, clubs: [] })).toEqual([]);
  });
});

describe("scrubRecapLeague", () => {
  const recap = (league: RecapData["league"]) => ({ version: 1, week: "2026-10-05", league }) as unknown as RecapData;
  it("строка с ником (без учёта регистра) — «Удалённый игрок», остальные как были", () => {
    const data = recap({
      place: 1,
      of: 2,
      xp: 100,
      rows: [
        { nickname: "Demo_Hero", xp: 100, place: 1, me: false },
        { nickname: "Маша", xp: 50, place: 2, me: true },
      ],
    });
    const r = scrubRecapLeague(data, "demo_hero");
    expect(r.changed).toBe(true);
    const rows = (r.data.league as { rows: { nickname: string }[] }).rows;
    expect(rows.map((x) => x.nickname)).toEqual([DELETED_PLAYER, "Маша"]);
    expect(DELETED_PLAYER).toBe("Удалённый игрок");
  });
  it("процентиль, без лиги, без совпадений — тот же объект", () => {
    for (const data of [recap({ percentile: 10, xp: 5 }), recap(undefined), recap({ place: 1, of: 1, xp: 1, rows: [{ nickname: "Маша", xp: 1, place: 1, me: true }] })]) {
      const r = scrubRecapLeague(data, "demo_hero");
      expect(r.changed).toBe(false);
      expect(r.data).toBe(data);
    }
  });
});
