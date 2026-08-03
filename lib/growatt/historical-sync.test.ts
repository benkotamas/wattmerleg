import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ unstable_cache: (operation: () => unknown) => operation }));

import { GrowattError } from "./errors";
import { syncGrowattHistory, type HistoricalCoverageRecord, type HistoricalDatabase } from "./historical-sync";

const plant = () => ({ plants: [{ plant_id: "private", timezone: "Europe/Budapest" }] });
const coverage = (localDate: string, qualityStatus: HistoricalCoverageRecord["qualityStatus"] = "complete"): HistoricalCoverageRecord => ({ localDate, qualityStatus, plantTimezone: "Europe/Budapest" });

function database(initial: HistoricalCoverageRecord[] = []) {
  const stored = new Map<string, Record<string, unknown>>(initial.map(row => [row.localDate, { local_date: row.localDate, quality_status: row.qualityStatus, plant_timezone: row.plantTimezone, energy_kwh: 0 }]));
  const upsert = vi.fn(async (rows: unknown[]) => { for (const row of rows as Record<string, unknown>[]) stored.set(String(row.local_date), row); return { error: null }; });
  const db: HistoricalDatabase = {
    existingCoverage: async () => [...stored.values()].map(row => ({ localDate: String(row.local_date), qualityStatus: row.quality_status as HistoricalCoverageRecord["qualityStatus"], plantTimezone: String(row.plant_timezone) })),
    upsert,
  };
  return { stored, upsert, db };
}

function historyApi(energy = 1) {
  return {
    plantList: vi.fn(async () => plant()),
    plantEnergyHistory: vi.fn(async (_id: string, start: string, end: string) => {
      const energys = [];
      for (let date = start; date <= end; date = new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)) energys.push({ date, energy });
      return { time_unit: "day", energys };
    }),
  };
}

describe("Growatt historikus sync", () => {
  it("csak az adatbázisból hiányzó, összefüggő dátumtartományokat kéri le", async () => {
    const d = database([coverage("2026-08-01"), coverage("2026-08-04"), coverage("2026-08-07")]), api = historyApi();
    const result = await syncGrowattHistory({ userId: "owner", startDate: "2026-08-01", endDate: "2026-08-07", database: d.db, api, now: new Date("2026-08-08T12:00:00Z") });
    expect(api.plantEnergyHistory).toHaveBeenNthCalledWith(1, "private", "2026-08-02", "2026-08-03", "day", 1, 20);
    expect(api.plantEnergyHistory).toHaveBeenNthCalledWith(2, "private", "2026-08-05", "2026-08-06", "day", 1, 20);
    expect(result).toMatchObject({ alreadyCompleteDays: 3, refreshedProvisionalDays: 0, requestedFromGrowattDays: 4, chunks: 2 });
  });

  it("complete nap nem kerül újra lekérésre, minden complete esetén nulla history hívás történik", async () => {
    const d = database([coverage("2026-08-01"), coverage("2026-08-02")]), api = historyApi();
    const result = await syncGrowattHistory({ userId: "owner", startDate: "2026-08-01", endDate: "2026-08-02", database: d.db, api, now: new Date("2026-08-03T12:00:00Z") });
    expect(api.plantList).not.toHaveBeenCalled();
    expect(api.plantEnergyHistory).not.toHaveBeenCalled();
    expect(result).toMatchObject({ alreadyCompleteDays: 2, refreshedProvisionalDays: 0, requestedFromGrowattDays: 0, upsertedDays: 0 });
  });

  it("az aktuális napi provisional rekordot újrakéri és az upsertben frissíti", async () => {
    const d = database([coverage("2026-08-03", "provisional")]), api = historyApi(6.25);
    const result = await syncGrowattHistory({ userId: "owner", startDate: "2026-08-03", endDate: "2026-08-03", database: d.db, api, now: new Date("2026-08-03T12:00:00Z") });
    expect(api.plantEnergyHistory).toHaveBeenCalledTimes(1);
    expect(d.stored.get("2026-08-03")).toMatchObject({ energy_kwh: 6.25, quality_status: "provisional" });
    expect(result).toMatchObject({ alreadyCompleteDays: 0, refreshedProvisionalDays: 1, requestedFromGrowattDays: 1, upsertedDays: 1 });
  });

  it("a tegnapi provisional rekordot újrakéri és complete státuszúra frissíti", async () => {
    const d = database([coverage("2026-08-02", "provisional")]), api = historyApi(8.5);
    const result = await syncGrowattHistory({ userId: "owner", startDate: "2026-08-02", endDate: "2026-08-02", database: d.db, api, now: new Date("2026-08-03T12:00:00Z") });
    expect(d.stored.get("2026-08-02")).toMatchObject({ energy_kwh: 8.5, quality_status: "complete" });
    expect(result.refreshedProvisionalDays).toBe(1);
  });

  it("complete és provisional vegyes tartományból csak a provisional napot kéri le", async () => {
    const d = database([coverage("2026-08-01"), coverage("2026-08-02", "provisional"), coverage("2026-08-03")]), api = historyApi();
    const result = await syncGrowattHistory({ userId: "owner", startDate: "2026-08-01", endDate: "2026-08-03", database: d.db, api, now: new Date("2026-08-04T12:00:00Z") });
    expect(api.plantEnergyHistory).toHaveBeenCalledWith("private", "2026-08-02", "2026-08-02", "day", 1, 20);
    expect(api.plantEnergyHistory).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ alreadyStoredDays: 3, alreadyCompleteDays: 2, refreshedProvisionalDays: 1, requestedFromGrowattDays: 1, upsertedDays: 1 });
  });

  it("a 0 kWh-s provisional nap is újraszinkronizálható", async () => {
    const d = database([coverage("2026-08-02", "provisional")]), api = historyApi(0);
    await syncGrowattHistory({ userId: "owner", startDate: "2026-08-02", endDate: "2026-08-02", database: d.db, api, now: new Date("2026-08-03T12:00:00Z") });
    expect(d.stored.get("2026-08-02")).toMatchObject({ energy_kwh: 0, quality_status: "complete" });
    expect(api.plantEnergyHistory).toHaveBeenCalledTimes(1);
  });

  it("7 napos blokkokat szekvenciálisan upsertel", async () => {
    const d = database(), api = historyApi();
    const result = await syncGrowattHistory({ userId: "owner", startDate: "2026-07-26", endDate: "2026-08-02", database: d.db, api, now: new Date("2026-08-03T12:00:00Z") });
    expect(api.plantEnergyHistory).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ alreadyCompleteDays: 0, requestedFromGrowattDays: 8, upsertedDays: 8 });
  });

  it("egy későbbi hibás blokk mellett megőrzi az elsőt és részleges eredményt ad", async () => {
    const d = database(), api = { plantList: async () => plant(), plantEnergyHistory: vi.fn().mockResolvedValueOnce({ time_unit: "day", energys: [{ date: "2026-07-20", energy: 1 }] }).mockRejectedValueOnce(new Error("offline")) };
    const result = await syncGrowattHistory({ userId: "owner", startDate: "2026-07-20", endDate: "2026-08-02", database: d.db, api, now: new Date("2026-08-03T12:00:00Z") });
    expect(result.partial).toBe(true); expect(result.successfulChunks).toBe(1); expect(result.retryRanges).toEqual([{ startDate: "2026-07-27", endDate: "2026-08-02" }]); expect(d.stored.size).toBe(1);
  });

  it("az adatbázis-hibát külön kóddal adja, nyers hiba nélkül", async () => {
    const db = { existingCoverage: async () => [], upsert: async () => ({ error: { message: "private database detail" } }) } as HistoricalDatabase;
    const api = { plantList: async () => plant(), plantEnergyHistory: async () => ({ time_unit: "day", energys: [{ date: "2026-08-01", energy: 1 }] }) };
    await expect(syncGrowattHistory({ userId: "owner", startDate: "2026-08-01", endDate: "2026-08-01", database: db, api, now: new Date("2026-08-03T12:00:00Z") })).rejects.toMatchObject({ code: "HISTORY_DATABASE_WRITE_FAILED" });
  });

  it("részleges DB-hibánál receivedValidDays és upsertedDays eltér", async () => {
    let call = 0;
    const db = { existingCoverage: async () => [], upsert: async () => ++call === 1 ? { error: null } : { error: { message: "hidden" } } } as HistoricalDatabase;
    const api = { plantList: async () => plant(), plantEnergyHistory: vi.fn().mockResolvedValueOnce({ time_unit: "day", energys: [{ date: "2026-07-20", energy: 1 }] }).mockResolvedValueOnce({ time_unit: "day", energys: [{ date: "2026-07-27", energy: 2 }] }) };
    const result = await syncGrowattHistory({ userId: "owner", startDate: "2026-07-20", endDate: "2026-08-02", database: db, api, now: new Date("2026-08-03T12:00:00Z") });
    expect(result.receivedValidDays).toBe(2); expect(result.upsertedDays).toBe(1); expect(result.failedChunks[0].code).toBe("HISTORY_DATABASE_WRITE_FAILED");
  });

  it("429 után pontosan egyszer, 15–20 másodperc várakozással próbálkozik újra", async () => {
    const d = database(), sleep = vi.fn(async () => undefined), api = { plantList: async () => plant(), plantEnergyHistory: vi.fn().mockRejectedValueOnce(new GrowattError("GROWATT_RATE_LIMITED", 429)).mockResolvedValueOnce({ time_unit: "day", energys: [{ date: "2026-08-01", energy: 1 }] }) };
    const result = await syncGrowattHistory({ userId: "owner", startDate: "2026-08-01", endDate: "2026-08-01", database: d.db, api, now: new Date("2026-08-03T12:00:00Z"), sleep, retryDelayMs: () => 17_000 });
    expect(result.ok).toBe(true); expect(api.plantEnergyHistory).toHaveBeenCalledTimes(2); expect(sleep).toHaveBeenCalledOnce(); expect(sleep).toHaveBeenCalledWith(17_000);
  });

  it("második 429 után nem próbálkozik harmadszor", async () => {
    const d = database(), sleep = vi.fn(async () => undefined), api = { plantList: async () => plant(), plantEnergyHistory: vi.fn(async () => { throw new GrowattError("GROWATT_RATE_LIMITED", 429); }) };
    await expect(syncGrowattHistory({ userId: "owner", startDate: "2026-08-01", endDate: "2026-08-01", database: d.db, api, now: new Date("2026-08-03T12:00:00Z"), sleep, retryDelayMs: () => 15_000 })).rejects.toMatchObject({ code: "GROWATT_RATE_LIMITED" });
    expect(api.plantEnergyHistory).toHaveBeenCalledTimes(2); expect(sleep).toHaveBeenCalledOnce();
  });
});
