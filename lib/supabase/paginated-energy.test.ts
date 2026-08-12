import { describe, expect, it, vi } from "vitest";
import { ENERGY_PAGE_SIZE, readAllBillingSnapshots, readAllMeterReadings, readAllSettlementPeriods } from "./paginated-energy";
import type { MeterReading, SettlementBillSnapshot, SettlementPeriod } from "@/lib/types";
import { periodSummary } from "@/lib/calculations";
import { DEFAULT_TARIFF_SETTINGS } from "@/lib/config";

const reading = (index: number, at = new Date(Date.UTC(2020, 0, 1, 0, index)).toISOString()): MeterReading => ({
  id: `r-${String(index).padStart(5, "0")}`, reading_at: at,
  consumption_meter_kwh: index, production_meter_kwh: index / 2, note: null,
  settlement_period_id: "period", created_at: at, updated_at: at,
});
const period = (index: number, start = `${2000 + index}-01-01`): SettlementPeriod => ({
  id: `p-${String(index).padStart(5, "0")}`, start_date: start, end_date: null,
  opening_reading_at: null, opening_consumption_meter_kwh: index, opening_production_meter_kwh: index,
  closing_consumption_meter_kwh: null, closing_production_meter_kwh: null, status: "open",
  created_at: `${start}T00:00:00Z`,
});

describe("paginated energy reads", () => {
  it.each([0, 1, 999, 1000, 1001, 1678, 2000, 2001])("reads all %i rows with exact range pages", async count => {
    const source = Array.from({ length: count }, (_, index) => reading(index));
    const loader = vi.fn(async (from: number, to: number) => ({ data: source.slice(from, to + 1), error: null }));
    const result = await readAllMeterReadings(loader);
    expect(result).toHaveLength(count);
    const expectedCalls = Math.floor(count / ENERGY_PAGE_SIZE) + 1;
    expect(loader).toHaveBeenCalledTimes(expectedCalls);
    expect(loader).toHaveBeenNthCalledWith(1, 0, 999);
    if (count >= 1000) expect(loader).toHaveBeenNthCalledWith(2, 1000, 1999);
    if (count >= 2000) expect(loader).toHaveBeenNthCalledWith(3, 2000, 2999);
  });

  it("deduplicates page overlap and sorts by reading_at then id", async () => {
    const same = "2026-01-01T00:00:00.000Z", a = reading(2, same), b = reading(1, same);
    const first = [a, ...Array.from({ length: 999 }, (_, index) => reading(index + 10, new Date(Date.UTC(2027, 0, 1, 0, index)).toISOString()))];
    const loader = vi.fn(async (from: number) => ({ data: from === 0 ? first : [a, b], error: null }));
    const result = await readAllMeterReadings(loader);
    expect(result.filter(row => row.id === a.id)).toHaveLength(1);
    expect(result.slice(0, 2).map(row => row.id)).toEqual([b.id, a.id]);
  });

  it("sorts settlement periods by start_date then id and deduplicates ids", async () => {
    const first = Array.from({ length: 1000 }, (_, index) => period(index + 10));
    const a = period(2, "1999-01-01"), b = period(1, "1999-01-01");
    const loader = vi.fn(async (from: number) => ({ data: from === 0 ? first : [a, b, first[0]], error: null }));
    const result = await readAllSettlementPeriods(loader);
    expect(result.slice(0, 2).map(row => row.id)).toEqual([b.id, a.id]);
    expect(result.filter(row => row.id === first[0].id)).toHaveLength(1);
  });

  it("a számlapillanatképeket is lapozva és kezdődátum szerint olvassa", async () => {
    const base = { id: "s-2", billing_start_date: "2025-09-12" } as SettlementBillSnapshot;
    const source = [{ ...base }, { ...base, id: "s-1" }, { ...base, id: "s-3", billing_start_date: "2026-08-08" }];
    const result = await readAllBillingSnapshots(async (from, to) => ({ data: source.slice(from, to + 1), error: null }));
    expect(result.map(row => row.id)).toEqual(["s-1", "s-2", "s-3"]);
  });

  it.each([0, 1, 2])("fails closed on database error at page %i", async failingPage => {
    const loader = vi.fn(async (from: number) => from / 1000 === failingPage
      ? { data: null, error: new Error("DB_PAGE_FAILED") }
      : { data: Array.from({ length: 1000 }, (_, index) => reading(from + index)), error: null });
    await expect(readAllMeterReadings(loader)).rejects.toThrow("DB_PAGE_FAILED");
  });

  it("keeps user, settlement-period and date filters on every page loader call", async () => {
    const calls: Array<{ userId: string; periodId: string; fromDate: string; toDate: string; range: [number, number] }> = [];
    const source = Array.from({ length: 1001 }, (_, index) => reading(index));
    await readAllMeterReadings(async (from, to) => {
      calls.push({ userId: "owner", periodId: "period", fromDate: "2025-01-01", toDate: "2026-12-31", range: [from, to] });
      return { data: source.slice(from, to + 1), error: null };
    });
    expect(calls).toEqual([
      { userId: "owner", periodId: "period", fromDate: "2025-01-01", toDate: "2026-12-31", range: [0, 999] },
      { userId: "owner", periodId: "period", fromDate: "2025-01-01", toDate: "2026-12-31", range: [1000, 1999] },
    ]);
  });

  it("uses the post-1000 latest reading for every financial summary value", async () => {
    const opening = reading(0, "2025-01-01T00:00:00.000Z");
    const filler = Array.from({ length: 999 }, (_, index) => reading(index + 1, new Date(Date.UTC(2025, 0, 1, 0, index + 1)).toISOString()));
    const latest = { ...reading(1000, "2026-08-01T00:00:00.000Z"), consumption_meter_kwh: 5000, production_meter_kwh: 2000 };
    const source = [opening, ...filler, latest];
    const readings = await readAllMeterReadings(async (from, to) => ({ data: source.slice(from, to + 1), error: null }));
    const summary = periodSummary({ ...period(0, "2025-01-01"), opening_reading_at: opening.reading_at, opening_consumption_meter_kwh: 0, opening_production_meter_kwh: 0 }, readings, DEFAULT_TARIFF_SETTINGS);
    expect(summary).toMatchObject({ consumption: 5000, production: 2000, balance: 3000 });
    expect(summary.estimatedAmount).toBeGreaterThan(0);
  });
});
