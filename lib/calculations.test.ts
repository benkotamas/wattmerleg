import { describe, expect, it } from "vitest";
import { elapsedDays, estimateAmount, nextClosingDate, readingDelta } from "./calculations";
import type { MeterReading } from "./types";

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
});
