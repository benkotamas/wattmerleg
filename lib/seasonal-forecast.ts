import { annualForecast, closingDateForPeriod, elapsedDays, estimateAmount } from "./calculations";
import { monthlyStatistics } from "./statistics";
import type { MeterReading, SettlementPeriod, TariffSettings } from "./types";

const DAY_MS = 86_400_000;
export type ForecastConfidence = "high" | "medium" | "low";

export interface HistoricalMonthAverage {
  month: number;
  consumption: number;
  production: number;
  consumptionSampleCount: number;
  productionSampleCount: number;
  /** Kompatibilitási összesítő; forecast confidence-hez a mérőspecifikus mintaszámot használjuk. */
  sampleCount?: number;
  hasDataWarning?: boolean;
  hasConsumptionWarning?: boolean;
  hasProductionWarning?: boolean;
}

export interface MonthlyForecast {
  month: string;
  label: string;
  shortLabel: string;
  actualConsumption: number | null;
  expectedConsumption: number | null;
  actualProduction: number | null;
  expectedProduction: number | null;
  expectedBalance: number;
  confidence: ForecastConfidence;
  productionReliable: boolean;
}

export interface SeasonalForecast {
  months: MonthlyForecast[];
  consumption: number;
  production: number;
  balance: number;
  estimatedAmount: number;
  confidence: ForecastConfidence;
  productionReliable: boolean;
  historicalYears: number;
}

export interface HeatingSeasonRange { start: Date; end: Date; label: string; active: boolean; }
export interface HeatingSeasonRecord extends HeatingSeasonRange { consumption: number; }
export interface HeatingMonthForecast {
  month: string;
  label: string;
  actualConsumption: number | null;
  expectedConsumption: number | null;
  confidence: ForecastConfidence;
}
export interface HeatingSeasonForecast {
  range: HeatingSeasonRange;
  months: HeatingMonthForecast[];
  actualConsumption: number;
  expectedTotal: number;
  confidence: ForecastConfidence;
  historicalAverage: number | null;
}
export interface HeatingSeasonSummary {
  range: HeatingSeasonRange;
  actualConsumption: number;
  dailyAverage: number;
  monthlyAverage: number;
  previousTotal: number | null;
  changeAtSamePointPercent: number | null;
  expectedTotal: number;
  historicalAverage: number | null;
  forecastConfidence: ForecastConfidence;
  months: HeatingMonthForecast[];
  history: HeatingSeasonRecord[];
}

const keyForDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
const monthLabel = (date: Date) => new Intl.DateTimeFormat("hu-HU", { year: "numeric", month: "long" }).format(date);
const daysInMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();

export function historicalMonthlyAverages(readings: MeterReading[]): HistoricalMonthAverage[] {
  const stats = monthlyStatistics([...readings].sort((a, b) => new Date(a.reading_at).getTime() - new Date(b.reading_at).getTime()));
  const grouped = new Map<number, { consumption: number; production: number; consumptionSampleCount: number; productionSampleCount: number; hasConsumptionWarning: boolean; hasProductionWarning: boolean }>();
  for (const stat of stats) {
    const month = Number(stat.month.slice(5, 7));
    const item = grouped.get(month) ?? { consumption: 0, production: 0, consumptionSampleCount: 0, productionSampleCount: 0, hasConsumptionWarning: false, hasProductionWarning: false };
    if (stat.ignoredConsumptionIntervals === 0) { item.consumption += stat.consumption; item.consumptionSampleCount += 1; }
    else item.hasConsumptionWarning = true;
    if (stat.ignoredProductionIntervals === 0) { item.production += stat.production; item.productionSampleCount += 1; }
    else item.hasProductionWarning = true;
    grouped.set(month, item);
  }
  return [...grouped].map(([month, item]) => ({
    month,
    consumption: item.consumptionSampleCount ? item.consumption / item.consumptionSampleCount : 0,
    production: item.productionSampleCount ? item.production / item.productionSampleCount : 0,
    consumptionSampleCount: item.consumptionSampleCount,
    productionSampleCount: item.productionSampleCount,
    sampleCount: Math.max(item.consumptionSampleCount, item.productionSampleCount),
    hasDataWarning: item.hasConsumptionWarning || item.hasProductionWarning,
    hasConsumptionWarning: item.hasConsumptionWarning,
    hasProductionWarning: item.hasProductionWarning,
  })).sort((a, b) => a.month - b.month);
}

export function historicalMonthEstimate(month: number, averages: HistoricalMonthAverage[], dailyFallback: number, kind: "consumption" | "production") {
  const exact = averages.find(item => item.month === month);
  const relevantCount = exact ? (kind === "consumption" ? exact.consumptionSampleCount : exact.productionSampleCount) ?? exact.sampleCount ?? 0 : 0;
  if (exact && relevantCount > 0) {
    return { value: exact[kind], confidence: relevantCount >= 2 ? "high" as const : "medium" as const, samples: relevantCount };
  }
  for (const distance of [1, 2]) {
    const nearby = averages.filter(item => {
      const circular = Math.min(Math.abs(item.month - month), 12 - Math.abs(item.month - month));
      const count = (kind === "consumption" ? item.consumptionSampleCount : item.productionSampleCount) ?? item.sampleCount ?? 0;
      return circular === distance && count > 0;
    });
    if (nearby.length) return { value: nearby.reduce((sum, item) => sum + item[kind], 0) / nearby.length, confidence: "low" as const, samples: 0 };
  }
  return { value: dailyFallback * 30.4375, confidence: "low" as const, samples: 0 };
}

function effectiveStart(period: SettlementPeriod, readings: MeterReading[]) {
  if (period.opening_reading_at) return new Date(period.opening_reading_at);
  return [...readings].sort((a, b) => new Date(a.reading_at).getTime() - new Date(b.reading_at).getTime()).find(reading => reading.consumption_meter_kwh === period.opening_consumption_meter_kwh && reading.production_meter_kwh === period.opening_production_meter_kwh)?.reading_at ?? period.start_date;
}

export function seasonalAnnualForecast(
  period: SettlementPeriod,
  currentReadings: MeterReading[],
  allReadings: MeterReading[],
  tariff: TariffSettings,
): SeasonalForecast {
  const sortedCurrent = [...currentReadings].sort((a, b) => new Date(a.reading_at).getTime() - new Date(b.reading_at).getTime());
  const start = new Date(effectiveStart(period, sortedCurrent));
  const latest = sortedCurrent.at(-1);
  const reference = latest ? new Date(latest.reading_at) : start;
  const closing = closingDateForPeriod(start, tariff);
  const historical = allReadings.filter(reading => new Date(reading.reading_at) < start);
  const averages = historicalMonthlyAverages(historical);
  const linear = annualForecast(period, currentReadings, tariff);
  const actualStats = new Map(monthlyStatistics(sortedCurrent).map(stat => [stat.month, stat]));
  const months: MonthlyForecast[] = [];
  let cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const lastMonth = new Date(closing.getFullYear(), closing.getMonth(), 1);
  while (cursor <= lastMonth) {
    const key = keyForDate(cursor);
    const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    const segmentStart = monthStart < start ? start : monthStart;
    const segmentEnd = monthEnd > closing ? closing : monthEnd;
    const actual = actualStats.get(key);
    const consumptionEstimate = historicalMonthEstimate(cursor.getMonth() + 1, averages, linear.dailyConsumption, "consumption");
    const productionEstimate = historicalMonthEstimate(cursor.getMonth() + 1, averages, linear.dailyProduction, "production");
    const futureStart = reference > segmentStart ? reference : segmentStart;
    const futureDays = Math.max(elapsedDays(futureStart, segmentEnd), 0);
    const completed = segmentEnd <= reference;
    const actualConsumption = actual?.consumption ?? (completed ? 0 : null);
    const actualProduction = actual?.production ?? (completed ? 0 : null);
    const expectedConsumption = completed ? null : consumptionEstimate.value * futureDays / daysInMonth(cursor);
    const expectedProduction = completed ? null : productionEstimate.value * futureDays / daysInMonth(cursor);
    const totalConsumption = (actualConsumption ?? 0) + (expectedConsumption ?? 0);
    const totalProduction = (actualProduction ?? 0) + (expectedProduction ?? 0);
    const confidence = consumptionEstimate.confidence;
    months.push({ month: key, label: monthLabel(cursor), shortLabel: new Intl.DateTimeFormat("hu-HU", { year: "2-digit", month: "short" }).format(cursor), actualConsumption, expectedConsumption, actualProduction, expectedProduction, expectedBalance: totalConsumption - totalProduction, confidence, productionReliable: productionEstimate.confidence !== "low" });
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }
  const consumption = months.reduce((sum, month) => sum + (month.actualConsumption ?? 0) + (month.expectedConsumption ?? 0), 0);
  const production = months.reduce((sum, month) => sum + (month.actualProduction ?? 0) + (month.expectedProduction ?? 0), 0);
  const confidences = months.filter(month => month.expectedConsumption !== null).map(month => month.confidence);
  const confidence: ForecastConfidence = confidences.includes("low") ? "low" : confidences.includes("medium") ? "medium" : "high";
  const historicalYears = new Set(historical.map(reading => new Date(reading.reading_at).getFullYear())).size;
  return { months, consumption, production, balance: consumption - production, estimatedAmount: estimateAmount(consumption - production, tariff), confidence, productionReliable: months.every(month => month.expectedProduction === null || month.productionReliable), historicalYears };
}

export function maxConfigurableDay(month: number): number {
  return [1, 3, 5, 7, 8, 10, 12].includes(month) ? 31 : month === 2 ? 29 : 30;
}

export function isValidMonthDay(month: number, day: number): boolean {
  return Number.isInteger(month) && Number.isInteger(day) && month >= 1 && month <= 12 && day >= 1 && day <= maxConfigurableDay(month);
}

function dateAt(year: number, month: number, day: number, end = false) {
  if (!isValidMonthDay(month, day)) throw new Error(`Érvénytelen hónap/nap beállítás: ${month}/${day}`);
  // Február 29 évfüggetlenül konfigurálható; nem szökőévben február 28-ra clampeljük.
  const actualDay = Math.min(day, new Date(year, month, 0).getDate());
  return new Date(year, month - 1, actualDay, end ? 23 : 0, end ? 59 : 0, end ? 59 : 0, end ? 999 : 0);
}
function monthDay(date: Date) { return (date.getMonth() + 1) * 100 + date.getDate(); }

export function heatingSeasonForDate(date: Date, tariff: TariffSettings): HeatingSeasonRange {
  const startCode = tariff.heating_season_start_month * 100 + tariff.heating_season_start_day;
  const endCode = tariff.heating_season_end_month * 100 + tariff.heating_season_end_day;
  const crossesYear = startCode > endCode;
  let startYear: number;
  let active = false;
  if (crossesYear) {
    if (monthDay(date) >= startCode) { startYear = date.getFullYear(); active = true; }
    else if (monthDay(date) <= endCode) { startYear = date.getFullYear() - 1; active = true; }
    else startYear = date.getFullYear();
  } else {
    active = monthDay(date) >= startCode && monthDay(date) <= endCode;
    startYear = monthDay(date) > endCode ? date.getFullYear() + 1 : date.getFullYear();
  }
  const endYear = crossesYear ? startYear + 1 : startYear;
  const start = dateAt(startYear, tariff.heating_season_start_month, tariff.heating_season_start_day);
  const end = dateAt(endYear, tariff.heating_season_end_month, tariff.heating_season_end_day, true);
  return { start, end, label: `${startYear}/${endYear}`, active };
}

function meterAt(readings: MeterReading[], date: Date): number | null {
  const points = [...readings].sort((a, b) => new Date(a.reading_at).getTime() - new Date(b.reading_at).getTime());
  const before = [...points].reverse().find(reading => new Date(reading.reading_at) <= date);
  const after = points.find(reading => new Date(reading.reading_at) >= date);
  if (!before || !after) return null;
  const beforeTime = new Date(before.reading_at).getTime(), afterTime = new Date(after.reading_at).getTime();
  if (beforeTime === afterTime) return before.consumption_meter_kwh;
  const ratio = (date.getTime() - beforeTime) / (afterTime - beforeTime);
  return before.consumption_meter_kwh + (after.consumption_meter_kwh - before.consumption_meter_kwh) * ratio;
}

export function consumptionBetween(readings: MeterReading[], start: Date, end: Date): number | null {
  const opening = meterAt(readings, start), closing = meterAt(readings, end);
  return opening === null || closing === null ? null : Math.max(closing - opening, 0);
}

function completedHeatingSeasons(readings: MeterReading[], before: Date, tariff: TariffSettings): HeatingSeasonRecord[] {
  const earliest = readings.length ? new Date([...readings].sort((a, b) => new Date(a.reading_at).getTime() - new Date(b.reading_at).getTime())[0].reading_at) : before;
  const result: HeatingSeasonRecord[] = [];
  for (let year = earliest.getFullYear() - 1; year <= before.getFullYear(); year++) {
    const probe = dateAt(year, tariff.heating_season_start_month, tariff.heating_season_start_day);
    const range = heatingSeasonForDate(probe, tariff);
    if (range.end >= before) continue;
    const consumption = consumptionBetween(readings, range.start, range.end);
    if (consumption !== null) result.push({ ...range, active: false, consumption });
  }
  return result;
}

export function heatingSeasonForecastFromAverages(
  readings: MeterReading[],
  reference: Date,
  range: HeatingSeasonRange,
  averages: HistoricalMonthAverage[],
  dailyFallback: number,
  historicalAverage: number | null = null,
): HeatingSeasonForecast {
  const months: HeatingMonthForecast[] = [];
  let cursor = new Date(range.start.getFullYear(), range.start.getMonth(), 1);
  const lastMonth = new Date(range.end.getFullYear(), range.end.getMonth(), 1);
  while (cursor <= lastMonth) {
    const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    const segmentStart = monthStart < range.start ? range.start : monthStart;
    const segmentEnd = monthEnd > range.end ? range.end : monthEnd;
    const estimate = historicalMonthEstimate(cursor.getMonth() + 1, averages, dailyFallback, "consumption");
    let actualConsumption: number | null = null;
    let expectedConsumption: number | null = null;
    if (range.active && reference >= segmentStart) {
      const actualEnd = reference < segmentEnd ? reference : segmentEnd;
      actualConsumption = consumptionBetween(readings, segmentStart, actualEnd) ?? 0;
      if (reference < segmentEnd) expectedConsumption = estimate.value * elapsedDays(reference, segmentEnd) / daysInMonth(cursor);
    } else {
      expectedConsumption = estimate.value * elapsedDays(segmentStart, segmentEnd) / daysInMonth(cursor);
    }
    months.push({ month: keyForDate(cursor), label: monthLabel(cursor), actualConsumption, expectedConsumption, confidence: estimate.confidence });
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }
  const actualConsumption = months.reduce((sum, month) => sum + (month.actualConsumption ?? 0), 0);
  const expectedTotal = months.reduce((sum, month) => sum + (month.actualConsumption ?? 0) + (month.expectedConsumption ?? 0), 0);
  const confidences = months.filter(month => month.expectedConsumption !== null).map(month => month.confidence);
  const confidence: ForecastConfidence = confidences.includes("low") ? "low" : confidences.includes("medium") ? "medium" : "high";
  return { range, months, actualConsumption, expectedTotal, confidence, historicalAverage };
}

export function heatingSeasonForecast(readings: MeterReading[], reference: Date, tariff: TariffSettings): HeatingSeasonForecast {
  const range = heatingSeasonForDate(reference, tariff);
  const historyBeforeSeason = readings.filter(reading => new Date(reading.reading_at) < range.start);
  const averages = historicalMonthlyAverages(historyBeforeSeason);
  const sorted = [...readings].sort((a, b) => new Date(a.reading_at).getTime() - new Date(b.reading_at).getTime());
  const first = sorted[0], last = sorted.at(-1);
  const overallDays = first && last ? Math.max(elapsedDays(first.reading_at, last.reading_at), 1) : 1;
  const dailyFallback = first && last ? Math.max(last.consumption_meter_kwh - first.consumption_meter_kwh, 0) / overallDays : 0;
  const completed = completedHeatingSeasons(readings, range.start, tariff);
  const historicalAverage = completed.length ? completed.reduce((sum, season) => sum + season.consumption, 0) / completed.length : null;
  return heatingSeasonForecastFromAverages(readings, reference, range, averages, dailyFallback, historicalAverage);
}

export function heatingSeasonStatistics(readings: MeterReading[], reference: Date, tariff: TariffSettings): HeatingSeasonSummary {
  const range = heatingSeasonForDate(reference, tariff);
  const forecast = heatingSeasonForecast(readings, reference, tariff);
  const history = completedHeatingSeasons(readings, range.start, tariff);
  const actualEnd = range.active && reference < range.end ? reference : range.start;
  const actualConsumption = forecast.actualConsumption;
  const elapsed = range.active ? Math.max(elapsedDays(range.start, actualEnd), 1) : 0;
  const previous = history.at(-1);
  const previousPoint = previous && range.active ? consumptionBetween(readings, previous.start, new Date(Math.min(previous.start.getTime() + elapsed * DAY_MS, previous.end.getTime()))) : null;
  const changeAtSamePointPercent = previousPoint && previousPoint !== 0 ? ((actualConsumption - previousPoint) / Math.abs(previousPoint)) * 100 : null;
  return { range, actualConsumption, dailyAverage: range.active ? actualConsumption / Math.max(elapsed, 1) : 0, monthlyAverage: range.active ? actualConsumption / Math.max(elapsed / 30.4375, 1) : 0, previousTotal: previous?.consumption ?? null, changeAtSamePointPercent, expectedTotal: forecast.expectedTotal, historicalAverage: forecast.historicalAverage, forecastConfidence: forecast.confidence, months: forecast.months, history };
}
