import { ENERGY_CONFIG } from "@/lib/config";
import type { MeterReading, PeriodSummary, ReadingDelta, SettlementPeriod } from "@/lib/types";

const DAY_MS = 86_400_000;

export function elapsedDays(from: string | Date, to: string | Date): number {
  const difference = new Date(to).getTime() - new Date(from).getTime();
  return Math.max(difference / DAY_MS, 0);
}

export function readingDelta(previous: MeterReading, current: MeterReading): ReadingDelta {
  const consumption = current.consumption_meter_kwh - previous.consumption_meter_kwh;
  const production = current.production_meter_kwh - previous.production_meter_kwh;
  return {
    consumption,
    production,
    balance: consumption - production,
    elapsedDays: elapsedDays(previous.reading_at, current.reading_at),
  };
}

export function estimateAmount(balanceKwh: number): number {
  if (balanceKwh < 0) return balanceKwh * ENERGY_CONFIG.exportPriceHufPerKwh;
  const discounted = Math.min(balanceKwh, ENERGY_CONFIG.annualDiscountLimitKwh);
  const market = Math.max(balanceKwh - ENERGY_CONFIG.annualDiscountLimitKwh, 0);
  return discounted * ENERGY_CONFIG.discountedPriceHufPerKwh +
    market * ENERGY_CONFIG.marketPriceHufPerKwh;
}

export function periodSummary(
  period: SettlementPeriod,
  readings: MeterReading[],
  now = new Date(),
): PeriodSummary {
  const latest = [...readings].sort(
    (a, b) => new Date(b.reading_at).getTime() - new Date(a.reading_at).getTime(),
  )[0];
  const consumption = Math.max(
    (latest?.consumption_meter_kwh ?? period.opening_consumption_meter_kwh) -
      period.opening_consumption_meter_kwh,
    0,
  );
  const production = Math.max(
    (latest?.production_meter_kwh ?? period.opening_production_meter_kwh) -
      period.opening_production_meter_kwh,
    0,
  );
  const balance = consumption - production;
  const referenceDate = latest ? new Date(latest.reading_at) : now;
  const days = Math.max(elapsedDays(period.start_date, referenceDate), 1);
  const dailyConsumption = consumption / days;
  const dailyProduction = production / days;

  return {
    consumption,
    production,
    balance,
    estimatedAmount: estimateAmount(balance),
    elapsedDays: days,
    dailyConsumption,
    dailyProduction,
    projectedAnnualConsumption: dailyConsumption * 365,
    projectedAnnualProduction: dailyProduction * 365,
  };
}

export function nextClosingDate(from = new Date()): Date {
  const currentYearClosing = new Date(
    from.getFullYear(),
    ENERGY_CONFIG.annualClosingMonth - 1,
    ENERGY_CONFIG.annualClosingDay,
  );
  return from <= currentYearClosing
    ? currentYearClosing
    : new Date(
        from.getFullYear() + 1,
        ENERGY_CONFIG.annualClosingMonth - 1,
        ENERGY_CONFIG.annualClosingDay,
      );
}
