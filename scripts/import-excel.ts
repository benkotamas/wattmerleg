import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import { createClient } from "@supabase/supabase-js";
import { parseWorkbook, type ExcelParseResult } from "../lib/excel-import";

dotenv.config({ path: ".env.local" });
dotenv.config();

function findExcelFile(): string {
  if (process.env.EXCEL_FILE) return path.resolve(process.env.EXCEL_FILE);
  const files = fs.readdirSync(path.resolve("data")).filter(name => name.toLowerCase().endsWith(".xlsx"));
  if (files.length !== 1) throw new Error(`Pontosan egy .xlsx fájl szükséges a data mappában; talált fájlok: ${files.length}.`);
  return path.resolve("data", files[0]);
}

function formatBudapestTimestamp(value: string): string {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Budapest", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")} ${part("hour")}:${part("minute")}`;
}

function printSummary(result: ExcelParseResult, imported: number | null, createdPeriods: number | null) {
  console.log("\n=== Excel-import összefoglaló ===");
  console.log(`Munkalap: ${result.sheetName}`);
  console.log(`Felismert Excel sorok: ${result.recognizedRows}`);
  console.log(`Sikeresen ${imported === null ? "értelmezett" : "importált"} mérőállások: ${imported ?? result.readings.length}`);
  console.log(`Kihagyott sorok: ${result.skipped.length}`);
  console.log(`Figyelmeztetéssel importált/értelmezett sorok: ${result.warned.length}`);
  console.log(`${createdPeriods === null ? "Felismert" : "Újonnan létrehozott"} elszámolási időszakok: ${createdPeriods ?? result.periods.length}`);
  result.periods.forEach((period, index) => {
    console.log(`\n${index + 1}. időszak [${period.status}] – Excel bázissor: ${period.baseRow}`);
    console.log(`  Kezdet: ${formatBudapestTimestamp(period.start.readingAt)} | fogyasztás ${period.start.consumption} kWh | termelés ${period.start.production} kWh`);
    console.log(`  Zárás:  ${formatBudapestTimestamp(period.end.readingAt)} | fogyasztás ${period.end.consumption} kWh | termelés ${period.end.production} kWh`);
  });
  if (result.skipped.length) {
    console.log("\nKihagyott sorok:");
    result.skipped.forEach(item => console.log(`- ${item.row}. sor: ${item.reason}`));
  }
  if (result.warned.length) {
    console.log("\nFigyelmeztetések:");
    result.warned.forEach(item => console.log(`- ${item.excelRow}. sor: ${item.warnings.join("; ")}`));
  }
}

async function main() {
  const file = findExcelFile();
  if (!fs.existsSync(file)) throw new Error(`Nem található az Excel-fájl: ${file}`);
  const workbook = XLSX.readFile(file, { cellDates: true, cellFormula: true });
  const result = parseWorkbook(workbook);
  const dryRun = process.argv.includes("--dry-run");
  if (dryRun) return printSummary(result, null, null);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const userId = process.env.SUPABASE_USER_ID;
  if (!url || !serviceKey || !userId) {
    printSummary(result, null, null);
    throw new Error("Az adatbázis-importhoz hiányzik a NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY vagy SUPABASE_USER_ID. Elemzéshez használd a --dry-run kapcsolót.");
  }
  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
  let imported = 0;
  let createdPeriods = 0;
  const periodIds = new Map<number, string>();
  const { data: existingPeriods, error: existingError } = await supabase.from("settlement_periods")
    .select("start_date").eq("user_id", userId);
  if (existingError) throw new Error(`A meglévő időszakok nem olvashatók: ${existingError.message}`);
  const existingStarts = new Set((existingPeriods ?? []).map(period => period.start_date));

  // A lezárt időszakok kerülnek be először, így az egyetlen nyitott időszak korlátozása is érvényes marad.
  for (const period of result.periods) {
    const payload = {
      user_id: userId,
      start_date: period.start.readingDate,
      end_date: period.status === "closed" ? period.end.readingDate : null,
      opening_consumption_meter_kwh: period.start.consumption,
      opening_production_meter_kwh: period.start.production,
      closing_consumption_meter_kwh: period.status === "closed" ? period.end.consumption : null,
      closing_production_meter_kwh: period.status === "closed" ? period.end.production : null,
      status: period.status,
    };
    const { data, error } = await supabase.from("settlement_periods")
      .upsert(payload, { onConflict: "user_id,start_date" }).select("id").single();
    if (error) throw new Error(`A(z) ${period.baseRow}. bázissor időszaka nem menthető: ${error.message}`);
    periodIds.set(period.baseRow, data.id);
    if (!existingStarts.has(period.start.readingDate)) createdPeriods++;
  }

  for (const period of result.periods) {
    const periodId = periodIds.get(period.baseRow)!;
    for (const reading of period.readings) {
      const noteParts = [reading.note, reading.warnings.length ? `[Excel-import: ${reading.warnings.join("; ")}]` : null].filter(Boolean);
      const { error } = await supabase.from("meter_readings").upsert({
        user_id: userId,
        reading_at: reading.readingAt,
        consumption_meter_kwh: reading.consumption,
        production_meter_kwh: reading.production,
        note: noteParts.join(" ") || null,
        settlement_period_id: periodId,
      }, { onConflict: "user_id,reading_at" });
      if (error) throw new Error(`${reading.excelRow}. sor importálási hibája: ${error.message}`);
      imported++;
    }
  }
  printSummary(result, imported, createdPeriods);
}

main().catch(error => { console.error(`\nHIBA: ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1; });
