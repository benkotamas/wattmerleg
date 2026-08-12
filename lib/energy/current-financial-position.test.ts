import { describe, expect, it } from "vitest";
import { estimateAmount } from "@/lib/calculations";
import { DEFAULT_TARIFF_SETTINGS } from "@/lib/config";
import type { EonPeriodOverview } from "@/lib/eon-import/overview";
import { buildCurrentFinancialPosition, currentFinancialConfidence, financialDirection } from "./current-financial-position";

const overview = (patch: Partial<EonPeriodOverview> = {}): EonPeriodOverview => ({
  periodId: "period-1", periodStartAt: "2026-08-04T14:00:00Z", boundaryPrecision: "exact",
  gridImportKwh: 100, gridExportKwh: 20, netGridKwh: 80, availableIntervals: 96,
  expectedClosedDayIntervals: 96, missingClosedDayIntervals: 0, closedDayCoveragePercent: 100,
  completeDays: 1, provisionalDays: 0, incompleteDays: 0, fallDstLimitedDays: 0,
  lastDataAt: "2026-08-05T10:00:00Z", stale: false, warnings: [], incompleteDates: [], ...patch,
});

describe("current financial position", () => {
  it("az E.ON import/export nettóját a közös estimateAmount függvénnyel számolja", () => {
    const result = buildCurrentFinancialPosition({ settlementPeriodId: "period-1", overview: overview(), tariff: DEFAULT_TARIFF_SETTINGS, tariffSource: "database" })!;
    expect(result.netGridKwh).toBe(80);
    expect(result.estimatedAmountFt).toBe(estimateAmount(80, overview().periodStartAt, overview().lastDataAt!, DEFAULT_TARIFF_SETTINGS));
    expect(result.source).toBe("eon_intervals");
    expect(result).not.toHaveProperty("growattProductionKwh");
  });
  it("payable, credit és epsilonon belül balanced irányt ad", () => {
    expect(financialDirection(1)).toBe("payable");
    expect(financialDirection(-1)).toBe("credit");
    expect(financialDirection(0.0005)).toBe("balanced");
  });
  it("a provisional napot beleszámítja és jelzi", () => {
    const result = buildCurrentFinancialPosition({ settlementPeriodId: "period-1", overview: overview({ provisionalDays: 1 }), tariff: DEFAULT_TARIFF_SETTINGS, tariffSource: "database" })!;
    expect(result.gridImportKwh).toBe(100);
    expect(result.provisional).toBe(true);
    expect(result.warnings).toContain("PROVISIONAL_CURRENT_DAY");
    expect(result.confidence).toBe("high");
  });
  it("hiányos lezárt napnál számol, warningot ad és nem high", () => {
    const result = buildCurrentFinancialPosition({ settlementPeriodId: "period-1", overview: overview({ incompleteDays: 1, missingClosedDayIntervals: 4, closedDayCoveragePercent: 98 }), tariff: DEFAULT_TARIFF_SETTINGS, tariffSource: "database" })!;
    expect(result.estimatedAmountFt).toBeGreaterThan(0);
    expect(result.warnings).toContain("INCOMPLETE_CLOSED_DAYS");
    expect(result.confidence).toBe("medium");
  });
  it("stale és fallback tarifát jelzi, jelentős hiány vagy date-only low", () => {
    const result = buildCurrentFinancialPosition({ settlementPeriodId: "period-1", overview: overview({ stale: true }), tariff: DEFAULT_TARIFF_SETTINGS, tariffSource: "fallback" })!;
    expect(result.warnings).toEqual(expect.arrayContaining(["STALE_DATA", "FALLBACK_TARIFF"]));
    expect(result.confidence).toBe("medium");
    expect(currentFinancialConfidence(overview({ boundaryPrecision: "date_only" }), "database")).toBe("low");
    expect(currentFinancialConfidence(overview({ closedDayCoveragePercent: 90 }), "database")).toBe("low");
  });
  it("használható E.ON-adat nélkül null", () => {
    expect(buildCurrentFinancialPosition({ settlementPeriodId: "period-1", overview: null, tariff: DEFAULT_TARIFF_SETTINGS, tariffSource: "database" })).toBeNull();
    expect(buildCurrentFinancialPosition({ settlementPeriodId: "period-1", overview: overview({ availableIntervals: 0, lastDataAt: null }), tariff: DEFAULT_TARIFF_SETTINGS, tariffSource: "database" })).toBeNull();
  });
  it.each([
    ["hiányzó numeric mező", { gridImportKwh: undefined as unknown as number }],
    ["null numeric mező", { gridImportKwh: null as unknown as number }],
    ["NaN", { gridImportKwh: Number.NaN }],
    ["Infinity", { gridExportKwh: Number.POSITIVE_INFINITY }],
    ["negatív import", { gridImportKwh: -1 }],
    ["negatív export", { gridExportKwh: -1 }],
    ["negatív coverage", { closedDayCoveragePercent: -1 }],
    ["100 feletti coverage", { closedDayCoveragePercent: 101 }],
    ["érvénytelen cutoff", { lastDataAt: "nem-dátum" }],
    ["tört intervallumszám", { availableIntervals: 1.5 }],
  ])("fail-closed: %s", (_name, patch) => {
    expect(() => buildCurrentFinancialPosition({ settlementPeriodId: "period-1", overview: overview(patch), tariff: DEFAULT_TARIFF_SETTINGS, tariffSource: "database" })).toThrow();
  });
  it("érvényes input eredményét a validáció nem változtatja meg", () => {
    const result = buildCurrentFinancialPosition({ settlementPeriodId: "period-1", overview: overview(), tariff: DEFAULT_TARIFF_SETTINGS, tariffSource: "database" });
    expect(result).toMatchObject({ gridImportKwh: 100, gridExportKwh: 20, netGridKwh: 80, estimatedAmountFt: estimateAmount(80, overview().periodStartAt, overview().lastDataAt!, DEFAULT_TARIFF_SETTINGS) });
  });
});
