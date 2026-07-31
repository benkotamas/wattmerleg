import { describe, expect, it } from "vitest";
import { estimateAmount } from "./calculations";
import { heatingSeasonForDate, heatingSeasonForecast, heatingSeasonForecastFromAverages, historicalMonthEstimate, historicalMonthlyAverages, isValidMonthDay, seasonalAnnualForecast } from "./seasonal-forecast";
import type { MeterReading, SettlementPeriod, TariffSettings } from "./types";

const tariff: TariffSettings = {
  discounted_limit_kwh: 2523, discounted_price_ft: 36, market_price_ft: 70.1, feed_in_price_ft: 5,
  annual_closing_month: 8, annual_closing_day: 4,
  heating_season_start_month: 10, heating_season_start_day: 1,
  heating_season_end_month: 4, heating_season_end_day: 30,
};
const reading = (at: string, consumption: number, production = 0, periodId = "history"): MeterReading => ({ id: at, reading_at: at, consumption_meter_kwh: consumption, production_meter_kwh: production, note: null, settlement_period_id: periodId, created_at: at, updated_at: at });
const currentPeriod: SettlementPeriod = { id: "current", start_date: "2025-08-05", end_date: null, opening_consumption_meter_kwh: 2000, opening_production_meter_kwh: 500, closing_consumption_meter_kwh: null, closing_production_meter_kwh: null, status: "open", created_at: "2025-08-05T00:00:00Z" };

describe("seasonal forecast", () => {
  it("calculates historical monthly averages", () => {
    const averages = historicalMonthlyAverages([reading("2023-01-01T00:00:00Z", 0), reading("2023-02-01T00:00:00Z", 100)]);
    expect(averages.find(item => item.month === 1)?.consumption).toBeCloseTo(100, 0);
  });

  it("averages the same month across multiple years", () => {
    const averages = historicalMonthlyAverages([
      reading("2023-01-01T00:00:00Z", 0), reading("2023-02-01T00:00:00Z", 100),
      reading("2024-01-01T00:00:00Z", 1000), reading("2024-02-01T00:00:00Z", 1200),
    ]);
    const january = averages.find(item => item.month === 1)!;
    expect(january.consumption).toBeCloseTo(150, 0);
    expect(january.consumptionSampleCount).toBe(2);
    expect(january.productionSampleCount).toBe(2);
  });

  it("falls back to nearby seasonal months when the exact month is missing", () => {
    const result = historicalMonthEstimate(12, [{ month: 1, consumption: 900, production: 100, consumptionSampleCount: 2, productionSampleCount: 2 }], 10, "consumption");
    expect(result.value).toBe(900);
    expect(result.confidence).toBe("low");
  });

  it("classifies confidence from historical sample count", () => {
    expect(historicalMonthEstimate(1, [{ month: 1, consumption: 100, production: 10, consumptionSampleCount: 2, productionSampleCount: 2 }], 1, "consumption").confidence).toBe("high");
    expect(historicalMonthEstimate(1, [{ month: 1, consumption: 100, production: 10, consumptionSampleCount: 1, productionSampleCount: 1 }], 1, "consumption").confidence).toBe("medium");
  });

  it("includes heating season boundary days", () => {
    expect(heatingSeasonForDate(new Date(2025, 9, 1, 12), tariff).active).toBe(true);
    expect(heatingSeasonForDate(new Date(2026, 3, 30, 12), tariff).active).toBe(true);
    expect(heatingSeasonForDate(new Date(2026, 4, 1, 12), tariff).active).toBe(false);
  });

  it("names a heating season spanning two calendar years", () => {
    const season = heatingSeasonForDate(new Date(2026, 0, 15), tariff);
    expect(season.label).toBe("2025/2026");
    expect(season.start.getFullYear()).toBe(2025);
    expect(season.end.getFullYear()).toBe(2026);
  });

  it("calculates a seasonal annual forecast from actual and historical months", () => {
    const history = [reading("2023-08-01T00:00:00Z", 0, 0), reading("2024-08-01T00:00:00Z", 12000, 3000), reading("2025-08-01T00:00:00Z", 24000, 6000)];
    const current = [reading("2025-08-05T00:00:00Z", 2000, 500, "current"), reading("2025-09-05T00:00:00Z", 2500, 700, "current")];
    const forecast = seasonalAnnualForecast(currentPeriod, current, [...history, ...current], tariff);
    expect(forecast.months.length).toBeGreaterThan(10);
    expect(forecast.consumption).toBeGreaterThan(500);
    expect(forecast.balance).toBeCloseTo(forecast.consumption - forecast.production);
  });

  it("uses the current tariff for the seasonal bill forecast", () => {
    const current = [reading("2025-08-05T00:00:00Z", 2000, 500, "current"), reading("2025-09-05T00:00:00Z", 2500, 700, "current")];
    const forecast = seasonalAnnualForecast(currentPeriod, current, current, tariff);
    expect(forecast.estimatedAmount).toBe(estimateAmount(forecast.balance, tariff));
  });

  it("forecasts the full next heating season independently from the August settlement closing", () => {
    const history = [reading("2023-01-01T00:00:00Z", 0), reading("2024-01-01T00:00:00Z", 10000), reading("2025-01-01T00:00:00Z", 20000), reading("2026-07-31T08:30:00Z", 35000)];
    const forecast = heatingSeasonForecast(history, new Date("2026-07-31T08:30:00Z"), tariff);
    expect(forecast.range.start).toEqual(new Date(2026, 9, 1));
    expect(forecast.range.end.getFullYear()).toBe(2027);
    expect(forecast.range.end.getMonth()).toBe(3);
    expect(forecast.months.at(-1)?.month).toBe("2027-04");
    expect(forecast.months.some(month => month.month > "2026-08")).toBe(true);
  });

  it("prorates partial opening and closing months", () => {
    const partialTariff = { ...tariff, heating_season_start_day: 15, heating_season_end_day: 15 };
    const range = heatingSeasonForDate(new Date(2026, 6, 31), partialTariff);
    const averages = Array.from({ length: 12 }, (_, index) => ({ month: index + 1, consumption: new Date(2024, index + 1, 0).getDate() * 10, production: 0, consumptionSampleCount: 2, productionSampleCount: 2 }));
    const forecast = heatingSeasonForecastFromAverages([], new Date(2026, 6, 31), range, averages, 10);
    expect(forecast.months.find(month => month.month === "2026-10")?.expectedConsumption).toBeCloseTo(170, 0);
    expect(forecast.months.find(month => month.month === "2027-04")?.expectedConsumption).toBeCloseTo(150, 0);
  });

  it("clamps configured February 29 to February 28 in a non-leap year", () => {
    const februaryTariff = { ...tariff, heating_season_end_month: 2, heating_season_end_day: 29 };
    const range = heatingSeasonForDate(new Date(2025, 0, 15), februaryTariff);
    expect(range.end.getFullYear()).toBe(2025);
    expect(range.end.getMonth()).toBe(1);
    expect(range.end.getDate()).toBe(28);
  });

  it("rejects impossible month/day configurations", () => {
    expect(isValidMonthDay(2, 29)).toBe(true);
    expect(isValidMonthDay(2, 31)).toBe(false);
    expect(isValidMonthDay(4, 31)).toBe(false);
    expect(() => heatingSeasonForDate(new Date(2025, 0, 1), { ...tariff, heating_season_end_month: 2, heating_season_end_day: 31 })).toThrow();
  });

  it("combines actual consumption with the remaining forecast in an active season", () => {
    const reference = new Date(2025, 10, 15);
    const range = heatingSeasonForDate(reference, tariff);
    const readings = [reading("2025-09-30T00:00:00", 1000), reading("2025-10-01T00:00:00", 1010), reading("2025-11-15T00:00:00", 1500)];
    const averages = Array.from({ length: 12 }, (_, index) => ({ month: index + 1, consumption: 1000, production: 0, consumptionSampleCount: 2, productionSampleCount: 2 }));
    const forecast = heatingSeasonForecastFromAverages(readings, reference, range, averages, 10);
    expect(forecast.actualConsumption).toBeCloseTo(490, 0);
    expect(forecast.expectedTotal).toBeGreaterThan(forecast.actualConsumption);
    const november = forecast.months.find(month => month.month === "2025-11")!;
    expect(november.actualConsumption).toBeGreaterThan(0);
    expect(november.expectedConsumption).toBeGreaterThan(0);
  });
});
