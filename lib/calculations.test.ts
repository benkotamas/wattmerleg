import { describe, expect, it } from "vitest";
import { annualForecast, comparePeriodsAtSameElapsedTime, elapsedDays, estimateAmount, nextClosingDate, readingDelta } from "./calculations";
import type { MeterReading, SettlementPeriod, TariffSettings } from "./types";

const reading = (at: string, consumption: number, production: number): MeterReading => ({
  id: at,
  reading_at: at,
  consumption_meter_kwh: consumption,
  production_meter_kwh: production,
  note: null,
  settlement_period_id: "period",
  created_at: at,
  updated_at: at,
});

const period = (id: string, start: string, status: "open" | "closed" = "open"): SettlementPeriod => ({
  id, start_date: start, end_date: status === "closed" ? "2025-08-04" : null,
  opening_consumption_meter_kwh: id === "previous" ? 1000 : 100,
  opening_production_meter_kwh: id === "previous" ? 500 : 50,
  closing_consumption_meter_kwh: status === "closed" ? 1365 : null,
  closing_production_meter_kwh: status === "closed" ? 700 : null,
  status, created_at: `${start}T00:00:00Z`,
});

const customTariff: TariffSettings = {
  discounted_limit_kwh: 10, discounted_price_ft: 1, market_price_ft: 2,
  feed_in_price_ft: 3, annual_closing_month: 8, annual_closing_day: 4,
  heating_season_start_month: 10, heating_season_start_day: 1,
  heating_season_end_month: 4, heating_season_end_day: 30,
};

describe("energy calculations", () => {
  it("calculates elapsed fractional days", () => {
    expect(elapsedDays("2025-01-01T00:00:00Z", "2025-01-02T12:00:00Z")).toBe(1.5);
  });

  it("calculates deltas between readings", () => {
    expect(readingDelta(
      reading("2025-01-01T00:00:00Z", 100, 40),
      reading("2025-01-03T00:00:00Z", 115, 47),
    )).toEqual({ consumption: 15, production: 7, balance: 8, elapsedDays: 2 });
  });

  it("uses both positive price tiers", () => {
    expect(estimateAmount(3000)).toBeCloseTo(2523 * 36 + 477 * 70.1);
  });

  it("shows production surplus as negative credit", () => {
    expect(estimateAmount(-100)).toBe(-500);
  });

  it("returns the next August 4 closing", () => {
    expect(nextClosingDate(new Date(2025, 7, 5)).getFullYear()).toBe(2026);
  });

  it("uses tariff values received from the database", () => {
    expect(estimateAmount(15, customTariff)).toBe(20);
    expect(estimateAmount(-4, customTariff)).toBe(-12);
  });

  it("projects the year from the latest actual reading, not the system clock", () => {
    const start = "2025-08-05";
    const latestAt = "2025-11-13T00:00:00Z";
    const forecast = annualForecast(period("current", start), [reading(latestAt, 1100, 550)], customTariff);
    expect(forecast.referenceDate.toISOString()).toBe(new Date(latestAt).toISOString());
    expect(forecast.elapsedDays).toBeCloseTo(100);
    expect(forecast.projectedAnnualConsumption).toBeCloseTo(1000 * forecast.totalPeriodDays / 100);
    expect(forecast.projectedBalance).toBeCloseTo(forecast.projectedAnnualConsumption - forecast.projectedAnnualProduction);
    expect(forecast.projectedAmount).toBe(estimateAmount(forecast.projectedBalance, customTariff));
  });

  it("compares the current period with the same elapsed point of the previous period", () => {
    const current = period("current", "2025-08-05");
    const previous = period("previous", "2024-08-05", "closed");
    const comparison = comparePeriodsAtSameElapsedTime(
      current, [reading("2025-11-13T00:00:00Z", 200, 100)],
      previous, [reading("2024-11-13T00:00:00Z", 1100, 550), reading("2025-08-04T00:00:00Z", 1365, 700)],
      customTariff,
    );
    expect(comparison.comparedDays).toBeCloseTo(100);
    expect(comparison.consumptionPercent).toBeCloseTo(0);
    expect(comparison.productionPercent).toBeCloseTo(0);
    expect(comparison.balancePercent).toBeCloseTo(0);
  });
});
