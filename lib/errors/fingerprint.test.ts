import { describe, expect, it } from "vitest";
import { fingerprint, normalizeMessage, topFrame } from "./fingerprint";

const stack = (frame: string) => `Error: x\n    at ${frame}\n    at other (node:internal/process:1:1)`;

describe("fingerprint", () => {
  it("same error with different ids and numbers — one group", () => {
    const a = fingerprint({ source: "SERVER", message: "Workout cmv6ndv1f000644pkar2gh0ns not found", stack: stack("f (/app/lib/a.ts:10:5)") });
    const b = fingerprint({ source: "SERVER", message: "Workout cmv7aaaaaaaaaaaaaaaaaaaaaa not found", stack: stack("f (/app/lib/a.ts:12:9)") });
    expect(a).toBe(b);
    expect(normalizeMessage("limit 30 exceeded")).toBe(normalizeMessage("limit 45 exceeded"));
    expect(normalizeMessage('key "aaaaaaaaaaaaaaaaaaaaaaaaa" taken')).toBe('key <s> taken');
    expect(normalizeMessage("user 3f2b8c9d-1111-2222-3333-444455556666 gone")).toBe("user <id> gone");
  });

  it("different chunk hashes — one group; different place or source — different", () => {
    const chunkA = { source: "CLIENT" as const, message: "x is undefined", stack: "TypeError\n    at f (/_next/static/chunks/a1b2c3.js:1:200)" };
    const chunkB = { ...chunkA, stack: "TypeError\n    at f (/_next/static/chunks/ffee99.js:1:900)" };
    expect(fingerprint(chunkA)).toBe(fingerprint(chunkB));
    expect(fingerprint(chunkA)).not.toBe(fingerprint({ ...chunkA, stack: "TypeError\n    at g (/_next/static/chunks/a1b2c3.js:1:200)" }));
    expect(fingerprint(chunkA)).not.toBe(fingerprint({ ...chunkA, source: "SERVER" }));
    expect(fingerprint(chunkA)).toMatch(/^[0-9a-f]{40}$/);
  });

  it("topFrame skips node_modules and node:internal, falls back to the first line", () => {
    expect(topFrame("Error: x\n    at a (/app/node_modules/x.js:1:1)\n    at b (/app/lib/b.ts:3:4)")).toBe("at b (/app/lib/b.ts)");
    expect(topFrame("Error: x\n    at a (/app/node_modules/x.js:1:1)")).toBe("at a (/app/node_modules/x.js)");
    expect(topFrame(null)).toBe("");
  });
});
