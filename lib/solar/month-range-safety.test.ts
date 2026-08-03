import { describe, expect, it } from "vitest";
import { monthRange, nextMonth } from "./monthly-analysis";
describe("safe year-month arithmetic", () => {
  it("handles supported upper boundaries without Date/toISOString", () => expect(monthRange("9999-11", "9999-12")).toEqual(["9999-11", "9999-12"]));
  it("returns a controlled result for invalid ranges", () => { expect(monthRange("bad", "9999-12")).toEqual([]); expect(() => nextMonth("bad")).toThrow("INVALID_YEAR_MONTH"); });
  it("rejects years before 1900 and calculates Gregorian leap days arithmetically", async () => { const { monthEnd, validYearMonth } = await import("./monthly-analysis"); expect(validYearMonth("0000-01")).toBe(false); expect(validYearMonth("1899-12")).toBe(false); expect(validYearMonth("1900-01")).toBe(true); expect(monthEnd("2000-02")).toBe("2000-02-29"); expect(monthEnd("2100-02")).toBe("2100-02-28"); });
});
