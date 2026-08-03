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

  it("a hónaphatárt Europe/Budapest helyi dátuma szerint képezi", () => {
    const [month] = monthlyStatistics([reading("2026-09-30T22:30:00Z", 0, 0), reading("2026-09-30T23:30:00Z", 10, 2)]);
    expect(month.month).toBe("2026-10");
    expect(month.consumption).toBe(10);
  });
  it("coverage metaadatot ad anélkül, hogy a havi energiaértéket módosítaná", () => { const [month] = monthlyStatistics([reading("2026-07-01T00:00:00+02:00", 100, 20), reading("2026-08-01T00:00:00+02:00", 700, 420)]); expect(month).toMatchObject({ consumption: 600, production: 400, coverageStartLocalDate: "2026-07-01", coverageEndLocalDate: "2026-08-01", coversCalendarMonthStart: true, coversRequiredPeriodEnd: true, fullCalendarMonthCoverage: true, sourceIntervalCount: 1 }); });
  it("a hónap közepi kezdést és korai véget nem tekinti teljes coverage-nek", () => { const [middle] = monthlyStatistics([reading("2026-07-15T10:00:00+02:00", 0, 0), reading("2026-08-01T00:00:00+02:00", 10, 2)]), [early] = monthlyStatistics([reading("2026-07-01T00:00:00+02:00", 0, 0), reading("2026-07-30T10:00:00+02:00", 10, 2)]); expect(middle.coversCalendarMonthStart).toBe(false); expect(early.coversRequiredPeriodEnd).toBe(false); });
});
