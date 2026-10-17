import { describe, expect, it } from "vitest";
import { decryptToken, encryptToken } from "./crypto";

const KEY = Buffer.alloc(32, 7).toString("base64");
const OTHER_KEY = Buffer.alloc(32, 8).toString("base64");

describe("encryptToken / decryptToken", () => {
  it("расшифровывает то, что зашифровал", () => {
    expect(decryptToken(encryptToken("abc", KEY), KEY)).toBe("abc");
  });

  it("формат iv.tag.data, IV 12 байт", () => {
    const parts = encryptToken("abc", KEY).split(".");
    expect(parts).toHaveLength(3);
    expect(Buffer.from(parts[0], "base64url")).toHaveLength(12);
  });

  it("два шифрования одной строки различаются (случайный IV)", () => {
    expect(encryptToken("abc", KEY)).not.toBe(encryptToken("abc", KEY));
  });

  it("подмена данных — бросает", () => {
    const [iv, tag, data] = encryptToken("abc", KEY).split(".");
    const forged = (data[0] === "A" ? "B" : "A") + data.slice(1);
    expect(() => decryptToken(`${iv}.${tag}.${forged}`, KEY)).toThrow();
  });

  it("другой ключ — бросает", () => {
    expect(() => decryptToken(encryptToken("abc", KEY), OTHER_KEY)).toThrow();
  });

  it("ключ не 32 байта — бросает", () => {
    expect(() => encryptToken("abc", Buffer.alloc(16).toString("base64"))).toThrow();
  });
});
