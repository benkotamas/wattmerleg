import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ unstable_cache: (operation: () => unknown) => operation }));
import { GrowattError } from "./errors";
import { clearHistoricalPlantCacheForTests, resolveHistoricalPlant, syncGrowattHistory, type HistoricalDatabase } from "./historical-sync";

const plantResponse = { plants: [{ plant_id: "private", timezone: "Europe/Budapest" }] };
const database: HistoricalDatabase = { existingCoverage: async () => [], upsert: async () => ({ error: null }) };
describe("persistent history job upstream safety", () => {
  beforeEach(() => clearHistoricalPlantCacheForTests());
  it("az első 429 után nem vár és nem próbálkozik újra", async () => {
    const sleep = vi.fn(async () => undefined), api = { plantList: vi.fn(async () => plantResponse), plantEnergyHistory: vi.fn(async () => { throw new GrowattError("GROWATT_RATE_LIMITED", 429); }) };
    await expect(syncGrowattHistory({ userId: "owner", startDate: "2026-08-01", endDate: "2026-08-01", database, api, now: new Date("2026-08-03T12:00:00Z"), sleep, rateLimitRetries: 0 })).rejects.toMatchObject({ code: "GROWATT_RATE_LIMITED" });
    expect(api.plantEnergyHistory).toHaveBeenCalledOnce(); expect(sleep).not.toHaveBeenCalled();
  });
  it("a plant discovery TTL cache single-flight", async () => {
    const api = { plantList: vi.fn(async () => plantResponse), plantEnergyHistory: vi.fn() }, sleep = vi.fn(async () => undefined);
    const [first, second] = await Promise.all([resolveHistoricalPlant(api, { retries: 0, sleep, retryDelayMs: () => 1 }), resolveHistoricalPlant(api, { retries: 0, sleep, retryDelayMs: () => 1 })]);
    expect(first).toEqual(second); expect(api.plantList).toHaveBeenCalledOnce();
    await resolveHistoricalPlant(api, { retries: 0, sleep, retryDelayMs: () => 1 }); expect(api.plantList).toHaveBeenCalledOnce();
  });
});
