import { expect, it } from "vitest";
import { MUSCLE_GROUPS } from "@/lib/muscle-groups";
import { FAQ } from "./faq";

it("FAQ names as many muscle groups as the app has", () => {
  const mentions = FAQ.flatMap((f) => [...f.a.matchAll(/(\d+) группам мышц/g)].map((m) => Number(m[1])));
  expect(mentions.length).toBeGreaterThan(0);
  for (const n of mentions) expect(n).toBe(MUSCLE_GROUPS.length);
});
