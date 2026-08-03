export type SolarMonthRange = { startMonth: string; endMonth: string };
export type SolarMonthRangeValidation = { ok: true; range: SolarMonthRange } | { ok: false; error: string };

const validMonth = (value: string): boolean => /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
const monthIndex = (value: string): number => { const [year, month] = value.split("-").map(Number); return year * 12 + month - 1; };

export function validateSolarMonthRange(startMonth: string, endMonth: string, currentMonth: string): SolarMonthRangeValidation {
  if (!validMonth(startMonth) || !validMonth(endMonth)) return { ok: false, error: "Érvényes kezdő és záró hónapot adj meg ÉÉÉÉ-HH formátumban." };
  if (startMonth > endMonth) return { ok: false, error: "A kezdő hónap nem lehet későbbi a záró hónapnál." };
  if (monthIndex(endMonth) - monthIndex(startMonth) + 1 > 24) return { ok: false, error: "Legfeljebb 24 hónapos időszak választható." };
  if (endMonth > currentMonth) return { ok: false, error: "Jövőbeli hónap nem választható." };
  return { ok: true, range: { startMonth, endMonth } };
}

export function solarMonthRangeFromSearch(search: string, fallback: SolarMonthRange, currentMonth: string): { range: SolarMonthRange; usedFallback: boolean; error: string | null } {
  const params = new URLSearchParams(search), startMonth = params.get("startMonth"), endMonth = params.get("endMonth");
  if (startMonth === null && endMonth === null) return { range: fallback, usedFallback: false, error: null };
  const validation = validateSolarMonthRange(startMonth ?? "", endMonth ?? "", currentMonth);
  return validation.ok ? { range: validation.range, usedFallback: false, error: null } : { range: fallback, usedFallback: true, error: `Az URL-ben megadott napelemes időszak érvénytelen. ${validation.error}` };
}
