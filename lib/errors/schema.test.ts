import { describe, expect, it } from "vitest";
import { clientReportSchema, MAX_BODY_BYTES, stripQuery } from "./schema";

describe("clientReportSchema", () => {
  it("limits and required message", () => {
    expect(clientReportSchema.safeParse({ message: "x".repeat(1001) }).success).toBe(false);
    expect(clientReportSchema.safeParse({ stack: "s" }).success).toBe(false);
    expect(clientReportSchema.safeParse({ message: "m", stack: "x".repeat(6001) }).success).toBe(false);
    expect(clientReportSchema.safeParse({ message: "m", path: "x".repeat(301) }).success).toBe(false);
    expect(clientReportSchema.safeParse({ message: "m", version: "x".repeat(31) }).success).toBe(false);
    expect(clientReportSchema.safeParse({ message: "boom", stack: "Error", path: "/dashboard", version: "0.7.0" }).success).toBe(true);
    expect(MAX_BODY_BYTES).toBe(8192);
  });

  it("stripQuery drops query and hash", () => {
    expect(stripQuery("/reset-password?token=abc")).toBe("/reset-password");
    expect(stripQuery("/a#b")).toBe("/a");
    expect(stripQuery("/plain")).toBe("/plain");
  });
});
