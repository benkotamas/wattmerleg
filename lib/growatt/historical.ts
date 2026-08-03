import { validGrowattTimezone } from "./time";

export const GROWATT_SYNC_MAX_DAYS = 28;
export const GROWATT_HISTORY_MAX_ROWS = 366;
export type GrowattDailyQuality = "complete" | "provisional" | "missing" | "invalid";
export type GrowattDailyEnergyRow = { localDate: string; energyKwh: number; plantTimezone: string; qualityStatus: GrowattDailyQuality; fetchedAt: string; apiLastUpdateAt: string | null };
export type GrowattDailyDatabaseRow = { user_id: string; local_date: string; energy_kwh: number; plant_timezone: string; source: "growatt_openapi_v1"; quality_status: GrowattDailyQuality; fetched_at: string; api_last_update_at: string | null };
type DateRange = { startDate: string; endDate: string };

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
export function validIsoDate(value: string): boolean { const match = DATE.exec(value); if (!match) return false; const date = new Date(Date.UTC(+match[1], +match[2] - 1, +match[3])); return date.getUTCFullYear() === +match[1] && date.getUTCMonth() === +match[2] - 1 && date.getUTCDate() === +match[3]; }
const dateValue = (value: string) => Date.parse(`${value}T00:00:00Z`);
export const addLocalDays = (value: string, days: number) => new Date(dateValue(value) + days * 86_400_000).toISOString().slice(0, 10);
export function inclusiveDays(startDate: string, endDate: string): number { return Math.floor((dateValue(endDate) - dateValue(startDate)) / 86_400_000) + 1; }
export function validateGrowattDateRange(startDate: string, endDate: string, currentLocalDate: string, maxDays = GROWATT_SYNC_MAX_DAYS): number {
  if (!validIsoDate(startDate) || !validIsoDate(endDate) || !validIsoDate(currentLocalDate) || startDate > endDate) throw new Error("INVALID_DATE_RANGE");
  const days = inclusiveDays(startDate, endDate); if (days > maxDays) throw new Error("DATE_RANGE_TOO_LONG"); if (endDate > currentLocalDate) throw new Error("FUTURE_DATE"); return days;
}
export function chunkGrowattDateRange(startDate: string, endDate: string, maxChunkDays = 7): DateRange[] {
  const result: DateRange[] = []; let cursor = startDate;
  while (cursor <= endDate) { const chunkEnd = [addLocalDays(cursor, maxChunkDays - 1), endDate].sort()[0]; result.push({ startDate: cursor, endDate: chunkEnd }); cursor = addLocalDays(chunkEnd, 1); }
  return result;
}

const object = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
function energy(value: unknown): number | null { const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN; return Number.isFinite(parsed) && parsed >= 0 ? parsed : null; }
export function mapGrowattDailyEnergy(raw: unknown, options: { timezone: string | null; currentLocalDate: string; fetchedAt: string }): { rows: GrowattDailyEnergyRow[]; invalidRecords: number; duplicateRecords: number } {
  if (!object(raw) || !Array.isArray(raw.energys) || (raw.time_unit != null && raw.time_unit !== "day")) throw new Error("INVALID_GROWATT_HISTORY_RESPONSE");
  const byDate = new Map<string, GrowattDailyEnergyRow>(); let invalidRecords = 0, duplicateRecords = 0; const plantTimezone = validGrowattTimezone(options.timezone);
  for (const item of raw.energys) { if (!object(item) || !validIsoDate(String(item.date ?? ""))) { invalidRecords++; continue; } const value = energy(item.energy); if (value === null) { invalidRecords++; continue; } const localDate = String(item.date); if (byDate.has(localDate)) duplicateRecords++; byDate.set(localDate, { localDate, energyKwh: value, plantTimezone, qualityStatus: localDate === options.currentLocalDate ? "provisional" : "complete", fetchedAt: options.fetchedAt, apiLastUpdateAt: null }); }
  return { rows: [...byDate.values()], invalidRecords, duplicateRecords };
}
export function dailyDatabaseRow(row: GrowattDailyEnergyRow, userId: string): GrowattDailyDatabaseRow { return { user_id: userId, local_date: row.localDate, energy_kwh: row.energyKwh, plant_timezone: row.plantTimezone, source: "growatt_openapi_v1", quality_status: row.qualityStatus, fetched_at: row.fetchedAt, api_last_update_at: row.apiLastUpdateAt }; }

export type GrowattMonthSummary = { totalEnergyKwh: number; recordCount: number; expectedDays: number; coverageRatio: number; provisionalDays: number; completeDays: number; invalidDays: number; status: "complete" | "in_progress" | "partial"; strongestDay: GrowattDailyEnergyRow | null; dailyAverageKwh: number };
export function summarizeGrowattMonth(rows: GrowattDailyEnergyRow[], startDate: string, endDate: string, currentLocalDate: string): GrowattMonthSummary {
  const expectedDays = inclusiveDays(startDate, endDate), totalEnergyKwh = rows.reduce((sum, row) => sum + row.energyKwh, 0), provisionalDays = rows.filter(row => row.qualityStatus === "provisional").length, completeDays = rows.filter(row => row.qualityStatus === "complete").length, invalidDays = rows.filter(row => row.qualityStatus === "invalid").length;
  const closed = endDate < currentLocalDate, complete = rows.length === expectedDays && invalidDays === 0 && (!closed || provisionalDays === 0);
  return { totalEnergyKwh, recordCount: rows.length, expectedDays, coverageRatio: expectedDays ? rows.length / expectedDays : 0, provisionalDays, completeDays, invalidDays, status: complete ? (closed ? "complete" : "in_progress") : "partial", strongestDay: [...rows].sort((a, b) => b.energyKwh - a.energyKwh)[0] ?? null, dailyAverageKwh: rows.length ? totalEnergyKwh / rows.length : 0 };
}
