import type { MeterReading } from "./types";
import { readingDelta } from "./calculations";
import { localIsoDate, zonedMidnightUtc } from "./weather/date";

export interface MonthlyStat {
  month: string;
  label: string;
  shortLabel: string;
  consumption: number;
  production: number;
  balance: number;
  estimated: boolean;
  hasDataWarning: boolean;
  ignoredConsumptionIntervals: number;
  ignoredProductionIntervals: number;
  coverageStartAt: string;
  coverageEndAt: string;
  coverageStartLocalDate: string;
  coverageEndLocalDate: string;
  coversCalendarMonthStart: boolean;
  coversRequiredPeriodEnd: boolean;
  fullCalendarMonthCoverage: boolean;
  sourceIntervalCount: number;
}

function followingMonth(month: string): string { const [year, value] = month.split("-").map(Number); return `${year + (value === 12 ? 1 : 0)}-${String(value === 12 ? 1 : value + 1).padStart(2, "0")}`; }

export function monthlyStatistics(readings: MeterReading[], timeZone = "Europe/Budapest"): MonthlyStat[] {
  const result = new Map<string, MonthlyStat>();
  for (let index = 1; index < readings.length; index++) {
    const previous = readings[index - 1], current = readings[index];
    const delta = readingDelta(previous, current);
    if (delta.elapsedDays <= 0) continue;
    let cursor = new Date(previous.reading_at);
    const end = new Date(current.reading_at);
    const endMonth = localIsoDate(end, timeZone).slice(0, 7);
    while (cursor < end) {
      const key = localIsoDate(cursor, timeZone).slice(0, 7);
      const monthEnd = zonedMidnightUtc(`${followingMonth(key)}-01`, timeZone);
      const segmentEnd = monthEnd < end ? monthEnd : end;
      const segmentDays = (segmentEnd.getTime() - cursor.getTime()) / 86_400_000;
      const stat = result.get(key) ?? {
        month: key,
        label: new Intl.DateTimeFormat("hu-HU", { year: "numeric", month: "long", timeZone }).format(cursor),
        shortLabel: new Intl.DateTimeFormat("hu-HU", { year: "numeric", month: "short", timeZone }).format(cursor),
        consumption: 0, production: 0, balance: 0, estimated: false,
        hasDataWarning: false, ignoredConsumptionIntervals: 0, ignoredProductionIntervals: 0,
        coverageStartAt: cursor.toISOString(), coverageEndAt: segmentEnd.toISOString(), coverageStartLocalDate: localIsoDate(cursor, timeZone), coverageEndLocalDate: localIsoDate(segmentEnd, timeZone),
        coversCalendarMonthStart: false, coversRequiredPeriodEnd: false, fullCalendarMonthCoverage: false, sourceIntervalCount: 0,
      };
      const ratio = segmentDays / delta.elapsedDays;
      if (delta.consumption >= 0) stat.consumption += delta.consumption * ratio;
      else { stat.hasDataWarning = true; stat.ignoredConsumptionIntervals += 1; }
      if (delta.production >= 0) stat.production += delta.production * ratio;
      else { stat.hasDataWarning = true; stat.ignoredProductionIntervals += 1; }
      stat.balance = stat.consumption - stat.production;
      stat.estimated ||= key !== endMonth;
      if (cursor.getTime() < Date.parse(stat.coverageStartAt)) { stat.coverageStartAt = cursor.toISOString(); stat.coverageStartLocalDate = localIsoDate(cursor, timeZone); }
      if (segmentEnd.getTime() > Date.parse(stat.coverageEndAt)) { stat.coverageEndAt = segmentEnd.toISOString(); stat.coverageEndLocalDate = localIsoDate(segmentEnd, timeZone); }
      stat.sourceIntervalCount += 1;
      result.set(key, stat);
      cursor = segmentEnd;
    }
  }
  return [...result.values()].map(stat => { const start = zonedMidnightUtc(`${stat.month}-01`, timeZone).getTime(), end = zonedMidnightUtc(`${followingMonth(stat.month)}-01`, timeZone).getTime(); stat.coversCalendarMonthStart = Date.parse(stat.coverageStartAt) <= start; stat.coversRequiredPeriodEnd = Date.parse(stat.coverageEndAt) >= end; stat.fullCalendarMonthCoverage = stat.coversCalendarMonthStart && stat.coversRequiredPeriodEnd; return stat; }).sort((a, b) => a.month.localeCompare(b.month));
}
