import { describe, expect, it } from "vitest";
import { canPublish, cityPath, clubPageAccess, clubPath, slugCandidates, slugify, visibleClubStats } from "./public";

describe("slugify", () => {
  it("транслит кириллицы", () => {
    expect(slugify("Железный Зал")).toBe("zheleznyy-zal");
    expect(slugify("Ёлки-Палки  Gym!")).toBe("elki-palki-gym");
    expect(slugify("Подъезд Объём Щука Хаус Цех")).toBe("podezd-obem-shchuka-khaus-tsekh");
  });
  it("разное написание города — один адрес", () => {
    expect(slugify("Санкт-Петербург")).toBe(slugify("санкт  петербург"));
  });
  it("знаки и пустой результат", () => {
    expect(slugify("🔥№1")).toBe("1");
    expect(slugify("🔥")).toBe("club");
    expect(slugify("🔥", "city")).toBe("city");
  });
  it("до 60 символов без дефиса на конце", () => {
    expect(slugify("а".repeat(80)).length).toBe(60);
    expect(slugify("а".repeat(59) + " б")).not.toMatch(/-$/);
  });
});

describe("slugCandidates", () => {
  it("название, с улицей, затем номера", () => {
    const c = slugCandidates("Iron Gym", "ул. Пушкина, д. 5");
    expect(c.slice(0, 3)).toEqual(["iron-gym", "iron-gym-pushkina", "iron-gym-2"]);
    expect(c.at(-1)).toBe("iron-gym-20");
    expect(slugCandidates("Iron Gym", "Пушкина 5")[1]).toBe("iron-gym-pushkina-5");
  });
  it("без дублей при пустой улице", () => {
    const c = slugCandidates("🔥", "");
    expect(new Set(c).size).toBe(c.length);
    expect(c[0]).toBe("club");
    expect(c[1]).toBe("club-2");
  });
});

describe("canPublish", () => {
  const about = "x".repeat(60);
  it("статус клуба", () => {
    expect(canPublish({ status: "PENDING", about })).toBe("Клуб ещё на проверке");
    expect(canPublish({ status: "HIDDEN", about })).toBe("Клуб скрыт модератором");
    expect(canPublish({ status: "REJECTED", about })).toBe("Заявка отклонена");
  });
  it("«О зале» от 50 символов без пробелов по краям", () => {
    expect(canPublish({ status: "APPROVED", about: "  " + "x".repeat(49) + "  " })).toBe("Напишите о зале хотя бы 50 символов");
    expect(canPublish({ status: "APPROVED", about: "x".repeat(50) })).toBeNull();
  });
});

describe("visibleClubStats", () => {
  it("меньше 3 участников — только их число", () => {
    expect(visibleClubStats({ members: 2, week: 5, month: 9, monthSec: 36000 }).map((s) => s.code)).toEqual(["members"]);
  });
  it("от 3 — все цифры, часы округляются", () => {
    const s = visibleClubStats({ members: 3, week: 5, month: 9, monthSec: 5400 });
    expect(s.map((x) => [x.code, x.value])).toEqual([
      ["members", "3"],
      ["week", "5"],
      ["month", "9"],
      ["hours", "2"],
    ]);
    expect(s[0].label).toBe("участника");
  });
});

describe("clubPageAccess", () => {
  const base = { status: "APPROVED" as const, publishedAt: new Date(), slug: "a", flagFull: true, canManage: false };
  it("открыта всем только при публикации и 100 % флага", () => {
    expect(clubPageAccess(base)).toBe("open");
    expect(clubPageAccess({ ...base, flagFull: false })).toBe("none");
    expect(clubPageAccess({ ...base, publishedAt: null })).toBe("none");
  });
  it("предпросмотр — тем, кто управляет, если публиковалась", () => {
    expect(clubPageAccess({ ...base, flagFull: false, canManage: true })).toBe("preview");
    expect(clubPageAccess({ ...base, publishedAt: null, canManage: true })).toBe("preview");
    expect(clubPageAccess({ ...base, slug: null, publishedAt: null, canManage: true })).toBe("none");
  });
  it("скрытый и отклонённый — никому", () => {
    expect(clubPageAccess({ ...base, status: "HIDDEN", canManage: true })).toBe("none");
    expect(clubPageAccess({ ...base, status: "REJECTED", canManage: true })).toBe("none");
  });
});

describe("пути", () => {
  it("клуб и город", () => {
    expect(clubPath("kazan", "iron-gym")).toBe("/gym/kazan/iron-gym");
    expect(cityPath("kazan")).toBe("/gym/kazan");
  });
});
