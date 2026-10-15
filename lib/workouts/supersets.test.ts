import { describe, expect, it } from "vitest";
import { afterSet, canLink, groupLabels, groupSize, link, normalizeGroups, unlink } from "./supersets";

const g = (...xs: (number | null)[]) => xs.map((group) => ({ group }));
const groups = (items: { group: number | null }[]) => items.map((x) => x.group);
const p = (group: number | null, pending: number) => ({ group, pending });

describe("normalizeGroups", () => {
  it("drops singles, splits broken groups, renumbers", () => {
    expect(groups(normalizeGroups(g(1, null, 1)))).toEqual([null, null, null]);
    expect(groups(normalizeGroups(g(5, 5, 2, 2)))).toEqual([1, 1, 2, 2]);
    expect(groups(normalizeGroups(g(1, 1, 2, 1, 1)))).toEqual([1, 1, null, 2, 2]);
  });

  it("caps a group at 6", () => {
    expect(groups(normalizeGroups(g(1, 1, 1, 1, 1, 1, 1)))).toEqual([1, 1, 1, 1, 1, 1, null]);
    expect(groups(normalizeGroups(g(1, 1, 1, 1, 1, 1, 1, 1)))).toEqual([1, 1, 1, 1, 1, 1, 2, 2]);
  });

  it("a state saved on the device before groups (no field) — no groups", () => {
    const old = [{}, {}, {}] as { group: number | null }[];
    expect(groups(normalizeGroups(old))).toEqual([null, null, null]);
    expect(groupLabels(old)).toEqual([null, null, null]);
  });

  it("keeps unchanged items as the same objects", () => {
    const items = g(1, 1, null);
    const out = normalizeGroups(items);
    expect(out[0]).toBe(items[0]);
    expect(out[2]).toBe(items[2]);
  });
});

describe("link / unlink / canLink", () => {
  it("links with the next and merges groups", () => {
    expect(groups(link(g(null, null, null), 0))).toEqual([1, 1, null]);
    expect(groups(link(g(1, 1, 2, 2), 1))).toEqual([1, 1, 1, 1]);
  });

  it("unlinks the next, splitting the group", () => {
    expect(groups(unlink(g(1, 1, 1, 1), 1))).toEqual([1, 1, 2, 2]);
    expect(groups(unlink(g(1, 1, 1), 0))).toEqual([null, 1, 1]);
  });

  it("canLink respects the end of the list and the limit of 6", () => {
    expect(canLink(g(null, null), 1)).toBe(false);
    expect(canLink(g(null, null), 0)).toBe(true);
    expect(canLink(g(1, 1, 1, 1, 1, 1, null), 5)).toBe(false);
    expect(canLink(g(1, 1, 1, 2, 2, 2), 2)).toBe(true);
    expect(canLink(g(1, 1, 1, 1, 2, 2, 2), 3)).toBe(false);
  });
});

describe("groupLabels / groupSize", () => {
  it("letters by group order, numbers inside", () => {
    expect(groupLabels(g(1, 1, null, 2, 2, 2))).toEqual(["A1", "A2", null, "B1", "B2", "B3"]);
    expect(groupSize(g(1, 1, null, 2, 2, 2), 4)).toBe(3);
    expect(groupSize(g(1, 1, null), 2)).toBe(0);
  });
});

describe("afterSet", () => {
  it("outside a group — rest, next is the same or the following exercise", () => {
    expect(afterSet([p(null, 2)], 0)).toEqual({ kind: "rest", next: 0 });
    expect(afterSet([p(null, 0), p(null, 1)], 0)).toEqual({ kind: "rest", next: 1 });
  });

  it("inside a group — switch to the next, rest after the round", () => {
    expect(afterSet([p(1, 2), p(1, 3)], 0)).toEqual({ kind: "switch", next: 1 });
    expect(afterSet([p(1, 2), p(1, 3)], 1)).toEqual({ kind: "rest", next: 0 });
    expect(afterSet([p(1, 1), p(1, 1), p(1, 1)], 2)).toEqual({ kind: "rest", next: 0 });
  });

  it("skips exercises without sets left", () => {
    expect(afterSet([p(1, 0), p(1, 2)], 1)).toEqual({ kind: "rest", next: 1 });
    expect(afterSet([p(1, 2), p(1, 0), p(1, 2)], 0)).toEqual({ kind: "switch", next: 2 });
  });

  it("group done — rest towards the next exercise after it, or nothing", () => {
    expect(afterSet([p(1, 0), p(1, 0), p(null, 3)], 1)).toEqual({ kind: "rest", next: 2 });
    expect(afterSet([p(1, 0), p(1, 0)], 1)).toEqual({ kind: "rest", next: null });
  });
});
