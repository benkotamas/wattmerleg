import { describe, expect, it } from "vitest";
import { buildSettlementBillSnapshot, normalizeInvoiceReference, normalizeOfficialTotal, officialDifference } from "./snapshots";
import { DEFAULT_TARIFF_SETTINGS } from "@/lib/config";
import type { SettlementPeriod } from "@/lib/types";

const officialPeriod: SettlementPeriod = {
  id: "fab20e8d-760d-431e-8e70-bf3617137d3f", start_date: "2025-09-12", opening_reading_at: "2025-09-11T22:00:00Z", end_date: "2026-08-07",
  opening_consumption_meter_kwh: 94_801, opening_production_meter_kwh: 37_146,
  closing_consumption_meter_kwh: 110_705, closing_production_meter_kwh: 45_046,
  status: "closed", created_at: "2025-09-12T00:00:00Z",
};

describe("settlement bill snapshots", () => {
  it("az elfogadott MVM-időszakot és tarifát teljesen befagyasztja", () => {
    const snapshot = buildSettlementBillSnapshot("owner", officialPeriod, DEFAULT_TARIFF_SETTINGS);
    expect(snapshot).toMatchObject({ billing_start_date: "2025-09-12", billing_end_date: "2026-08-07", consumption_kwh: 15_904, production_kwh: 7_900, balance_kwh: 8_004, billing_days: 330, discounted_limit_kwh: 2_523, discounted_price_ft: 36.208, market_price_ft: 70.104, monthly_base_fee_ft: 153.035, calculation_version: "mvm-2026-v1" });
    expect(snapshot.discounted_quantity_kwh).toBeCloseTo(2_280.3);
    expect(Math.round(snapshot.calculated_total_ft)).toBe(485_480);
  });
  it("nyitott időszakról nem készít lezárt pillanatképet", () => expect(() => buildSettlementBillSnapshot("owner", { ...officialPeriod, status: "open", end_date: null }, DEFAULT_TARIFF_SETTINGS)).toThrow("BILLING_PERIOD_NOT_CLOSED"));
  it("az MVM és számított összeg előjeles különbségét adja", () => {
    expect(officialDifference({ official_total_ft: 485_480, calculated_total_ft: 485_479.692 })).toBeCloseTo(0.308);
    expect(officialDifference({ official_total_ft: null, calculated_total_ft: 485_479.692 })).toBeNull();
  });
  it("normalizálja és korlátozza a kézzel megadott számlaadatokat", () => {
    expect(normalizeOfficialTotal(485_480)).toBe(485_480); expect(normalizeOfficialTotal(null)).toBeNull();
    expect(() => normalizeOfficialTotal(Number.NaN)).toThrow("INVALID_OFFICIAL_TOTAL");
    expect(normalizeInvoiceReference(" 845803512147 ")).toBe("845803512147"); expect(normalizeInvoiceReference("  ")).toBeNull();
    expect(() => normalizeInvoiceReference("x".repeat(101))).toThrow("INVALID_INVOICE_REFERENCE");
  });
});
