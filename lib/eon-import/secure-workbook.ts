import { Buffer } from "node:buffer";
import { inflateRawSync } from "node:zlib";
import * as XLSX from "xlsx";
import { EonImportError } from "./errors";

export const EON_MAX_ZIP_ENTRIES = 2_000;
export const EON_MAX_ZIP_ENTRY_BYTES = 16 * 1024 * 1024;
export const EON_MAX_UNCOMPRESSED_BYTES = 40 * 1024 * 1024;
export const EON_MAX_COMPRESSION_RATIO = 200;
export const EON_MAX_COLUMNS = 64;
export const EON_MAX_CELLS = 500_000;
export const EON_MAX_ENTRY_NAME_BYTES = 1_024;

const EOCD_SIGNATURE = 0x06054b50;
const ZIP64_EOCD_SIGNATURE = 0x06064b50;
const ZIP64_LOCATOR_SIGNATURE = 0x07064b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const ZIP64_EXTRA_FIELD = 0x0001;
const DATA_DESCRIPTOR_FLAG = 1 << 3;

type EntryRange = { start: number; end: number };
type ArchiveLimits = { maxEntryBytes?: number; maxTotalBytes?: number; maxRatio?: number };

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function invalid(): never {
  throw new EonImportError("EON_INVALID_XLSX");
}

function unsafe(): never {
  throw new EonImportError("EON_UNSAFE_XLSX");
}

function limited(): never {
  throw new EonImportError("EON_XLSX_LIMIT_EXCEEDED");
}

function hasZip64Extra(bytes: Buffer, start: number, length: number): boolean {
  const end = start + length;
  let offset = start;
  while (offset < end) {
    if (offset + 4 > end) invalid();
    const id = bytes.readUInt16LE(offset);
    const size = bytes.readUInt16LE(offset + 2);
    offset += 4;
    if (offset + size > end) invalid();
    if (id === ZIP64_EXTRA_FIELD) return true;
    offset += size;
  }
  return false;
}

function normalizedEntryName(nameBytes: Buffer): string {
  if (nameBytes.length === 0 || nameBytes.length > EON_MAX_ENTRY_NAME_BYTES) unsafe();
  const name = nameBytes.toString("utf8");
  if (name.includes("\0")) unsafe();
  const normalized = name.replace(/\\/g, "/");
  if (
    normalized.startsWith("/") ||
    name.startsWith("\\") ||
    normalized.startsWith("//") ||
    /^[a-z]:/i.test(normalized) ||
    normalized.split("/").includes("..")
  ) unsafe();
  const lower = normalized.toLowerCase();
  if (
    lower === "xl/vbaproject.bin" ||
    lower.startsWith("xl/activex/") ||
    lower.startsWith("xl/embeddings/") ||
    lower.startsWith("xl/ctrlprops/") ||
    lower.startsWith("xl/externallinks/")
  ) unsafe();
  return lower;
}

function overlaps(existing: EntryRange[], candidate: EntryRange): boolean {
  return existing.some(range => candidate.start < range.end && range.start < candidate.end);
}

export function inspectXlsxArchive(bytes: Buffer, limits: ArchiveLimits = {}): void {
  const maxEntryBytes = limits.maxEntryBytes ?? EON_MAX_ZIP_ENTRY_BYTES;
  const maxTotalBytes = limits.maxTotalBytes ?? EON_MAX_UNCOMPRESSED_BYTES;
  const maxRatio = limits.maxRatio ?? EON_MAX_COMPRESSION_RATIO;
  if (bytes.length < 22) invalid();
  let eocd = -1;
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65_557); offset--) {
    if (bytes.readUInt32LE(offset) === EOCD_SIGNATURE) {
      eocd = offset;
      break;
    }
  }
  if (eocd < 0 || eocd + 22 > bytes.length) invalid();

  const commentLength = bytes.readUInt16LE(eocd + 20);
  if (eocd + 22 + commentLength !== bytes.length) invalid();
  if (
    (eocd >= 20 && bytes.readUInt32LE(eocd - 20) === ZIP64_LOCATOR_SIGNATURE) ||
    (eocd >= 56 && bytes.readUInt32LE(eocd - 56) === ZIP64_EOCD_SIGNATURE)
  ) unsafe();

  const diskNumber = bytes.readUInt16LE(eocd + 4);
  const centralDisk = bytes.readUInt16LE(eocd + 6);
  const entriesOnDisk = bytes.readUInt16LE(eocd + 8);
  const totalEntries = bytes.readUInt16LE(eocd + 10);
  const centralSize = bytes.readUInt32LE(eocd + 12);
  const centralOffset = bytes.readUInt32LE(eocd + 16);
  if (diskNumber !== 0 || centralDisk !== 0 || entriesOnDisk !== totalEntries) unsafe();
  if (totalEntries === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) unsafe();
  if (totalEntries > EON_MAX_ZIP_ENTRIES) limited();
  if (centralOffset > eocd || centralSize > eocd - centralOffset) invalid();
  if (centralOffset + centralSize !== eocd) invalid();

  let offset = centralOffset;
  let totalActualUncompressed = 0;
  const localRanges: EntryRange[] = [];
  const names = new Set<string>();

  for (let index = 0; index < totalEntries; index++) {
    if (offset + 46 > eocd || bytes.readUInt32LE(offset) !== CENTRAL_SIGNATURE) invalid();
    const flags = bytes.readUInt16LE(offset + 8);
    const method = bytes.readUInt16LE(offset + 10);
    const crc = bytes.readUInt32LE(offset + 16);
    const compressed = bytes.readUInt32LE(offset + 20);
    const uncompressed = bytes.readUInt32LE(offset + 24);
    const nameLength = bytes.readUInt16LE(offset + 28);
    const extraLength = bytes.readUInt16LE(offset + 30);
    const entryCommentLength = bytes.readUInt16LE(offset + 32);
    const diskStart = bytes.readUInt16LE(offset + 34);
    const localOffset = bytes.readUInt32LE(offset + 42);
    const centralEnd = offset + 46 + nameLength + extraLength + entryCommentLength;
    if (centralEnd > eocd) invalid();
    if (diskStart !== 0) unsafe();
    if (compressed === 0xffffffff || uncompressed === 0xffffffff || localOffset === 0xffffffff) unsafe();
    if (method !== 0 && method !== 8) unsafe();
    if ((flags & 1) !== 0 || (flags & DATA_DESCRIPTOR_FLAG) !== 0) unsafe();
    if (hasZip64Extra(bytes, offset + 46 + nameLength, extraLength)) unsafe();

    const centralNameBytes = bytes.subarray(offset + 46, offset + 46 + nameLength);
    const normalizedName = normalizedEntryName(centralNameBytes);
    if (names.has(normalizedName)) unsafe();
    names.add(normalizedName);

    if (localOffset + 30 > centralOffset || bytes.readUInt32LE(localOffset) !== LOCAL_SIGNATURE) invalid();
    const localFlags = bytes.readUInt16LE(localOffset + 6);
    const localMethod = bytes.readUInt16LE(localOffset + 8);
    const localCrc = bytes.readUInt32LE(localOffset + 14);
    const localCompressed = bytes.readUInt32LE(localOffset + 18);
    const localUncompressed = bytes.readUInt32LE(localOffset + 22);
    const localNameLength = bytes.readUInt16LE(localOffset + 26);
    const localExtraLength = bytes.readUInt16LE(localOffset + 28);
    const localHeaderEnd = localOffset + 30 + localNameLength + localExtraLength;
    if (localHeaderEnd > centralOffset) invalid();
    if (localCompressed === 0xffffffff || localUncompressed === 0xffffffff) unsafe();
    if (hasZip64Extra(bytes, localOffset + 30 + localNameLength, localExtraLength)) unsafe();
    const localNameBytes = bytes.subarray(localOffset + 30, localOffset + 30 + localNameLength);
    if (!centralNameBytes.equals(localNameBytes)) unsafe();
    if (
      localMethod !== method ||
      localFlags !== flags ||
      localCrc !== crc ||
      localCompressed !== compressed ||
      localUncompressed !== uncompressed
    ) unsafe();
    const dataEnd = localHeaderEnd + compressed;
    if (dataEnd > centralOffset || dataEnd < localHeaderEnd) unsafe();
    const range = { start: localOffset, end: dataEnd };
    if (overlaps(localRanges, range)) unsafe();
    localRanges.push(range);

    const declaredRatio = compressed === 0 ? (uncompressed ? Infinity : 1) : uncompressed / compressed;
    if (uncompressed > maxEntryBytes || declaredRatio > maxRatio) limited();
    const payload = bytes.subarray(localHeaderEnd, dataEnd);
    let output: Buffer;
    if (method === 0) {
      if (compressed !== uncompressed || payload.length !== compressed) unsafe();
      output = payload;
    } else {
      try {
        output = inflateRawSync(payload, { maxOutputLength: maxEntryBytes + 1 });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ERR_BUFFER_TOO_LARGE") limited();
        unsafe();
      }
    }
    if (output.length > maxEntryBytes) limited();
    if (output.length !== uncompressed || crc32(output) !== crc) unsafe();
    const actualRatio = compressed === 0 ? (output.length ? Infinity : 1) : output.length / compressed;
    if (actualRatio > maxRatio) limited();
    totalActualUncompressed += output.length;
    if (totalActualUncompressed > maxTotalBytes) limited();
    offset = centralEnd;
  }
  if (offset !== centralOffset + centralSize) invalid();
}

function checkedRange(reference: string | undefined): XLSX.Range | null {
  if (!reference) return null;
  try {
    return XLSX.utils.decode_range(reference);
  } catch {
    invalid();
  }
}

export function validateWorksheet(sheet: XLSX.WorkSheet, maxRows: number, maxCells = EON_MAX_CELLS): void {
  const declaredRanges = [checkedRange(sheet["!ref"]), checkedRange(sheet["!fullref"] as string | undefined)].filter(
    (range): range is XLSX.Range => range !== null,
  );
  let minRow = Number.POSITIVE_INFINITY;
  let maxRow = -1;
  let minColumn = Number.POSITIVE_INFINITY;
  let maxColumn = -1;
  let cellCount = 0;
  for (const key of Object.keys(sheet)) {
    if (key.startsWith("!")) continue;
    let address: XLSX.CellAddress;
    try {
      address = XLSX.utils.decode_cell(key);
    } catch {
      invalid();
    }
    cellCount++;
    minRow = Math.min(minRow, address.r);
    maxRow = Math.max(maxRow, address.r);
    minColumn = Math.min(minColumn, address.c);
    maxColumn = Math.max(maxColumn, address.c);
    if (sheet[key]?.f) throw new EonImportError("EON_FORMULA_CELL");
  }
  if (cellCount > maxCells) limited();
  const actualRows = maxRow < 0 ? 0 : maxRow - minRow + 1;
  const actualColumns = maxColumn < 0 ? 0 : maxColumn - minColumn + 1;
  if (actualRows > maxRows || actualColumns > EON_MAX_COLUMNS) limited();
  for (const range of declaredRanges) {
    if (range.e.r - range.s.r + 1 > maxRows || range.e.c - range.s.c + 1 > EON_MAX_COLUMNS) limited();
  }
}

type WorkbookReader = typeof XLSX.read;

export function readSecureWorkbook(
  bytes: Buffer,
  maxSheets: number,
  maxRows: number,
  reader: WorkbookReader = XLSX.read,
): unknown[][][] {
  inspectXlsxArchive(bytes);
  let workbook: XLSX.WorkBook;
  try {
    workbook = reader(bytes, {
      type: "buffer",
      cellDates: true,
      cellFormula: true,
      cellHTML: false,
      cellText: false,
      cellStyles: false,
      bookDeps: false,
      bookFiles: false,
      bookProps: false,
      bookVBA: true,
      PRN: false,
      WTF: true,
      sheetRows: maxRows + 1,
      nodim: true,
    });
  } catch (error) {
    if (error instanceof EonImportError) throw error;
    throw new EonImportError("EON_INVALID_XLSX");
  }
  if (workbook.vbaraw) unsafe();
  if (workbook.SheetNames.length === 0) invalid();
  if (workbook.SheetNames.length > maxSheets) limited();
  return workbook.SheetNames.map(name => {
    const sheet = workbook.Sheets[name];
    validateWorksheet(sheet, maxRows);
    return XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null });
  });
}
