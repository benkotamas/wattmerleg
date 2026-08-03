import { monthlyStatistics } from "@/lib/statistics";
import type { MeterReading } from "@/lib/types";
import type { GrowattDailyQuality } from "@/lib/growatt/historical";
import { addCalendarDays, zonedMidnightUtc } from "@/lib/weather/date";
import { analyzeSolarMonth, summarizeSolarPeriod, type SolarMonthAnalysis } from "./consumption-analysis";

export interface SolarPvDailyRow { localDate: string; energyKwh: number; qualityStatus: GrowattDailyQuality; plantTimezone: string }
export interface SolarAnalysisResponse { startMonth: string; endMonth: string; timezone: string; months: SolarMonthAnalysis[]; summary: ReturnType<typeof summarizeSolarPeriod> }

export const METER_MONTH_TIMEZONE = "Europe/Budapest";
export const validYearMonth = (value: string): boolean => /^(19\d{2}|[2-9]\d{3})-(0[1-9]|1[0-2])$/.test(value);
export const monthStart = (month: string): string => `${month}-01`;
const monthIndex = (month: string): number => { const [year, value] = month.split("-").map(Number); return year * 12 + value - 1; };
const monthFromIndex = (index: number): string => `${Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, "0")}`;
export function nextMonth(month: string): string { if (!validYearMonth(month)) throw new Error("INVALID_YEAR_MONTH"); return monthFromIndex(monthIndex(month) + 1); }
export function monthEnd(month: string): string { if (!validYearMonth(month)) throw new Error("INVALID_YEAR_MONTH"); const [year, value] = month.split("-").map(Number), leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0), days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][value - 1]; return `${month}-${days}`; }
export function monthRange(startMonth: string, endMonth: string): string[] { if (!validYearMonth(startMonth) || !validYearMonth(endMonth) || startMonth > endMonth) return []; const start = monthIndex(startMonth), end = monthIndex(endMonth); return Array.from({ length: end - start + 1 }, (_, offset) => monthFromIndex(start + offset)); }

export function buildSolarConsumptionAnalysis(options: { startMonth: string; endMonth: string; currentLocalDate: string; readings: MeterReading[]; pvRows: SolarPvDailyRow[]; meterTimezone?: string }): SolarAnalysisResponse {
  const meterTimezone = options.meterTimezone ?? METER_MONTH_TIMEZONE, currentYearMonth = options.currentLocalDate.slice(0, 7), meterByMonth = new Map(monthlyStatistics(options.readings).map(stat => [stat.month, stat]));
  const months = monthRange(options.startMonth, options.endMonth).map(yearMonth => {
    const meter = meterByMonth.get(yearMonth), rows = options.pvRows.filter(row => row.localDate.startsWith(`${yearMonth}-`)), timezoneValues = [...new Set(rows.map(row => row.plantTimezone))];
    const calendarEnd = monthEnd(yearMonth), current = yearMonth === currentYearMonth, effectiveEnd = current && options.currentLocalDate < calendarEnd ? options.currentLocalDate : calendarEnd;
    const expectedDays = Number(effectiveEnd.slice(8, 10)), production = rows.length ? rows.reduce((sum, row) => sum + row.energyKwh, 0) : null;
    const pvDates = rows.map(row => row.localDate).sort(), pvPeriodStartLocalDate = pvDates[0] ?? null, pvPeriodEndLocalDate = pvDates.at(-1) ?? null;
    const requiredEnd = pvPeriodEndLocalDate ? zonedMidnightUtc(addCalendarDays(pvPeriodEndLocalDate, 1), meterTimezone).getTime() : null;
    const meterEnd = meter ? Date.parse(meter.coverageEndAt) : null;
    return analyzeSolarMonth({ yearMonth, currentYearMonth, meterTimezone, pvTimezone: timezoneValues.length === 1 ? timezoneValues[0] : timezoneValues.length > 1 ? "multiple" : null, meterYearMonth: meter?.month, pvYearMonth: rows[0]?.localDate.slice(0, 7), gridImportKwh: meter?.consumption ?? null, gridExportKwh: meter?.production ?? null, meterDataQuality: !meter ? "missing" : meter.hasDataWarning ? "invalid" : meter.estimated ? "estimated" : "complete", pvProductionKwh: production, pvExpectedDays: expectedDays, pvStoredDays: rows.length, pvCompleteDays: rows.filter(row => row.qualityStatus === "complete").length, pvProvisionalDays: rows.filter(row => row.qualityStatus === "provisional").length, pvMissingDays: rows.filter(row => row.qualityStatus === "missing").length, pvInvalidDays: rows.filter(row => row.qualityStatus === "invalid").length, pvPeriodStartLocalDate, pvPeriodEndLocalDate, meterCoverageStartAt: meter?.coverageStartAt ?? null, meterCoverageEndAt: meter?.coverageEndAt ?? null, meterCoverageStartLocalDate: meter?.coverageStartLocalDate ?? null, meterCoverageEndLocalDate: meter?.coverageEndLocalDate ?? null, meterCoversRequiredStart: meter?.coversCalendarMonthStart ?? false, meterCoversRequiredEnd: current ? requiredEnd !== null && meterEnd === requiredEnd : meter?.fullCalendarMonthCoverage ?? false });
  });
  return { startMonth: options.startMonth, endMonth: options.endMonth, timezone: meterTimezone, months, summary: summarizeSolarPeriod(months) };
}
