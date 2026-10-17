import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyWhoopSignature } from "./signature";

const secret = "s";
const body = '{"a":1}';
const ts = "1700000000000";
const sig = createHmac("sha256", "s").update(ts + body).digest("base64");
const base = { body, signature: sig, timestamp: ts, secret, now: 1700000000000 };

describe("verifyWhoopSignature", () => {
  it("верная подпись", () => expect(verifyWhoopSignature(base)).toBe(true));
  it("другое тело", () => expect(verifyWhoopSignature({ ...base, body: '{"a":2}' })).toBe(false));
  it("нет подписи", () => expect(verifyWhoopSignature({ ...base, signature: null })).toBe(false));
  it("нет метки", () => expect(verifyWhoopSignature({ ...base, timestamp: null })).toBe(false));
  it("подпись другой длины — без исключения", () => {
    expect(verifyWhoopSignature({ ...base, signature: "abc" })).toBe(false);
  });
  it("старше 5 минут", () => {
    expect(verifyWhoopSignature({ ...base, now: 1700000000000 + 5 * 60_000 })).toBe(true);
    expect(verifyWhoopSignature({ ...base, now: 1700000000000 + 5 * 60_000 + 1 })).toBe(false);
  });
  it("метка из будущего", () => {
    expect(verifyWhoopSignature({ ...base, now: 1700000000000 - 60_000 })).toBe(true);
    expect(verifyWhoopSignature({ ...base, now: 1700000000000 - 60_000 - 1 })).toBe(false);
  });
});
