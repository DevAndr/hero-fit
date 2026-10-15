import { beforeEach, describe, expect, it, vi } from "vitest";

const beacon = vi.fn<(url: string, body: string) => boolean>(() => true);
vi.stubGlobal("navigator", { sendBeacon: beacon });
vi.stubGlobal("location", { pathname: "/dashboard" });

const { sendErrorReport } = await import("./send-report");

beforeEach(() => beacon.mockClear());

describe("sendErrorReport", () => {
  it("skips errors with a digest — the server already recorded them (failed server action)", () => {
    sendErrorReport(Object.assign(new Error("An error occurred in the Server Components render"), { digest: "123" }));
    expect(beacon).not.toHaveBeenCalled();
  });

  it("sends a plain browser error once", () => {
    sendErrorReport(new Error("client boom"));
    sendErrorReport(new Error("client boom"));
    expect(beacon).toHaveBeenCalledTimes(1);
  });
});
