import * as XLSX from "xlsx";

export interface ExcelReading {
  excelRow: number;
  readingDate: string;
  readingAt: string;
  consumption: number;
  production: number;
  note: string | null;
  warnings: string[];
}

export interface ExcelPeriod {
  baseRow: number;
  start: ExcelReading;
  end: ExcelReading;
  readings: ExcelReading[];
  status: "open" | "closed";
}

export interface ExcelParseResult {
  sheetName: string;
  recognizedRows: number;
  readings: ExcelReading[];
  skipped: { row: number; reason: string }[];
  warned: ExcelReading[];
  periods: ExcelPeriod[];
}

const EXPECTED_HEADERS = [
  "Dátum", "Idő", "Fogyasztás villanyóra állás", "Fogyasztás",
  "Termelő Villanyóra állás", "Termelés", "Hőmérséklet(nappal)",
  "Hőmérséklet(éjjel)", "Szaldó",
] as const;

function cell(sheet: XLSX.WorkSheet, column: string, row: number): XLSX.CellObject | undefined {
  return sheet[`${column}${row}`] as XLSX.CellObject | undefined;
}

function numeric(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const parsed = Number(value.trim().replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function dateParts(value: unknown): { year: number; month: number; day: number; repaired: boolean } | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return { year: value.getFullYear(), month: value.getMonth() + 1, day: value.getDate(), repaired: false };
  }
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    return parsed ? { year: parsed.y, month: parsed.m, day: parsed.d, repaired: false } : null;
  }
  if (typeof value !== "string") return null;
  const cleaned = value.trim();
  const match = cleaned.match(/^(\d{4})([.\-/:])(\d{1,2})([.\-/:])(\d{1,2})\.?$/);
  if (!match) return null;
  const year = Number(match[1]), month = Number(match[3]), day = Number(match[5]);
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) return null;
  return { year, month, day, repaired: match[2] === ":" || match[4] === ":" };
}

function timeParts(value: unknown): { hour: number; minute: number; defaulted: boolean } | null {
  if (value === undefined || value === null || value === "") return { hour: 12, minute: 0, defaulted: true };
  if (value instanceof Date && !Number.isNaN(value.getTime())) return { hour: value.getHours(), minute: value.getMinutes(), defaulted: false };
  if (typeof value === "number" && value >= 0 && value < 1) {
    const totalMinutes = Math.round(value * 24 * 60);
    return { hour: Math.floor(totalMinutes / 60) % 24, minute: totalMinutes % 60, defaulted: false };
  }
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]), minute = Number(match[2]);
  return hour <= 23 && minute <= 59 ? { hour, minute, defaulted: false } : null;
}

function localTimestamp(date: { year: number; month: number; day: number }, time: { hour: number; minute: number }): string {
  // A Date a futtató gép helyi zónáját használja (a projekt használati zónája Europe/Budapest).
  return new Date(date.year, date.month - 1, date.day, time.hour, time.minute, 0, 0).toISOString();
}

function formulaBase(formula: string | undefined, meterColumn: "C" | "E"): number | null {
  if (!formula) return null;
  const escaped = formula.replace(/\s/g, "").toUpperCase();
  const match = escaped.match(new RegExp(`^${meterColumn}\\d+-\\$${meterColumn}\\$(\\d+)$`));
  return match ? Number(match[1]) : null;
}

export function parseWorkbook(workbook: XLSX.WorkBook): ExcelParseResult {
  const sheetName = workbook.SheetNames.includes("Adat") ? "Adat" : workbook.SheetNames[0];
  if (!sheetName) throw new Error("A munkafüzet nem tartalmaz munkalapot.");
  const sheet = workbook.Sheets[sheetName];
  EXPECTED_HEADERS.forEach((expected, index) => {
    const actual = String(cell(sheet, XLSX.utils.encode_col(index), 2)?.v ?? "").trim();
    if (actual !== expected) throw new Error(`Váratlan fejléc a(z) ${XLSX.utils.encode_col(index)}2 cellában: „${actual}” (várt: „${expected}”).`);
  });

  const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1:A1");
  const readings: ExcelReading[] = [];
  const skipped: { row: number; reason: string }[] = [];
  const detectedBaseReferences = new Map<number, number>();
  let recognizedRows = 0;

  for (let row = 3; row <= range.e.r + 1; row++) {
    const consumption = numeric(cell(sheet, "C", row)?.v);
    const production = numeric(cell(sheet, "E", row)?.v);
    const rawDate = cell(sheet, "A", row)?.v;
    const hasMeterData = consumption !== null || production !== null;
    if (!hasMeterData && rawDate === undefined) continue;
    recognizedRows++;
    if (consumption === null || production === null) {
      skipped.push({ row, reason: "hiányzó vagy hibás fogyasztási/termelési mérőállás" });
      continue;
    }
    const date = dateParts(rawDate);
    if (!date) {
      skipped.push({ row, reason: "hiányzó vagy nem értelmezhető dátum" });
      continue;
    }
    const time = timeParts(cell(sheet, "B", row)?.v);
    if (!time) {
      skipped.push({ row, reason: "nem értelmezhető időpont" });
      continue;
    }
    const warnings: string[] = [];
    if (time.defaulted) warnings.push("hiányzó időpont: 12:00 használva");
    if (date.repaired) warnings.push("hibás dátumelválasztó automatikusan javítva");
    const reading: ExcelReading = {
      excelRow: row,
      readingDate: `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`,
      readingAt: localTimestamp(date, time),
      consumption,
      production,
      note: cell(sheet, "K", row)?.v == null ? null : String(cell(sheet, "K", row)?.v).trim() || null,
      warnings,
    };
    readings.push(reading);

    const consumptionBase = formulaBase(cell(sheet, "D", row)?.f, "C");
    const productionBase = formulaBase(cell(sheet, "F", row)?.f, "E");
    if (consumptionBase && productionBase && consumptionBase === productionBase) {
      detectedBaseReferences.set(consumptionBase, (detectedBaseReferences.get(consumptionBase) ?? 0) + 1);
    }
    else if (consumptionBase !== productionBase) warnings.push("a fogyasztás és termelés képlete eltérő bázisra hivatkozik");
  }

  readings.sort((a, b) => a.excelRow - b.excelRow);
  // Egyetlen közvetlen előző sorra mutató képlet nem időszakváltás (pl. a 194. „átírás” sor).
  // A valódi bázisokat több következő képlet használja; a legelső érvényes sor mindig kezdő bázis.
  const formulaBaseRows = [...new Set([
    ...(readings.length ? [readings[0].excelRow] : []),
    ...[...detectedBaseReferences].filter(([, count]) => count >= 2).map(([base]) => base),
  ])].filter(base => readings.some(reading => reading.excelRow === base)).sort((a, b) => a - b);

  const sharedBoundaryRows = new Set<number>();
  const baseRows = [...new Set(formulaBaseRows.map(baseRow => {
    const baseIndex = readings.findIndex(reading => reading.excelRow === baseRow);
    const base = readings[baseIndex];
    const previous = baseIndex > 0 ? readings[baseIndex - 1] : null;
    const isAdministrativeTransfer = base?.note?.trim().toLocaleLowerCase("hu-HU").includes("átírás") ?? false;
    if (previous && isAdministrativeTransfer &&
        base.consumption === previous.consumption && base.production === previous.production) {
      sharedBoundaryRows.add(previous.excelRow);
      return previous.excelRow;
    }
    return baseRow;
  }))].sort((a, b) => a - b);
  const periods: ExcelPeriod[] = baseRows.map((baseRow, index) => {
    const start = readings.find(reading => reading.excelRow === baseRow)!;
    const nextBase = baseRows[index + 1];
    const nextStart = nextBase ? readings.find(reading => reading.excelRow === nextBase)! : null;
    let end = readings.at(-1)!;
    if (nextStart) {
      const previous = [...readings].reverse().find(reading => reading.excelRow < nextBase) ?? start;
      const nextDate = new Date(nextStart.readingAt);
      // Augusztus 4-i bázissor egyszerre a régi időszak záró- és az új nyitóállása.
      end = (nextDate.getMonth() === 7 && nextDate.getDate() === 4) || sharedBoundaryRows.has(nextBase)
        ? nextStart
        : previous;
    }
    const included = readings.filter(reading => reading.excelRow >= baseRow && (!nextBase || reading.excelRow < nextBase));
    return { baseRow, start, end, readings: included, status: index === baseRows.length - 1 ? "open" : "closed" };
  });

  for (let index = 1; index < readings.length; index++) {
    const previous = readings[index - 1], current = readings[index];
    if (current.consumption < previous.consumption) current.warnings.push(`fogyasztási mérő csökkent az előző érvényes sorhoz képest (${previous.excelRow}. sor)`);
    if (current.production < previous.production) current.warnings.push(`termelési mérő csökkent az előző érvényes sorhoz képest (${previous.excelRow}. sor)`);
  }

  return { sheetName, recognizedRows, readings, skipped, warned: readings.filter(reading => reading.warnings.length > 0), periods };
}
