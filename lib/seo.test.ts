import { describe, expect, it } from "vitest";
import { absoluteUrl, isIndexable, jsonLd } from "./seo";

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
