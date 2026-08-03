export type SolarAnalysisStatus = "complete" | "estimated_meter_allocation" | "in_progress" | "incomplete_meter_coverage" | "period_mismatch" | "incomplete_pv_coverage" | "inconsistent_inputs" | "missing_meter_data" | "missing_pv_data" | "timezone_mismatch";
export type MeterDataQuality = "complete" | "estimated" | "missing" | "invalid";

export interface SolarMonthInput {
  yearMonth: string;
  currentYearMonth: string;
  meterTimezone: string;
  pvTimezone: string | null;
  meterYearMonth?: string;
  pvYearMonth?: string;
  gridImportKwh: number | null;
  gridExportKwh: number | null;
  meterDataQuality: MeterDataQuality;
  pvProductionKwh: number | null;
  pvExpectedDays: number;
  pvStoredDays: number;
  pvCompleteDays: number;
  pvProvisionalDays: number;
  pvMissingDays: number;
  pvInvalidDays: number;
  pvPeriodStartLocalDate: string | null;
  pvPeriodEndLocalDate: string | null;
  meterCoverageStartAt: string | null;
  meterCoverageEndAt: string | null;
  meterCoverageStartLocalDate: string | null;
  meterCoverageEndLocalDate: string | null;
  meterCoversRequiredStart: boolean;
  meterCoversRequiredEnd: boolean;
}

export interface SolarMonthAnalysis extends SolarMonthInput {
  status: SolarAnalysisStatus;
  selfConsumedPvKwh: number | null;
  totalHomeConsumptionKwh: number | null;
  pvSelfConsumptionRatio: number | null;
  pvCoverageRatio: number | null;
  pvCoverage: number;
  explanations: string[];
}

export interface SolarPeriodSummary {
  includedMonths: number;
  excludedMonths: number;
  estimatedMeterMonths: number;
  fullPvCoverage: boolean;
  gridImportKwh: number;
  gridExportKwh: number;
  pvProductionKwh: number;
  selfConsumedPvKwh: number;
  totalHomeConsumptionKwh: number;
  pvSelfConsumptionRatio: number | null;
  pvCoverageRatio: number | null;
}

const usableStatuses = new Set<SolarAnalysisStatus>(["complete", "estimated_meter_allocation", "in_progress"]);
const finiteNonNegative = (value: number | null): value is number => value !== null && Number.isFinite(value) && value >= 0;
const emptyResult = (input: SolarMonthInput, status: SolarAnalysisStatus, explanations: string[]): SolarMonthAnalysis => ({ ...input, status, selfConsumedPvKwh: null, totalHomeConsumptionKwh: null, pvSelfConsumptionRatio: null, pvCoverageRatio: null, pvCoverage: input.pvExpectedDays > 0 ? input.pvStoredDays / input.pvExpectedDays : 0, explanations });

export function analyzeSolarMonth(input: SolarMonthInput): SolarMonthAnalysis {
  if (input.pvTimezone && input.pvTimezone !== input.meterTimezone) return emptyResult(input, "timezone_mismatch", ["A Growatt és a villanyóra havi időzónája eltér, ezért az időszakok nem vethetők össze."]);
  if ((input.meterYearMonth && input.meterYearMonth !== input.yearMonth) || (input.pvYearMonth && input.pvYearMonth !== input.yearMonth)) return emptyResult(input, "inconsistent_inputs", ["A két adatforrás naptári hónapja nem egyezik."]);
  if (input.meterDataQuality === "missing" || input.gridImportKwh === null || input.gridExportKwh === null) return emptyResult(input, "missing_meter_data", ["Ehhez a hónaphoz nincs megfelelő villanyórás havi adat."]);
  if (input.pvProductionKwh === null || input.pvStoredDays === 0) return emptyResult(input, "missing_pv_data", ["Ehhez a hónaphoz nincs Growatt invertertermelési adat."]);
  if (input.meterDataQuality === "invalid" || !finiteNonNegative(input.gridImportKwh) || !finiteNonNegative(input.gridExportKwh) || !finiteNonNegative(input.pvProductionKwh)) return emptyResult(input, "inconsistent_inputs", ["Negatív vagy hibás bemeneti érték miatt nem készíthető becslés."]);
  const current = input.yearMonth === input.currentYearMonth;
  if (!input.meterCoversRequiredStart || (!current && !input.meterCoversRequiredEnd)) return emptyResult(input, "incomplete_meter_coverage", [`A villanyóra lefedettsége ${input.meterCoverageStartAt ?? "ismeretlen időpont"} és ${input.meterCoverageEndAt ?? "ismeretlen időpont"} közötti, ezért nem fedi le a teljes helyi naptári hónapot. Önfogyasztási becslés nem készül.`]);
  if (current && !input.meterCoversRequiredEnd) return emptyResult(input, "period_mismatch", [`A Growatt-adat vége ${input.pvPeriodEndLocalDate ?? "ismeretlen"}, a villanyóra lefedettségének vége ${input.meterCoverageEndAt ?? "ismeretlen"}. Az adatforrások nem ugyanazt a teljes helyi időszakot fedik le, ezért önfogyasztási becslés nem készül.`]);
  if (input.pvStoredDays < input.pvExpectedDays || input.pvMissingDays > 0 || input.pvInvalidDays > 0 || (!current && input.pvProvisionalDays > 0)) return emptyResult(input, "incomplete_pv_coverage", [input.pvStoredDays < input.pvExpectedDays || input.pvMissingDays > 0 ? "A hónap Growatt napi lefedettsége hiányos." : input.pvInvalidDays > 0 ? "A hónap hibás Growatt rekordot tartalmaz." : "Lezárt hónapban provisional Growatt rekord maradt."]);
  if (input.gridExportKwh > input.pvProductionKwh) return emptyResult(input, "inconsistent_inputs", ["A hálózati visszatáplálás nagyobb a mért teljes invertertermelésnél."]);
  const selfConsumedPvKwh = input.pvProductionKwh - input.gridExportKwh;
  const totalHomeConsumptionKwh = input.gridImportKwh + selfConsumedPvKwh;
  if (totalHomeConsumptionKwh <= 0) return emptyResult(input, "inconsistent_inputs", ["A számított teljes házfogyasztás nem pozitív."]);
  const status: SolarAnalysisStatus = current ? "in_progress" : input.meterDataQuality === "estimated" ? "estimated_meter_allocation" : "complete";
  const explanations = [status === "in_progress" ? "Az aktuális hónap adatai folyamatban vannak." : status === "estimated_meter_allocation" ? "Becsült, időarányos villanyórás adatok alapján." : "A lezárt hónap teljes adatsorral rendelkezik.", "A mutatók becslések, nem szolgáltatói elszámolási adatok."];
  return { ...input, status, selfConsumedPvKwh, totalHomeConsumptionKwh, pvSelfConsumptionRatio: input.pvProductionKwh > 0 ? selfConsumedPvKwh / input.pvProductionKwh : null, pvCoverageRatio: selfConsumedPvKwh / totalHomeConsumptionKwh, pvCoverage: input.pvExpectedDays > 0 ? input.pvStoredDays / input.pvExpectedDays : 0, explanations };
}

export function summarizeSolarPeriod(months: SolarMonthAnalysis[]): SolarPeriodSummary {
  const included = months.filter(month => usableStatuses.has(month.status));
  const sums = included.reduce((total, month) => ({ gridImportKwh: total.gridImportKwh + (month.gridImportKwh ?? 0), gridExportKwh: total.gridExportKwh + (month.gridExportKwh ?? 0), pvProductionKwh: total.pvProductionKwh + (month.pvProductionKwh ?? 0) }), { gridImportKwh: 0, gridExportKwh: 0, pvProductionKwh: 0 });
  const selfConsumedPvKwh = sums.pvProductionKwh - sums.gridExportKwh, totalHomeConsumptionKwh = sums.gridImportKwh + selfConsumedPvKwh;
  return { includedMonths: included.length, excludedMonths: months.length - included.length, estimatedMeterMonths: included.filter(month => month.meterDataQuality === "estimated").length, fullPvCoverage: months.length > 0 && months.every(month => month.pvExpectedDays > 0 && month.pvStoredDays === month.pvExpectedDays && month.pvMissingDays === 0 && month.pvInvalidDays === 0), ...sums, selfConsumedPvKwh, totalHomeConsumptionKwh, pvSelfConsumptionRatio: sums.pvProductionKwh > 0 ? selfConsumedPvKwh / sums.pvProductionKwh : null, pvCoverageRatio: totalHomeConsumptionKwh > 0 ? selfConsumedPvKwh / totalHomeConsumptionKwh : null };
}

export const solarAnalysisStatusLabel: Record<SolarAnalysisStatus, string> = {
  complete: "Teljes adatsor",
  estimated_meter_allocation: "Becsült villanyórás felosztás",
  in_progress: "Folyamatban",
  incomplete_meter_coverage: "Hiányos villanyórás időszak",
  period_mismatch: "Az adatforrások időszaka nem egyezik",
  incomplete_pv_coverage: "Hiányos inverteradat",
  inconsistent_inputs: "Az adatok nem vethetők össze megbízhatóan",
  missing_meter_data: "Hiányzó villanyórás adat",
  missing_pv_data: "Hiányzó inverteradat",
  timezone_mismatch: "Eltérő időzóna",
};
