export type EonImportErrorCode =
  | "EON_FILE_TOO_LARGE" | "EON_INVALID_FILE_TYPE" | "EON_INVALID_XLSX"
  | "EON_WORKSHEET_NOT_FOUND" | "EON_AMBIGUOUS_WORKSHEET" | "EON_HEADERS_NOT_FOUND"
  | "EON_INVALID_DATE" | "EON_INVALID_INTERVAL" | "EON_PARTIAL_INTERVAL_VALUE"
  | "EON_FUTURE_INTERVAL_DATE" | "EON_INVALID_SUMMARY_ROW" | "EON_DUPLICATE_SUMMARY_ROW"
  | "EON_NO_INTERVAL_DATA"
  | "EON_UNSAFE_XLSX" | "EON_XLSX_LIMIT_EXCEEDED" | "EON_FORMULA_CELL"
  | "EON_NEGATIVE_VALUE" | "EON_DUPLICATE_INTERVAL" | "EON_SUMMARY_TOTAL_MISMATCH"
  | "EON_SUMMARY_MAX_MISMATCH" | "EON_PREVIEW_HASH_MISMATCH" | "EON_ALREADY_IMPORTED"
  | "EON_IMPORT_FAILED" | "EON_DATABASE_ERROR" | "EON_UNAUTHORIZED" | "EON_FORBIDDEN";

const messages: Record<EonImportErrorCode, string> = {
  EON_FILE_TOO_LARGE: "A fájl mérete túl nagy.", EON_INVALID_FILE_TYPE: "Csak valódi XLSX fájl tölthető fel.",
  EON_INVALID_XLSX: "A munkafüzet sérült vagy nem támogatott.", EON_WORKSHEET_NOT_FOUND: "Nem található E.ON intervallum-adatokat tartalmazó munkalap.",
  EON_AMBIGUOUS_WORKSHEET: "Több lehetséges adatmunkalap található.", EON_HEADERS_NOT_FOUND: "A szükséges Dátum/Idő, +A és -A fejlécek hiányoznak.",
  EON_INVALID_DATE: "Érvénytelen dátum található.", EON_INVALID_INTERVAL: "Az időpont nem 15 perces intervallumra esik.",
  EON_PARTIAL_INTERVAL_VALUE: "Az intervallum egyik energiaértéke hiányzik.", EON_FUTURE_INTERVAL_DATE: "Jövőbeli mérési dátum található.",
  EON_NO_INTERVAL_DATA: "A munkafüzet nem tartalmaz mérési intervallumokat.",
  EON_UNSAFE_XLSX: "A munkafüzet tiltott vagy aktív tartalmat tartalmaz.", EON_XLSX_LIMIT_EXCEEDED: "A munkafüzet szerkezeti korlátot lépett túl.", EON_FORMULA_CELL: "A mérési munkafüzet képletcellát tartalmaz.",
  EON_INVALID_SUMMARY_ROW: "Az összesítő sor hibás vagy hiányos.", EON_DUPLICATE_SUMMARY_ROW: "Több azonos típusú összesítő sor található.",
  EON_NEGATIVE_VALUE: "Negatív energiaérték található.", EON_DUPLICATE_INTERVAL: "Duplikált intervallum található.",
  EON_SUMMARY_TOTAL_MISMATCH: "Az Excel összegző sora nem egyezik az intervallumokkal.", EON_SUMMARY_MAX_MISMATCH: "Az Excel maximum sora nem egyezik az intervallumokkal.",
  EON_PREVIEW_HASH_MISMATCH: "A kiválasztott fájl megváltozott az előnézet óta.", EON_ALREADY_IMPORTED: "Ez a fájl már sikeresen importálva lett.",
  EON_IMPORT_FAILED: "Az import nem sikerült.", EON_DATABASE_ERROR: "Az adatok mentése nem sikerült.",
  EON_UNAUTHORIZED: "Bejelentkezés szükséges.", EON_FORBIDDEN: "Ehhez a művelethez nincs jogosultság."
};
export class EonImportError extends Error { constructor(public code:EonImportErrorCode, public status=400){super(messages[code]);this.name="EonImportError"} publicMessage(){return messages[this.code]} }
