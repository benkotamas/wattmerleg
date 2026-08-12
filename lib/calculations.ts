import { DEFAULT_TARIFF_SETTINGS } from "@/lib/config";
import type {
  AnnualForecast, MeterReading, PeriodComparison, PeriodSummary,
  ReadingDelta, SettlementPeriod, TariffSettings, BillingAmountBreakdown,
} from "@/lib/types";

const DAY_MS = 86_400_000;

export function elapsedDays(from: string | Date, to: string | Date): number {
  const difference = new Date(to).getTime() - new Date(from).getTime();
  return Math.max(difference / DAY_MS, 0);
}

export function readingDelta(previous: MeterReading, current: MeterReading): ReadingDelta {
  const consumption = current.consumption_meter_kwh - previous.consumption_meter_kwh;
  const production = current.production_meter_kwh - previous.production_meter_kwh;
  return { consumption, production, balance: consumption - production, elapsedDays: elapsedDays(previous.reading_at, current.reading_at) };
}

const BILLING_TIME_ZONE = "Europe/Budapest";
const dateFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: BILLING_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });
const toBillingDate = (value: string | Date) => {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? dateFormatter.format(date) : "";
};
const utcDay = (value: string) => Date.parse(`${value}T00:00:00Z`);
const isoDay = (value: number) => new Date(value).toISOString().slice(0, 10);
const isLeapYear = (year: number) => year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);

function discountYear(date: string) {
  const year = Number(date.slice(0, 4));
  const startsThisYear = date.slice(5) >= "08-01";
  const startYear = startsThisYear ? year : year - 1;
  const days = isLeapYear(startYear + 1) ? 366 : 365;
  return { start: `${startYear}-08-01`, end: `${startYear + 1}-07-31`, days };
}

export function billingAmountBreakdown(
  balanceKwh: number,
  periodStart: string | Date,
  periodEnd: string | Date,
  tariff: TariffSettings = DEFAULT_TARIFF_SETTINGS,
): BillingAmountBreakdown {
  const start = toBillingDate(periodStart), end = toBillingDate(periodEnd);
  const startTime = utcDay(start), endTime = utcDay(end);
  const tariffValues = [tariff.discounted_limit_kwh, tariff.discounted_price_ft, tariff.market_price_ft, tariff.monthly_base_fee_ft, tariff.feed_in_price_ft];
  if (!Number.isFinite(balanceKwh) || !Number.isFinite(startTime) || !Number.isFinite(endTime) || startTime > endTime || tariffValues.some(value => !Number.isFinite(value) || value < 0)) throw new Error("INVALID_BILLING_PERIOD");
  if (balanceKwh < 0) {
    const credit = balanceKwh * tariff.feed_in_price_ft;
    return { billingDays: Math.floor((utcDay(end) - utcDay(start)) / DAY_MS) + 1, discountedQuantityKwh: 0, discountedFeeFt: 0, marketQuantityKwh: 0, marketFeeFt: 0, baseFeeFt: 0, feedInCreditFt: credit, totalFt: credit };
  }
  let cursor = start, allowance = 0, baseFeeFt = 0, billingDays = 0;
  while (utcDay(cursor) <= utcDay(end)) {
    const year = discountYear(cursor);
    const segmentEnd = utcDay(year.end) < utcDay(end) ? year.end : end;
    const days = Math.floor((utcDay(segmentEnd) - utcDay(cursor)) / DAY_MS) + 1;
    const fullYear = cursor === year.start && segmentEnd === year.end;
    allowance += fullYear ? tariff.discounted_limit_kwh : days * (year.days === 366 ? 6.89 : 6.91);
    baseFeeFt += tariff.monthly_base_fee_ft * 12 / year.days * days;
    billingDays += days;
    cursor = isoDay(utcDay(segmentEnd) + DAY_MS);
  }
  const discountedQuantityKwh = Math.min(balanceKwh, allowance);
  const marketQuantityKwh = Math.max(balanceKwh - discountedQuantityKwh, 0);
  const discountedFeeFt = discountedQuantityKwh * tariff.discounted_price_ft;
  const marketFeeFt = marketQuantityKwh * tariff.market_price_ft;
  return { billingDays, discountedQuantityKwh, discountedFeeFt, marketQuantityKwh, marketFeeFt, baseFeeFt, feedInCreditFt: 0, totalFt: discountedFeeFt + marketFeeFt + baseFeeFt };
}

export function estimateAmount(balanceKwh: number, periodStart: string | Date, periodEnd: string | Date, tariff: TariffSettings = DEFAULT_TARIFF_SETTINGS): number {
  return billingAmountBreakdown(balanceKwh, periodStart, periodEnd, tariff).totalFt;
}

function latestReading(readings: MeterReading[]): MeterReading | undefined {
  return [...readings].sort((a, b) => new Date(b.reading_at).getTime() - new Date(a.reading_at).getTime())[0];
}

function periodStartDate(period: SettlementPeriod, readings: MeterReading[]): Date {
  if (period.opening_reading_at) return new Date(period.opening_reading_at);
  const openingReading = [...readings].sort((a, b) => new Date(a.reading_at).getTime() - new Date(b.reading_at).getTime()).find(reading =>
    reading.consumption_meter_kwh === period.opening_consumption_meter_kwh &&
    reading.production_meter_kwh === period.opening_production_meter_kwh,
  );
  return openingReading ? new Date(openingReading.reading_at) : new Date(period.start_date);
}

export function periodSummary(
  period: SettlementPeriod,
  readings: MeterReading[],
  tariff: TariffSettings = DEFAULT_TARIFF_SETTINGS,
  fallbackDate = new Date(),
): PeriodSummary {
  const latest = latestReading(readings);
  const closedConsumption = period.status === "closed" ? period.closing_consumption_meter_kwh : null;
  const closedProduction = period.status === "closed" ? period.closing_production_meter_kwh : null;
  const consumption = Math.max((closedConsumption ?? latest?.consumption_meter_kwh ?? period.opening_consumption_meter_kwh) - period.opening_consumption_meter_kwh, 0);
  const production = Math.max((closedProduction ?? latest?.production_meter_kwh ?? period.opening_production_meter_kwh) - period.opening_production_meter_kwh, 0);
  const balance = consumption - production;
  const referenceDate = period.status === "closed" && period.end_date ? new Date(period.end_date) : latest ? new Date(latest.reading_at) : fallbackDate;
  const days = Math.max(elapsedDays(periodStartDate(period, readings), referenceDate), 1);
  const dailyConsumption = consumption / days;
  const dailyProduction = production / days;
  const amountBreakdown = billingAmountBreakdown(balance, periodStartDate(period, readings), referenceDate, tariff);
  return {
    consumption, production, balance, estimatedAmount: amountBreakdown.totalFt, amountBreakdown, elapsedDays: days,
    dailyConsumption, dailyProduction,
    projectedAnnualConsumption: dailyConsumption * 365,
    projectedAnnualProduction: dailyProduction * 365,
  };
}

export function closingDateForPeriod(
  start: string | Date,
  tariff: TariffSettings = DEFAULT_TARIFF_SETTINGS,
): Date {
  const startDate = new Date(start);
  let closing = new Date(startDate.getFullYear(), tariff.annual_closing_month - 1, tariff.annual_closing_day, 23, 59, 59, 999);
  if (closing <= startDate) closing = new Date(startDate.getFullYear() + 1, tariff.annual_closing_month - 1, tariff.annual_closing_day, 23, 59, 59, 999);
  return closing;
}

export function nextClosingDate(
  from = new Date(),
  tariff: TariffSettings = DEFAULT_TARIFF_SETTINGS,
): Date {
  return closingDateForPeriod(from, tariff);
}

export function annualForecast(
  period: SettlementPeriod,
  readings: MeterReading[],
  tariff: TariffSettings = DEFAULT_TARIFF_SETTINGS,
): AnnualForecast {
  const latest = latestReading(readings);
  const effectiveStart = periodStartDate(period, readings);
  const referenceDate = latest ? new Date(latest.reading_at) : effectiveStart;
  const closingDate = closingDateForPeriod(effectiveStart, tariff);
  const totalPeriodDays = Math.max(elapsedDays(effectiveStart, closingDate), 1);
  const elapsed = Math.min(Math.max(elapsedDays(effectiveStart, referenceDate), 0), totalPeriodDays);
  const calculationDays = Math.max(elapsed, 1);
  const summary = periodSummary(period, readings, tariff, referenceDate);
  const factor = totalPeriodDays / calculationDays;
  const projectedAnnualConsumption = summary.consumption * factor;
  const projectedAnnualProduction = summary.production * factor;
  const projectedBalance = projectedAnnualConsumption - projectedAnnualProduction;
  return {
    ...summary,
    elapsedDays: elapsed,
    referenceDate,
    closingDate,
    remainingDays: Math.max(elapsedDays(referenceDate, closingDate), 0),
    totalPeriodDays,
    progressPercent: Math.min((elapsed / totalPeriodDays) * 100, 100),
    projectedAnnualConsumption,
    projectedAnnualProduction,
    projectedBalance,
    projectedAmount: estimateAmount(projectedBalance, effectiveStart, closingDate, tariff),
  };
}

function valuesAtElapsed(period: SettlementPeriod, readings: MeterReading[], days: number) {
  const effectiveStart = periodStartDate(period, readings);
  const target = new Date(effectiveStart.getTime() + days * DAY_MS);
  const points = [
    { at: effectiveStart, consumption: period.opening_consumption_meter_kwh, production: period.opening_production_meter_kwh },
    ...readings.map(reading => ({ at: new Date(reading.reading_at), consumption: reading.consumption_meter_kwh, production: reading.production_meter_kwh })),
    ...(period.end_date && period.closing_consumption_meter_kwh !== null && period.closing_production_meter_kwh !== null ? [{
      at: new Date(period.end_date), consumption: period.closing_consumption_meter_kwh, production: period.closing_production_meter_kwh,
    }] : []),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());
  const before = [...points].reverse().find(point => point.at <= target) ?? points[0];
  const after = points.find(point => point.at >= target) ?? points.at(-1)!;
  if (before.at.getTime() === after.at.getTime()) return before;
  const ratio = (target.getTime() - before.at.getTime()) / (after.at.getTime() - before.at.getTime());
  return {
    at: target,
    consumption: before.consumption + (after.consumption - before.consumption) * ratio,
    production: before.production + (after.production - before.production) * ratio,
  };
}

const percentChange = (current: number, previous: number): number | null =>
  Math.abs(previous) < 0.000001 ? null : ((current - previous) / Math.abs(previous)) * 100;

export function comparePeriodsAtSameElapsedTime(
  currentPeriod: SettlementPeriod,
  currentReadings: MeterReading[],
  previousPeriod: SettlementPeriod,
  previousReadings: MeterReading[],
  tariff: TariffSettings = DEFAULT_TARIFF_SETTINGS,
): PeriodComparison {
  const current = periodSummary(currentPeriod, currentReadings, tariff);
  const previousEnd = previousPeriod.end_date ? elapsedDays(periodStartDate(previousPeriod, previousReadings), previousPeriod.end_date) : current.elapsedDays;
  const comparedDays = Math.min(current.elapsedDays, previousEnd);
  const previousPoint = valuesAtElapsed(previousPeriod, previousReadings, comparedDays);
  const previousConsumption = previousPoint.consumption - previousPeriod.opening_consumption_meter_kwh;
  const previousProduction = previousPoint.production - previousPeriod.opening_production_meter_kwh;
  const previousBalance = previousConsumption - previousProduction;
  return {
    consumptionPercent: percentChange(current.consumption, previousConsumption),
    productionPercent: percentChange(current.production, previousProduction),
    balancePercent: percentChange(current.balance, previousBalance),
    comparedDays,
  };
}
