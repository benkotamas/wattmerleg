import { billingAmountBreakdown } from "@/lib/calculations";
import type { EonPeriodOverview } from "@/lib/eon-import/overview";
import type { BillingAmountBreakdown, TariffSettings } from "@/lib/types";

export type FinancialConfidence = "high" | "medium" | "low";
export type FinancialDirection = "payable" | "credit" | "balanced";
export type TariffSource = "database" | "fallback";

export type CurrentFinancialPosition = {
  source: "eon_intervals";
  settlementPeriodId: string;
  periodStartAt: string;
  boundaryPrecision: "exact" | "date_only";
  gridImportKwh: number;
  gridExportKwh: number;
  netGridKwh: number;
  estimatedAmountFt: number;
  amountBreakdown: BillingAmountBreakdown;
  financialDirection: FinancialDirection;
  cutoffAt: string;
  stale: boolean;
  provisional: boolean;
  closedDayCoveragePercent: number;
  completeDays: number;
  provisionalDays: number;
  incompleteDays: number;
  missingClosedDayIntervals: number;
  confidence: FinancialConfidence;
  warnings: string[];
  tariffSource: TariffSource;
};

const BALANCE_EPSILON_KWH = 0.001;

const isNonNegativeInteger = (value: number) => Number.isFinite(value) && Number.isInteger(value) && value >= 0;
const isValidDate = (value: string | null) => typeof value === "string" && value.trim() !== "" && Number.isFinite(Date.parse(value));

export function validateFinancialOverview(overview: EonPeriodOverview): void {
  if (!Number.isFinite(overview.gridImportKwh) || overview.gridImportKwh < 0) throw new Error("INVALID_GRID_IMPORT");
  if (!Number.isFinite(overview.gridExportKwh) || overview.gridExportKwh < 0) throw new Error("INVALID_GRID_EXPORT");
  for (const value of [overview.availableIntervals, overview.expectedClosedDayIntervals, overview.missingClosedDayIntervals, overview.completeDays, overview.provisionalDays, overview.incompleteDays]) {
    if (!isNonNegativeInteger(value)) throw new Error("INVALID_OVERVIEW_COUNT");
  }
  if (!Number.isFinite(overview.closedDayCoveragePercent) || overview.closedDayCoveragePercent < 0 || overview.closedDayCoveragePercent > 100) throw new Error("INVALID_COVERAGE");
  if (!isValidDate(overview.periodStartAt)) throw new Error("INVALID_PERIOD_START");
  if (overview.availableIntervals > 0 && !isValidDate(overview.lastDataAt)) throw new Error("INVALID_CUTOFF");
  if (overview.lastDataAt !== null && !isValidDate(overview.lastDataAt)) throw new Error("INVALID_CUTOFF");
}

export function financialDirection(netGridKwh: number): FinancialDirection {
  if (netGridKwh > BALANCE_EPSILON_KWH) return "payable";
  if (netGridKwh < -BALANCE_EPSILON_KWH) return "credit";
  return "balanced";
}

export function currentFinancialConfidence(
  overview: Pick<EonPeriodOverview, "boundaryPrecision" | "closedDayCoveragePercent" | "incompleteDays" | "missingClosedDayIntervals" | "stale">,
  tariffSource: TariffSource,
): FinancialConfidence {
  if (overview.boundaryPrecision === "date_only" || overview.closedDayCoveragePercent < 95) return "low";
  if (overview.incompleteDays > 0 || overview.missingClosedDayIntervals > 0 || overview.stale || overview.closedDayCoveragePercent < 99.9 || tariffSource === "fallback") return "medium";
  return "high";
}

export function buildCurrentFinancialPosition(args: {
  settlementPeriodId: string;
  billingPeriodStart?: string;
  overview: EonPeriodOverview | null;
  tariff: TariffSettings;
  tariffSource: TariffSource;
}): CurrentFinancialPosition | null {
  const { settlementPeriodId, billingPeriodStart, overview, tariff, tariffSource } = args;
  if (!overview) return null;
  validateFinancialOverview(overview);
  if (overview.availableIntervals === 0 || !overview.lastDataAt) return null;
  if (overview.periodId !== settlementPeriodId) throw new Error("EON_PERIOD_MISMATCH");

  const netGridKwh = overview.gridImportKwh - overview.gridExportKwh;
  if (!Number.isFinite(netGridKwh)) throw new Error("INVALID_NET_GRID");
  const amountBreakdown = billingAmountBreakdown(netGridKwh, billingPeriodStart ?? overview.periodStartAt, overview.lastDataAt, tariff);
  const estimatedAmountFt = amountBreakdown.totalFt;
  if (!Number.isFinite(estimatedAmountFt)) throw new Error("INVALID_ESTIMATED_AMOUNT");
  const warnings = new Set(overview.warnings);
  if (overview.provisionalDays > 0) warnings.add("PROVISIONAL_CURRENT_DAY");
  if (overview.incompleteDays > 0 || overview.missingClosedDayIntervals > 0) warnings.add("INCOMPLETE_CLOSED_DAYS");
  if (overview.stale) warnings.add("STALE_DATA");
  if (overview.boundaryPrecision === "date_only") warnings.add("DATE_ONLY_BOUNDARY");
  if (tariffSource === "fallback") warnings.add("FALLBACK_TARIFF");

  return {
    source: "eon_intervals",
    settlementPeriodId,
    periodStartAt: overview.periodStartAt,
    boundaryPrecision: overview.boundaryPrecision,
    gridImportKwh: overview.gridImportKwh,
    gridExportKwh: overview.gridExportKwh,
    netGridKwh,
    estimatedAmountFt,
    amountBreakdown,
    financialDirection: financialDirection(netGridKwh),
    cutoffAt: overview.lastDataAt,
    stale: overview.stale,
    provisional: overview.provisionalDays > 0,
    closedDayCoveragePercent: overview.closedDayCoveragePercent,
    completeDays: overview.completeDays,
    provisionalDays: overview.provisionalDays,
    incompleteDays: overview.incompleteDays,
    missingClosedDayIntervals: overview.missingClosedDayIntervals,
    confidence: currentFinancialConfidence(overview, tariffSource),
    warnings: [...warnings],
    tariffSource,
  };
}
