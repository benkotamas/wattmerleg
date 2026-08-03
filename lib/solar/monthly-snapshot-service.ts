import { createHash } from "node:crypto";
import type { SolarMonthAnalysis, SolarAnalysisStatus } from "./consumption-analysis";
import { monthRange, validYearMonth } from "./monthly-analysis";

export const SOLAR_MONTHLY_ALGORITHM_VERSION = 1;
export type SolarSnapshotSkipReason = "missing_pv_data" | "incomplete_pv_coverage" | "incomplete_meter_coverage" | "period_mismatch" | "inconsistent_inputs";
export interface SnapshotFingerprintInput { userId: string; yearMonth: string; meterReadingCount: number; meterMaxUpdatedAt: string | null; growattRecordCount: number; growattMaxUpdatedAt: string | null; meterTimezone: string; growattTimezone: string | null; algorithmVersion?: number }
export interface SolarMonthlySnapshot { user_id: string; year_month: string; timezone: string; meter_source: "manual_readings"; grid_import_kwh: number; grid_export_kwh: number; pv_production_kwh: number; self_consumed_pv_kwh: number; total_home_consumption_kwh: number; pv_self_consumption_ratio: number | null; pv_coverage_ratio: number; analysis_status: "complete" | "estimated_meter_allocation"; meter_data_quality: "complete" | "estimated"; pv_expected_days: number; pv_stored_days: number; pv_complete_days: number; pv_provisional_days: number; pv_invalid_days: number; meter_coverage_start_at: string | null; meter_coverage_end_at: string | null; algorithm_version: number; input_fingerprint: string; finalized_at: string; calculated_at: string }

export function relevantMeterRevision(readings: Array<{ id: string; updated_at: string }>, relevantIds: readonly string[]): { meterReadingCount: number; meterMaxUpdatedAt: string | null } {
  const ids = new Set(relevantIds), relevant = readings.filter(row => ids.has(row.id));
  return { meterReadingCount: relevant.length, meterMaxUpdatedAt: relevant.reduce<string | null>((max, row) => !max || row.updated_at > max ? row.updated_at : max, null) };
}
export function validateSnapshotBackfillRange(startMonth: string, endMonth: string, currentMonth: string): { ok: true; months: string[] } | { ok: false; code: "INVALID_MONTH_RANGE" | "MONTH_RANGE_TOO_LONG" | "MONTH_NOT_CLOSED" } {
  if (!validYearMonth(startMonth) || !validYearMonth(endMonth) || startMonth > endMonth) return { ok: false, code: "INVALID_MONTH_RANGE" };
  const months = monthRange(startMonth, endMonth);
  if (months.length > 24) return { ok: false, code: "MONTH_RANGE_TOO_LONG" };
  if (endMonth >= currentMonth) return { ok: false, code: "MONTH_NOT_CLOSED" };
  return { ok: true, months };
}
export function monthlySnapshotFingerprint(input: SnapshotFingerprintInput): string {
  const canonical = { userId: input.userId, yearMonth: input.yearMonth, meterReadingCount: input.meterReadingCount, meterMaxUpdatedAt: input.meterMaxUpdatedAt, growattRecordCount: input.growattRecordCount, growattMaxUpdatedAt: input.growattMaxUpdatedAt, meterTimezone: input.meterTimezone, growattTimezone: input.growattTimezone, algorithmVersion: input.algorithmVersion ?? SOLAR_MONTHLY_ALGORITHM_VERSION };
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}
export const snapshotFingerprintUnchanged = (existingFingerprint: string | null | undefined, nextFingerprint: string): boolean => existingFingerprint === nextFingerprint;
export function snapshotSkipReason(status: SolarAnalysisStatus): SolarSnapshotSkipReason {
  if (status === "missing_pv_data") return "missing_pv_data";
  if (status === "incomplete_pv_coverage") return "incomplete_pv_coverage";
  if (status === "incomplete_meter_coverage" || status === "missing_meter_data") return "incomplete_meter_coverage";
  if (status === "period_mismatch" || status === "timezone_mismatch") return "period_mismatch";
  return "inconsistent_inputs";
}
export function finalizableMonthlySnapshot(options: { analysis: SolarMonthAnalysis; userId: string; currentMonth: string; fingerprint: string; now?: string }): { snapshot: SolarMonthlySnapshot } | { skip: SolarSnapshotSkipReason } {
  const { analysis } = options;
  if (analysis.yearMonth >= options.currentMonth || !(["complete", "estimated_meter_allocation"] as string[]).includes(analysis.status) || analysis.pvStoredDays !== analysis.pvExpectedDays || analysis.pvProvisionalDays > 0 || analysis.pvInvalidDays > 0 || analysis.gridImportKwh === null || analysis.gridExportKwh === null || analysis.pvProductionKwh === null || analysis.selfConsumedPvKwh === null || analysis.totalHomeConsumptionKwh === null || analysis.pvCoverageRatio === null) return { skip: snapshotSkipReason(analysis.status) };
  const now = options.now ?? new Date().toISOString();
  return { snapshot: { user_id: options.userId, year_month: analysis.yearMonth, timezone: analysis.meterTimezone, meter_source: "manual_readings", grid_import_kwh: analysis.gridImportKwh, grid_export_kwh: analysis.gridExportKwh, pv_production_kwh: analysis.pvProductionKwh, self_consumed_pv_kwh: analysis.selfConsumedPvKwh, total_home_consumption_kwh: analysis.totalHomeConsumptionKwh, pv_self_consumption_ratio: analysis.pvSelfConsumptionRatio, pv_coverage_ratio: analysis.pvCoverageRatio, analysis_status: analysis.status as "complete" | "estimated_meter_allocation", meter_data_quality: analysis.meterDataQuality as "complete" | "estimated", pv_expected_days: analysis.pvExpectedDays, pv_stored_days: analysis.pvStoredDays, pv_complete_days: analysis.pvCompleteDays, pv_provisional_days: analysis.pvProvisionalDays, pv_invalid_days: analysis.pvInvalidDays, meter_coverage_start_at: analysis.meterCoverageStartAt, meter_coverage_end_at: analysis.meterCoverageEndAt, algorithm_version: SOLAR_MONTHLY_ALGORITHM_VERSION, input_fingerprint: options.fingerprint, finalized_at: now, calculated_at: now } };
}
