import { describe, expect, it } from "vitest";
import { clearRecord, pickInitial, pruneRecords, readRecord, writeRecord, type OfflineRecord } from "./offline-store";

function memoryStore() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
    map,
  };
}

const state = { name: "Push", status: "IN_PROGRESS" as const, startedAt: "2026-10-07T10:00:00.000Z", exercises: [] };
const rec = (patch: Partial<OfflineRecord> = {}): OfflineRecord => ({
  v: 1,
  workoutId: "w1",
  state,
  savedAt: Date.parse("2026-10-07T10:30:00Z"),
  synced: false,
  pendingStart: null,
  pendingFinish: null,
  ...patch,
});

describe("offline store", () => {
  it("writes, reads and clears a record; ignores garbage", () => {
    const store = memoryStore();
    writeRecord(rec(), store);
    expect(readRecord("w1", store)).toEqual(rec());
    expect(readRecord("w2", store)).toBeNull();
    store.setItem("hf:workout:w3", "{not json");
    expect(readRecord("w3", store)).toBeNull();
    clearRecord("w1", store);
    expect(readRecord("w1", store)).toBeNull();
  });

  it("prune keeps only the active workout and drops old records", () => {
    const store = memoryStore();
    const now = Date.parse("2026-10-07T12:00:00Z");
    writeRecord(rec({ workoutId: "active" }), store);
    writeRecord(rec({ workoutId: "finished-elsewhere" }), store);
    store.setItem("theme", "dark"); // чужие ключи не трогаем
    pruneRecords("active", now, store);
    expect([...store.map.keys()].sort()).toEqual(["hf:workout:active", "theme"]);
    pruneRecords("active", now + 8 * 24 * 3600 * 1000, store);
    expect(readRecord("active", store)).toBeNull();
  });
});

describe("pickInitial", () => {
  const server = { updatedAt: "2026-10-07T10:20:00Z" };

  it("restores an unsent local draft that is newer than the server", () => {
    expect(pickInitial(server, rec())).toEqual({ state, restored: true });
  });

  it("restores a queued finish or start even if the draft itself was sent", () => {
    expect(pickInitial(server, rec({ synced: true, pendingFinish: "2026-10-07T10:31:00Z" })).restored).toBe(true);
    expect(pickInitial(server, rec({ synced: true, pendingStart: "2026-10-07T10:01:00Z" })).restored).toBe(true);
  });

  it("uses the server when everything was sent or the server is newer (edited on another device)", () => {
    expect(pickInitial(server, rec({ synced: true })).restored).toBe(false);
    expect(pickInitial({ updatedAt: "2026-10-07T11:00:00Z" }, rec()).restored).toBe(false);
    expect(pickInitial(server, null).restored).toBe(false);
  });
});
