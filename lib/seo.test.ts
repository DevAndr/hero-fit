import { describe, expect, it } from "vitest";
import { BUILTIN_PROGRAMS } from "./programs/builtin";
import { absoluteUrl, cityJsonLd, clubJsonLd, isIndexable, jsonLd, programJsonLd, robotsRules, shortDescription, sitemapEntries } from "./seo";

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
    expect(entries.filter((e) => e.lastModified === built)).toHaveLength(13);
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

describe("sitemapEntries: программы", () => {
  const urls = sitemapEntries("https://hero-fit.ru", new Date("2026-10-10T12:00:00Z"), []).map((e) => e.url);
  it("общая страница и все пять программ", () => {
    expect(urls).toContain("https://hero-fit.ru/training-programs");
    for (const slug of ["push-pull-legs", "full-body", "5x5", "upper-lower", "beginner"]) {
      expect(urls).toContain(`https://hero-fit.ru/training-programs/${slug}`);
    }
  });
});

describe("programJsonLd", () => {
  const p = BUILTIN_PROGRAMS[0];
  const data = programJsonLd("https://hero-fit.ru", p) as Record<string, unknown>[];
  it("хлебные крошки, план тренировок и FAQ", () => {
    expect(data.map((d) => d["@type"])).toEqual(["BreadcrumbList", "ExercisePlan", "FAQPage"]);
  });
  it("ExercisePlan с названием и частотой", () => {
    const plan = data[1];
    expect(plan.name).toBe(p.title);
    expect(plan.activityFrequency).toBe(p.perWeek);
  });
  it("вопросов столько же, сколько в faq", () => {
    expect((data[2].mainEntity as unknown[]).length).toBe(p.faq.length);
  });
});

describe("sitemapEntries: клубы и города", () => {
  const built = new Date("2026-10-10T12:00:00Z");
  const clubUpdated = new Date("2026-10-11T08:00:00Z");
  const cityUpdated = new Date("2026-10-11T09:00:00Z");
  const entries = sitemapEntries("https://hero-fit.ru", built, [], [{ path: "/gym/kazan/iron-gym", updatedAt: clubUpdated }], [
    { path: "/gym/kazan", updatedAt: cityUpdated },
  ]);
  it("страница клуба и города со своими датами", () => {
    expect(entries).toContainEqual({ url: "https://hero-fit.ru/gym/kazan/iron-gym", lastModified: clubUpdated, changeFrequency: "weekly", priority: 0.6 });
    expect(entries).toContainEqual({ url: "https://hero-fit.ru/gym/kazan", lastModified: cityUpdated, changeFrequency: "weekly", priority: 0.5 });
  });
  it("без клубов — как раньше", () => {
    expect(sitemapEntries("https://hero-fit.ru", built, [])).toHaveLength(13);
  });
});

describe("shortDescription", () => {
  it("короткий текст как есть, переводы строк — пробел", () => {
    expect(shortDescription("Зал\nу дома")).toBe("Зал у дома");
  });
  it("длинный — по слову с многоточием", () => {
    const d = shortDescription("слово ".repeat(60));
    expect(d.length).toBeLessThanOrEqual(160);
    expect(d.endsWith("слово…")).toBe(true);
  });
});

describe("clubJsonLd", () => {
  const club = { name: "</script>Зал", url: "https://hero-fit.ru/gym/kazan/zal", city: "Казань", address: "ул. Пушкина, 5", description: "" };
  it("ExerciseGym с почтовым адресом", () => {
    const ld = clubJsonLd(club) as Record<string, unknown>;
    expect(ld["@type"]).toBe("ExerciseGym");
    expect(ld.address).toEqual({ "@type": "PostalAddress", addressLocality: "Казань", streetAddress: "ул. Пушкина, 5", addressCountry: "RU" });
    expect("description" in ld).toBe(false);
    expect((clubJsonLd({ ...club, description: "О зале" }) as Record<string, unknown>).description).toBe("О зале");
  });
  it("не закрывает script", () => {
    expect(jsonLd(clubJsonLd(club))).not.toContain("</script>");
  });
});

describe("cityJsonLd", () => {
  it("ItemList с позициями от 1", () => {
    const ld = cityJsonLd({ city: "Казань", urls: ["https://a/1", "https://a/2"] }) as { "@type": string; itemListElement: unknown[] };
    expect(ld["@type"]).toBe("ItemList");
    expect(ld.itemListElement).toEqual([
      { "@type": "ListItem", position: 1, url: "https://a/1" },
      { "@type": "ListItem", position: 2, url: "https://a/2" },
    ]);
  });
});

describe("robotsRules", () => {
  /** Самое длинное совпадение выигрывает, `*` — любая последовательность, при равенстве выигрывает allow. */
  function allowed(path: string): boolean {
    const { allow, disallow } = robotsRules();
    const len = (rule: string): number => {
      const esc = (s: string) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(`^${rule.split("*").map(esc).join(".*")}`);
      return re.test(path) ? rule.length : -1;
    };
    const a = Math.max(-1, ...allow.map(len));
    const d = Math.max(-1, ...disallow.map(len));
    return a >= d;
  }

  it("opens public pages, including programs that share the /training prefix", () => {
    for (const p of ["/", "/training-programs", "/training-programs/5x5", "/tools/dots-wilks"]) expect(allowed(p), p).toBe(true);
  });

  it("keeps private pages and the program start handler closed", () => {
    for (const p of ["/training", "/training-programs/5x5/start", "/dashboard"]) expect(allowed(p), p).toBe(false);
  });
});
