import { describe, expect, it } from "vitest";
import { absoluteUrl, isIndexable, jsonLd, sitemapEntries } from "./seo";

describe("isIndexable", () => {
  it("only production on a public host", () => {
    expect(isIndexable("production", "https://herofit.app")).toBe(true);
    expect(isIndexable("production", "http://localhost:3000")).toBe(false);
    expect(isIndexable("production", "http://127.0.0.1:3100")).toBe(false);
    expect(isIndexable("development", "https://herofit.app")).toBe(false);
  });
});

describe("absoluteUrl", () => {
  it("joins the site origin and a path", () => {
    expect(absoluteUrl("https://herofit.app/", "/tools/1rm")).toBe("https://herofit.app/tools/1rm");
    expect(absoluteUrl("https://herofit.app", "/")).toBe("https://herofit.app/");
  });
});

describe("jsonLd", () => {
  it("escapes < so the payload cannot close the script tag", () => {
    const lt = "\\u003c";
    expect(jsonLd({ name: "</script><b>" })).toBe(`{"name":"${lt}/script>${lt}b>"}`);
  });
});

describe("sitemapEntries", () => {
  const built = new Date("2026-10-10T12:00:00Z");
  const coachUpdated = new Date("2026-10-05T08:00:00Z");
  const entries = sitemapEntries("https://hero-fit.ru", built, [{ nickname: "Coach Demo", updatedAt: coachUpdated }]);

  it("статические страницы — дата сборки, а не время запроса", () => {
    const home = entries.find((e) => e.url === "https://hero-fit.ru/");
    expect(home).toMatchObject({ lastModified: built, priority: 1, changeFrequency: "weekly" });
    expect(entries.filter((e) => e.lastModified === built)).toHaveLength(5);
  });
  it("страница тренера — дата её изменения, ник в адресе закодирован", () => {
    expect(entries.at(-1)).toEqual({
      url: "https://hero-fit.ru/trainer/Coach%20Demo",
      lastModified: coachUpdated,
      changeFrequency: "weekly",
      priority: 0.6,
    });
  });
});
