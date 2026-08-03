import { describe, expect, it } from "vitest";
import { monthlyStatistics } from "@/lib/statistics";
import type { MeterReading } from "@/lib/types";
const reading = (id: string, at: string): MeterReading => ({ id, reading_at: at, consumption_meter_kwh: 0, production_meter_kwh: 0, note: null, settlement_period_id: "p", created_at: at, updated_at: at });
describe("monthly meter reading relevance", () => {
  it("records both endpoint readings used by the monthly interval", () => { const rows = [reading("start", "2026-07-01T00:00:00+02:00"), reading("end", "2026-08-01T00:00:00+02:00")], [month] = monthlyStatistics(rows); expect(month.sourceReadingIds).toEqual(["start", "end"]); });
});
