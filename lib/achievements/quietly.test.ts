import { describe, expect, it, vi } from "vitest";
import { quietly } from "./quietly";

describe("quietly", () => {
  it("returns the result when the run succeeds", async () => {
    await expect(quietly(async () => 5, 0)).resolves.toBe(5);
  });

  it("falls back and logs instead of throwing — side feature must not break the page", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(quietly(async () => Promise.reject(new Error("P2028")), 0)).resolves.toBe(0);
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});
