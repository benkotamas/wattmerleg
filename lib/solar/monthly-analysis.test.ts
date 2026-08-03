import { describe, expect, it } from "vitest";
import { buildSolarConsumptionAnalysis, monthRange } from "./monthly-analysis";
import type { MeterReading } from "@/lib/types";

const reading = (at: string, consumption: number, production: number): MeterReading => ({ id: at, reading_at: at, consumption_meter_kwh: consumption, production_meter_kwh: production, note: null, settlement_period_id: "period", created_at: at, updated_at: at });
const pvMonth = (month: string, days: number, provisionalLast = false) => Array.from({ length: days }, (_, index) => ({ localDate: `${month}-${String(index + 1).padStart(2, "0")}`, energyKwh: 40, qualityStatus: provisionalLast && index === days - 1 ? "provisional" as const : "complete" as const, plantTimezone: "Europe/Budapest" }));

describe("havi solar adatforrás-összeállítás", () => {
  it("teljes lezárt hónapnál a meglévő havi értékeket változatlanul használja", () => {
    const response = buildSolarConsumptionAnalysis({ startMonth: "2026-07", endMonth: "2026-07", currentLocalDate: "2026-08-03", readings: [reading("2026-07-01T00:00:00+02:00", 1000, 200), reading("2026-08-01T00:00:00+02:00", 1600, 600)], pvRows: pvMonth("2026-07", 31) });
    expect(response.months[0]).toMatchObject({ gridImportKwh: 600, gridExportKwh: 400, pvProductionKwh: 1240, status: "estimated_meter_allocation", meterCoversRequiredStart: true, meterCoversRequiredEnd: true });
  });
  it("első mérés hónap közepén incomplete_meter_coverage", () => { const result = buildSolarConsumptionAnalysis({ startMonth: "2026-07", endMonth: "2026-07", currentLocalDate: "2026-08-03", readings: [reading("2026-07-15T10:00:00+02:00", 1000, 200), reading("2026-08-01T00:00:00+02:00", 1300, 400)], pvRows: pvMonth("2026-07", 31) }); expect(result.months[0].status).toBe("incomplete_meter_coverage"); });
  it("utolsó mérés hónap vége előtt incomplete_meter_coverage", () => { const result = buildSolarConsumptionAnalysis({ startMonth: "2026-07", endMonth: "2026-07", currentLocalDate: "2026-08-03", readings: [reading("2026-07-01T00:00:00+02:00", 1000, 200), reading("2026-07-30T10:00:00+02:00", 1300, 400)], pvRows: pvMonth("2026-07", 31) }); expect(result.months[0].status).toBe("incomplete_meter_coverage"); });
  it("aktuális Growatt 3-áig, mérő csak 2-áig period_mismatch", () => { const result = buildSolarConsumptionAnalysis({ startMonth: "2026-08", endMonth: "2026-08", currentLocalDate: "2026-08-03", readings: [reading("2026-08-01T00:00:00+02:00", 1000, 200), reading("2026-08-03T00:00:00+02:00", 1100, 250)], pvRows: pvMonth("2026-08", 3, true) }); expect(result.months[0].status).toBe("period_mismatch"); });
  it("aktuális hónap azonos, teljes napi végponttal in_progress", () => { const result = buildSolarConsumptionAnalysis({ startMonth: "2026-08", endMonth: "2026-08", currentLocalDate: "2026-08-03", readings: [reading("2026-08-01T00:00:00+02:00", 1000, 200), reading("2026-08-04T00:00:00+02:00", 1100, 250)], pvRows: pvMonth("2026-08", 3, true) }); expect(result.months[0].status).toBe("in_progress"); });
  it("napközbeni mérés nem számít egyező teljes napi végpontnak", () => { const result = buildSolarConsumptionAnalysis({ startMonth: "2026-08", endMonth: "2026-08", currentLocalDate: "2026-08-03", readings: [reading("2026-08-01T00:00:00+02:00", 1000, 200), reading("2026-08-04T10:00:00+02:00", 1100, 250)], pvRows: pvMonth("2026-08", 3, true) }); expect(result.months[0].status).toBe("period_mismatch"); });
  it("legfeljebb 24 hónap listázható pontos naptári sorrendben", () => expect(monthRange("2025-01", "2026-12")).toHaveLength(24));
});
