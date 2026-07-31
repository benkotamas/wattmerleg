import { describe, expect, it } from "vitest";
import { historicalMonthEstimate, historicalMonthlyAverages } from "./seasonal-forecast";
import { monthlyStatistics } from "./statistics";
import type { MeterReading } from "./types";

const reading = (at: string, consumption: number, production: number): MeterReading => ({
  id: at, reading_at: at, consumption_meter_kwh: consumption, production_meter_kwh: production,
  note: null, settlement_period_id: "period", created_at: at, updated_at: at,
});

describe("monthly statistics data quality", () => {
  it("ignores negative consumption while preserving positive production", () => {
    const [month] = monthlyStatistics([
      reading("2025-01-01T12:00:00", 100, 100), reading("2025-01-02T12:00:00", 90, 120),
    ]);
    expect(month.consumption).toBe(0);
    expect(month.production).toBe(20);
    expect(month.ignoredConsumptionIntervals).toBe(1);
    expect(month.ignoredProductionIntervals).toBe(0);
    expect(month.hasDataWarning).toBe(true);
  });

  it("ignores negative production while preserving positive consumption", () => {
    const [month] = monthlyStatistics([
      reading("2025-01-01T12:00:00", 100, 100), reading("2025-01-02T12:00:00", 120, 90),
    ]);
    expect(month.consumption).toBe(20);
    expect(month.production).toBe(0);
    expect(month.ignoredConsumptionIntervals).toBe(0);
    expect(month.ignoredProductionIntervals).toBe(1);
    expect(month.hasDataWarning).toBe(true);
  });

  it("excludes a warned consumption month while retaining clean production samples", () => {
    const readings = [
      reading("2024-01-01T12:00:00", 100, 100), reading("2024-01-02T12:00:00", 90, 120),
      reading("2025-01-01T12:00:00", 1000, 1000), reading("2025-01-02T12:00:00", 1020, 1020),
    ];
    const averages = historicalMonthlyAverages(readings);
    const cleanJanuary = monthlyStatistics(readings).find(month => month.month === "2025-01")!;
    const january = averages.find(item => item.month === 1)!;
    expect(january.hasDataWarning).toBe(true);
    expect(january.hasConsumptionWarning).toBe(true);
    expect(january.hasProductionWarning).toBe(false);
    expect(january.consumption).toBeCloseTo(cleanJanuary.consumption);
    expect(january.consumptionSampleCount).toBe(1);
    expect(january.productionSampleCount).toBe(2);
    expect(historicalMonthEstimate(1, averages, 1, "consumption").confidence).toBe("medium");
    expect(historicalMonthEstimate(1, averages, 1, "production").confidence).toBe("high");
  });

  it("keeps high confidence for two clean historical years", () => {
    const estimate = historicalMonthEstimate(1, [{ month: 1, consumption: 200, production: 50, consumptionSampleCount: 2, productionSampleCount: 2, hasDataWarning: false }], 1, "consumption");
    expect(estimate.confidence).toBe("high");
  });
});
