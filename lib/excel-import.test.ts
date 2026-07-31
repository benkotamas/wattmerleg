import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parseWorkbook } from "./excel-import";

function workbook() {
  const rows = [
    ["2022. áramfogyasztás"],
    ["Dátum", "Idő", "Fogyasztás villanyóra állás", "Fogyasztás", "Termelő Villanyóra állás", "Termelés", "Hőmérséklet(nappal)", "Hőmérséklet(éjjel)", "Szaldó"],
    ["2022.08.01", null, 100, 0, 50, 0],
    ["2023.08.04", "10:00", 200, null, 100, null],
    ["2023.08.05", "11:00", 210, null, 110, null],
    ["2024.08:04", "12:00", 300, null, 180, null],
    [null, "12:00", 999, null, 999, null],
  ];
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet.D4 = { t: "n", v: 100, f: "C4-$C$3" }; sheet.F4 = { t: "n", v: 50, f: "E4-$E$3" };
  sheet.D5 = { t: "n", v: 10, f: "C5-$C$4" }; sheet.F5 = { t: "n", v: 10, f: "E5-$E$4" };
  sheet.D6 = { t: "n", v: 90, f: "C6-$C$4" }; sheet.F6 = { t: "n", v: 70, f: "E6-$E$4" };
  const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, sheet, "Adat"); return book;
}

describe("Excel parser", () => {
  it("uses row 2 headers, combines date/time and defaults missing time", () => {
    const result = parseWorkbook(workbook());
    expect(result.readings[0].readingAt).toContain("T");
    expect(result.readings[0].warnings).toContain("hiányzó időpont: 12:00 használva");
    expect(result.skipped).toEqual([{ row: 7, reason: "hiányzó vagy nem értelmezhető dátum" }]);
  });

  it("detects formula base rows and keeps only the latest period open", () => {
    const result = parseWorkbook(workbook());
    expect(result.periods.map(period => period.baseRow)).toEqual([3, 4]);
    expect(result.periods.map(period => period.status)).toEqual(["closed", "open"]);
  });

  it("repairs colon date separators with a warning", () => {
    expect(parseWorkbook(workbook()).readings.find(reading => reading.excelRow === 6)?.warnings)
      .toContain("hibás dátumelválasztó automatikusan javítva");
  });

  it("does not create a new period for an unchanged administrative transfer base", () => {
    const rows = [
      ["2025. áramfogyasztás"],
      ["Dátum", "Idő", "Fogyasztás villanyóra állás", "Fogyasztás", "Termelő Villanyóra állás", "Termelés", "Hőmérséklet(nappal)", "Hőmérséklet(éjjel)", "Szaldó", null, "Megjegyzés"],
      ["2025.08.07", "16:00", 94801, 0, 37146, 0],
      ["2025.09.12", "09:00", 94801, 0, 37146, 0, null, null, 0, null, "átírás"],
      ["2025.10.01", "09:00", 95581, null, 38736],
      ["2025.10.03", "08:00", 95620, null, 38767],
    ];
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    sheet.D4 = { t: "n", v: 0, f: "C4-$C$3" }; sheet.F4 = { t: "n", v: 0, f: "E4-$E$3" };
    sheet.D5 = { t: "n", v: 780, f: "C5-$C$4" }; sheet.F5 = { t: "n", v: 1590, f: "E5-$E$4" };
    sheet.D6 = { t: "n", v: 819, f: "C6-$C$4" }; sheet.F6 = { t: "n", v: 1621, f: "E6-$E$4" };
    const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, sheet, "Adat");

    const result = parseWorkbook(book);
    expect(result.periods).toHaveLength(1);
    expect(result.periods[0].baseRow).toBe(3);
    expect(result.periods[0].start.excelRow).toBe(3);
    expect(result.periods[0].readings.map(reading => reading.excelRow)).toContain(4);
    expect(result.readings.find(reading => reading.excelRow === 4)?.note).toBe("átírás");
  });
});
