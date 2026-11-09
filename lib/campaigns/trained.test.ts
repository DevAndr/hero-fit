import { describe, expect, it, vi } from "vitest";
import type { Prisma } from "@/generated/prisma/client";
import { trainedWindow } from "./rules";
import { markCampaignsTrained } from "./trained";

describe("markCampaignsTrained", () => {
  it("помечает отправки за 72 часа до завершения, ещё не помеченные", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const tx = { campaignSend: { updateMany } } as unknown as Prisma.TransactionClient;
    const f = new Date("2026-11-09T12:00:00Z");
    await markCampaignsTrained(tx, "u1", f);
    expect(updateMany).toHaveBeenCalledWith({
      where: { userId: "u1", trainedAt: null, sentAt: trainedWindow(f) },
      data: { trainedAt: f },
    });
  });
});
