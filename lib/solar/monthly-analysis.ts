import { monthlyStatistics } from "@/lib/statistics";
import type { MeterReading } from "@/lib/types";
import type { GrowattDailyQuality } from "@/lib/growatt/historical";
import { addCalendarDays, zonedMidnightUtc } from "@/lib/weather/date";
import { analyzeSolarMonth, summarizeSolarPeriod, type SolarMonthAnalysis } from "./consumption-analysis";

export interface SolarPvDailyRow { localDate: string; energyKwh: number; qualityStatus: GrowattDailyQuality; plantTimezone: string }
export interface SolarAnalysisResponse { startMonth: string; endMonth: string; timezone: string; months: SolarMonthAnalysis[]; summary: ReturnType<typeof summarizeSolarPeriod> }

export const METER_MONTH_TIMEZONE = "Europe/Budapest";
export const validYearMonth = (value: string): boolean => /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
export const monthStart = (month: string): string => `${month}-01`;
export function nextMonth(month: string): string { const [year, value] = month.split("-").map(Number), date = new Date(Date.UTC(year, value, 1)); return date.toISOString().slice(0, 7); }
export function monthEnd(month: string): string { const [year, value] = month.split("-").map(Number); return new Date(Date.UTC(year, value, 0)).toISOString().slice(0, 10); }
export function monthRange(startMonth: string, endMonth: string): string[] { const result: string[] = []; for (let month = startMonth; month <= endMonth; month = nextMonth(month)) result.push(month); return result; }

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
