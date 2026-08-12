import { describe, expect, it } from "vitest";
import { annualForecast, billingAmountBreakdown, comparePeriodsAtSameElapsedTime, elapsedDays, estimateAmount, nextClosingDate, periodSummary, readingDelta } from "./calculations";
import type { MeterReading, SettlementPeriod, TariffSettings } from "./types";
import { DEFAULT_TARIFF_SETTINGS } from "./config";

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
  monthly_base_fee_ft: 0,
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

  it("az MVM lezárt időszaki példáját pontosan számolja", () => {
    const result = billingAmountBreakdown(8004, "2025-09-12", "2026-08-07", DEFAULT_TARIFF_SETTINGS);
    expect(result.billingDays).toBe(330);
    expect(result.discountedQuantityKwh).toBeCloseTo(2280.3);
    expect(Math.round(result.totalFt)).toBe(485_480);
  });

  it("shows production surplus as negative credit", () => {
    expect(estimateAmount(-100, "2025-09-12", "2026-08-07")).toBe(-500);
  });

  it("returns the next August 4 closing", () => {
    expect(nextClosingDate(new Date(2025, 7, 5)).getFullYear()).toBe(2026);
  });

  it("uses tariff values received from the database", () => {
    expect(estimateAmount(15, "2025-08-01", "2026-07-31", customTariff)).toBe(20);
    expect(estimateAmount(-4, "2025-08-01", "2026-07-31", customTariff)).toBe(-12);
  });

  it("projects the year from the latest actual reading, not the system clock", () => {
    const start = "2025-08-05";
    const latestAt = "2025-11-13T00:00:00Z";
    const forecast = annualForecast(period("current", start), [reading(latestAt, 1100, 550)], customTariff);
    expect(forecast.referenceDate.toISOString()).toBe(new Date(latestAt).toISOString());
    expect(forecast.elapsedDays).toBeCloseTo(100);
    expect(forecast.projectedAnnualConsumption).toBeCloseTo(1000 * forecast.totalPeriodDays / 100);
    expect(forecast.projectedBalance).toBeCloseTo(forecast.projectedAnnualConsumption - forecast.projectedAnnualProduction);
    expect(forecast.projectedAmount).toBe(estimateAmount(forecast.projectedBalance, start, forecast.closingDate, customTariff));
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

  it("az opening_reading_at pontos időhatára elsődleges, az energia- és tarifaszámítás változatlan", () => {
    const current = {...period("current", "2025-08-07"), opening_reading_at:"2025-08-07T14:00:00Z"};
    const forecast = annualForecast(current,[reading("2025-08-08T14:00:00Z",200,80)],customTariff);
    expect(forecast.elapsedDays).toBe(1);
    expect(forecast.consumption).toBe(100);
    expect(forecast.production).toBe(30);
    expect(forecast.estimatedAmount).toBeCloseTo(126.18);
  });

  it("a szolgáltatói díjat a hivatalos start_date alapján számolja, nem a korábbi nyitó mérésből", () => {
    const closed: SettlementPeriod = {
      id: "mvm-period", start_date: "2025-09-12", opening_reading_at: "2025-08-07T16:00:00+02:00",
      end_date: "2026-08-07", opening_consumption_meter_kwh: 0, opening_production_meter_kwh: 0,
      closing_consumption_meter_kwh: 15_904, closing_production_meter_kwh: 7_900, status: "closed", created_at: "2025-09-12T00:00:00Z",
    };
    const summary = periodSummary(closed, [], DEFAULT_TARIFF_SETTINGS);
    expect(summary.balance).toBe(8_004);
    expect(summary.amountBreakdown.billingDays).toBe(330);
    expect(summary.amountBreakdown.discountedQuantityKwh).toBeCloseTo(2_280.3);
    expect(Math.round(summary.estimatedAmount)).toBe(485_480);
  });

  it("augusztus 1-jén bontja a kedvezményes évet és kezeli a szökőévet", () => {
    const result = billingAmountBreakdown(100, "2023-07-31", "2023-08-02", { ...DEFAULT_TARIFF_SETTINGS, monthly_base_fee_ft: 0 });
    expect(result.billingDays).toBe(3);
    expect(result.discountedQuantityKwh).toBeCloseTo(6.91 + 2 * 6.89);
  });

  it("az alapdíjat a számlázási napokra arányosítja", () => {
    const result = billingAmountBreakdown(0, "2025-09-12", "2026-08-07", DEFAULT_TARIFF_SETTINGS);
    expect(result.baseFeeFt).toBeCloseTo(153.035 * 12 / 365 * 330);
    expect(result.totalFt).toBe(result.baseFeeFt);
  });

  it("érvénytelen időszakot fail-closed módon elutasít", () => {
    expect(() => billingAmountBreakdown(100, "hibás", "2026-08-07")).toThrow("INVALID_BILLING_PERIOD");
    expect(() => billingAmountBreakdown(100, "2026-08-08", "2026-08-07")).toThrow("INVALID_BILLING_PERIOD");
  });
});
