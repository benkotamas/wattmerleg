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
  elapsedDays: number;
  dailyConsumption: number;
  dailyProduction: number;
  projectedAnnualConsumption: number;
  projectedAnnualProduction: number;
}
