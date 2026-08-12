import { periodSummary } from "@/lib/calculations";
import type { SettlementBillSnapshot, SettlementPeriod, TariffSettings } from "@/lib/types";

export const BILLING_CALCULATION_VERSION = "mvm-2026-v1";
export type SettlementBillSnapshotInsert = Omit<SettlementBillSnapshot, "id" | "created_at" | "updated_at" | "snapshotted_at" | "official_updated_at" | "official_total_ft" | "invoice_reference">;

export function buildSettlementBillSnapshot(userId: string, period: SettlementPeriod, tariff: TariffSettings): SettlementBillSnapshotInsert {
  if (period.status !== "closed" || !period.end_date || period.closing_consumption_meter_kwh === null || period.closing_production_meter_kwh === null) throw new Error("BILLING_PERIOD_NOT_CLOSED");
  const summary = periodSummary(period, [], tariff), breakdown = summary.amountBreakdown;
  return {
    user_id: userId, settlement_period_id: period.id,
    billing_start_date: period.start_date, billing_end_date: period.end_date,
    opening_consumption_meter_kwh: period.opening_consumption_meter_kwh,
    opening_production_meter_kwh: period.opening_production_meter_kwh,
    closing_consumption_meter_kwh: period.closing_consumption_meter_kwh,
    closing_production_meter_kwh: period.closing_production_meter_kwh,
    consumption_kwh: summary.consumption, production_kwh: summary.production, balance_kwh: summary.balance,
    billing_days: breakdown.billingDays, discounted_quantity_kwh: breakdown.discountedQuantityKwh,
    discounted_fee_ft: breakdown.discountedFeeFt, market_quantity_kwh: breakdown.marketQuantityKwh,
    market_fee_ft: breakdown.marketFeeFt, base_fee_ft: breakdown.baseFeeFt,
    feed_in_credit_ft: breakdown.feedInCreditFt, calculated_total_ft: breakdown.totalFt,
    discounted_limit_kwh: tariff.discounted_limit_kwh, discounted_price_ft: tariff.discounted_price_ft,
    market_price_ft: tariff.market_price_ft, monthly_base_fee_ft: tariff.monthly_base_fee_ft,
    feed_in_price_ft: tariff.feed_in_price_ft, calculation_version: BILLING_CALCULATION_VERSION,
  };
}

export function officialDifference(snapshot: Pick<SettlementBillSnapshot, "official_total_ft" | "calculated_total_ft">): number | null {
  return snapshot.official_total_ft === null ? null : snapshot.official_total_ft - snapshot.calculated_total_ft;
}

export function normalizeInvoiceReference(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw new Error("INVALID_INVOICE_REFERENCE");
  const normalized = value.trim();
  if (normalized.length > 100) throw new Error("INVALID_INVOICE_REFERENCE");
  return normalized || null;
}

export function normalizeOfficialTotal(value: unknown): number | null {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > 99_999_999_999) throw new Error("INVALID_OFFICIAL_TOTAL");
  return value;
}
