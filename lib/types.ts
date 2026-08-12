export type PeriodStatus = "open" | "closed";

export interface MeterReading {
  id: string;
  reading_at: string;
  consumption_meter_kwh: number;
  production_meter_kwh: number;
  note: string | null;
  settlement_period_id: string;
  created_at: string;
  updated_at: string;
}

export interface SettlementPeriod {
  id: string;
  start_date: string;
  opening_reading_at?: string | null;
  end_date: string | null;
  opening_consumption_meter_kwh: number;
  opening_production_meter_kwh: number;
  closing_consumption_meter_kwh: number | null;
  closing_production_meter_kwh: number | null;
  status: PeriodStatus;
  created_at: string;
}

export interface ReadingDelta {
  consumption: number;
  production: number;
  balance: number;
  elapsedDays: number;
}

export interface PeriodSummary {
  consumption: number;
  production: number;
  balance: number;
  estimatedAmount: number;
  amountBreakdown: BillingAmountBreakdown;
  elapsedDays: number;
  dailyConsumption: number;
  dailyProduction: number;
  projectedAnnualConsumption: number;
  projectedAnnualProduction: number;
}

export interface TariffSettings {
  discounted_limit_kwh: number;
  discounted_price_ft: number;
  market_price_ft: number;
  monthly_base_fee_ft: number;
  feed_in_price_ft: number;
  annual_closing_month: number;
  annual_closing_day: number;
  heating_season_start_month: number;
  heating_season_start_day: number;
  heating_season_end_month: number;
  heating_season_end_day: number;
}

export interface BillingAmountBreakdown {
  billingDays: number;
  discountedQuantityKwh: number;
  discountedFeeFt: number;
  marketQuantityKwh: number;
  marketFeeFt: number;
  baseFeeFt: number;
  feedInCreditFt: number;
  totalFt: number;
}

export interface SettlementBillSnapshot {
  id: string; user_id: string; settlement_period_id: string;
  billing_start_date: string; billing_end_date: string;
  opening_consumption_meter_kwh: number; opening_production_meter_kwh: number;
  closing_consumption_meter_kwh: number; closing_production_meter_kwh: number;
  consumption_kwh: number; production_kwh: number; balance_kwh: number; billing_days: number;
  discounted_quantity_kwh: number; discounted_fee_ft: number; market_quantity_kwh: number; market_fee_ft: number;
  base_fee_ft: number; feed_in_credit_ft: number; calculated_total_ft: number;
  discounted_limit_kwh: number; discounted_price_ft: number; market_price_ft: number;
  monthly_base_fee_ft: number; feed_in_price_ft: number;
  official_total_ft: number | null; invoice_reference: string | null; calculation_version: string;
  snapshotted_at: string; official_updated_at: string | null; created_at: string; updated_at: string;
}

export interface AnnualForecast extends PeriodSummary {
  referenceDate: Date;
  closingDate: Date;
  remainingDays: number;
  totalPeriodDays: number;
  progressPercent: number;
  projectedBalance: number;
  projectedAmount: number;
}

export interface PeriodComparison {
  consumptionPercent: number | null;
  productionPercent: number | null;
  balancePercent: number | null;
  comparedDays: number;
}
