import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { deflateRawSync } from "node:zlib";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import * as XLSX from "xlsx";
import {
  EON_MAX_COMPRESSION_RATIO,
  EON_MAX_UNCOMPRESSED_BYTES,
  crc32,
  inspectXlsxArchive,
  readSecureWorkbook,
  validateWorksheet,
} from "./secure-workbook";
import { parseEonWorkbook } from "./parser";

type FixtureEntry = {
  name: string;
  data?: Buffer;
  compressed?: number;
  uncompressed?: number;
  flags?: number;
  method?: number;
  crc?: number;
  centralExtra?: Buffer;
  localExtra?: Buffer;
  dataDescriptor?: "signed" | "unsigned";
  localHeaderValues?: "zero" | "central";
};
type ZipFixture = {
  bytes: Buffer;
  centralOffsets: number[];
  localOffsets: number[];
  descriptorOffsets: Array<number | null>;
  eocdOffset: number;
};

function zipFixture(entries: FixtureEntry[]): ZipFixture {
  const localParts: Buffer[] = [];
  const localOffsets: number[] = [];
  const descriptorOffsets: Array<number | null> = [];
  let localLength = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name);
    const data = entry.data ?? Buffer.alloc(entry.compressed ?? 1);
    const compressed = entry.compressed ?? data.length;
    const uncompressed = entry.uncompressed ?? compressed;
    const extra = entry.localExtra ?? Buffer.alloc(0);
    const flags = (entry.flags ?? 0) | (entry.dataDescriptor ? 8 : 0);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(flags, 6);
    header.writeUInt16LE(entry.method ?? 0, 8);
    const checksum = entry.crc ?? (entry.method === 8 ? 0 : crc32(data.subarray(0, compressed)));
    if (!entry.dataDescriptor || entry.localHeaderValues === "central") {
      header.writeUInt32LE(checksum, 14);
      header.writeUInt32LE(compressed, 18);
      header.writeUInt32LE(uncompressed, 22);
    }
    header.writeUInt16LE(name.length, 26);
    header.writeUInt16LE(extra.length, 28);
    localOffsets.push(localLength);
    const payload = data.subarray(0, compressed);
    localParts.push(header, name, extra, payload);
    localLength += 30 + name.length + extra.length + compressed;
    if (entry.dataDescriptor) {
      descriptorOffsets.push(localLength);
      const descriptor = Buffer.alloc(entry.dataDescriptor === "signed" ? 16 : 12);
      let descriptorOffset = 0;
      if (entry.dataDescriptor === "signed") {
        descriptor.writeUInt32LE(0x08074b50, 0);
        descriptorOffset = 4;
      }
      descriptor.writeUInt32LE(checksum, descriptorOffset);
      descriptor.writeUInt32LE(compressed, descriptorOffset + 4);
      descriptor.writeUInt32LE(uncompressed, descriptorOffset + 8);
      localParts.push(descriptor);
      localLength += descriptor.length;
    } else {
      descriptorOffsets.push(null);
    }
  }
  const centralParts: Buffer[] = [];
  const centralOffsets: number[] = [];
  let centralLength = 0;
  entries.forEach((entry, index) => {
    const name = Buffer.from(entry.name);
    const data = entry.data ?? Buffer.alloc(entry.compressed ?? 1);
    const compressed = entry.compressed ?? data.length;
    const uncompressed = entry.uncompressed ?? compressed;
    const extra = entry.centralExtra ?? Buffer.alloc(0);
    const flags = (entry.flags ?? 0) | (entry.dataDescriptor ? 8 : 0);
    const header = Buffer.alloc(46);
    header.writeUInt32LE(0x02014b50, 0);
    header.writeUInt16LE(flags, 8);
    header.writeUInt16LE(entry.method ?? 0, 10);
    const checksum = entry.crc ?? (entry.method === 8 ? 0 : crc32(data.subarray(0, compressed)));
    header.writeUInt32LE(checksum, 16);
    header.writeUInt32LE(compressed, 20);
    header.writeUInt32LE(uncompressed, 24);
    header.writeUInt16LE(name.length, 28);
    header.writeUInt16LE(extra.length, 30);
    header.writeUInt32LE(localOffsets[index], 42);
    centralOffsets.push(localLength + centralLength);
    centralParts.push(header, name, extra);
    centralLength += 46 + name.length + extra.length;
  });
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralLength, 12);
  eocd.writeUInt32LE(localLength, 16);
  return {
    bytes: Buffer.concat([...localParts, ...centralParts, eocd]),
    centralOffsets,
    localOffsets,
    descriptorOffsets,
    eocdOffset: localLength + centralLength,
  };
}

function workbook(configure: (wb: XLSX.WorkBook, ws: XLSX.WorkSheet) => void): Buffer {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    ["Dátum/Idő", "+A", "-A"],
    ["MAXIMUM ÉRTÉK", 1, 1],
    ["ÖSSZEG", 1, 1],
    ["2026.08.03 00:00", 1, 1],
  ]);
  XLSX.utils.book_append_sheet(wb, ws, "Adatok");
  configure(wb, ws);
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

const zip64Extra = Buffer.from([0x01, 0x00, 0x00, 0x00]);
const assertUnsafe = (bytes: Buffer) => expect(() => inspectXlsxArchive(bytes)).toThrowError(expect.objectContaining({ code: "EON_UNSAFE_XLSX" }));

describe("E.ON XLSX central/local ZIP-határ", () => {
  it("a valódi SheetJS XLSX megfelel a szigorú preflightnak", () => expect(() => inspectXlsxArchive(workbook(() => {}))).not.toThrow());

  it("central/local méreteltérésnél még az XLSX.read előtt blokkol", () => {
    const fixture = zipFixture([{ name: "xl/workbook.xml", compressed: 1, uncompressed: 1 }]);
    fixture.bytes.writeUInt32LE(50_000, fixture.localOffsets[0] + 22);
    const reader = vi.fn();
    expect(() => readSecureWorkbook(fixture.bytes, 12, 100_000, reader as typeof XLSX.read)).toThrowError(expect.objectContaining({ code: "EON_UNSAFE_XLSX" }));
    expect(reader).not.toHaveBeenCalled();
    const compressedMismatch = zipFixture([{ name: "xl/workbook.xml" }]);
    compressedMismatch.bytes.writeUInt32LE(2, compressedMismatch.localOffsets[0] + 18);
    assertUnsafe(compressedMismatch.bytes);
  });

  it("azonos header-hazugság mellett a tényleges több MiB-os DEFLATE outputot az XLSX.read előtt blokkolja", () => {
    const output = Buffer.alloc(3 * 1024 * 1024, 0x41);
    const payload = deflateRawSync(output);
    const fixture = zipFixture([{ name: "xl/workbook.xml", method: 8, data: payload, uncompressed: 1, crc: crc32(output) }]);
    const reader = vi.fn();
    expect(() => readSecureWorkbook(fixture.bytes, 12, 100_000, reader as typeof XLSX.read)).toThrowError(expect.objectContaining({ code: "EON_UNSAFE_XLSX" }));
    expect(reader).not.toHaveBeenCalled();
  });

  it("a tényleges output hossz- és CRC-eltérését elutasítja", () => {
    const output = Buffer.from("actual-output");
    const payload = deflateRawSync(output);
    assertUnsafe(zipFixture([{ name: "a", method: 8, data: payload, uncompressed: output.length + 1, crc: crc32(output) }]).bytes);
    assertUnsafe(zipFixture([{ name: "a", method: 8, data: payload, uncompressed: output.length, crc: 123 }]).bytes);
  });

  it("stored entrynél a compressed és uncompressed méret kötelezően azonos", () => {
    assertUnsafe(zipFixture([{ name: "a", data: Buffer.from([1]), compressed: 1, uncompressed: 2 }]).bytes);
  });

  it("a tényleges globális outputméret és tömörítési arány korlátozott", () => {
    const first = Buffer.from("123456"), second = Buffer.from("abcdef"), firstPayload = deflateRawSync(first), secondPayload = deflateRawSync(second);
    const archive = zipFixture([
      { name: "a", method: 8, data: firstPayload, uncompressed: first.length, crc: crc32(first) },
      { name: "b", method: 8, data: secondPayload, uncompressed: second.length, crc: crc32(second) },
    ]).bytes;
    expect(() => inspectXlsxArchive(archive, { maxTotalBytes: 10, maxRatio: 1_000 })).toThrowError(expect.objectContaining({ code: "EON_XLSX_LIMIT_EXCEEDED" }));
    const repeated = Buffer.alloc(10_000, 0x41), repeatedPayload = deflateRawSync(repeated);
    expect(() => inspectXlsxArchive(zipFixture([{ name: "ratio", method: 8, data: repeatedPayload, uncompressed: repeated.length, crc: crc32(repeated) }]).bytes, { maxRatio: 2 })).toThrowError(expect.objectContaining({ code: "EON_XLSX_LIMIT_EXCEEDED" }));
  });

  it("eltérő név, method, flags és CRC nem fogadható el", () => {
    const mutations: Array<(fixture: ZipFixture) => void> = [
      f => f.bytes[f.localOffsets[0] + 30] ^= 1,
      f => f.bytes.writeUInt16LE(8, f.localOffsets[0] + 8),
      f => f.bytes.writeUInt16LE(2, f.localOffsets[0] + 6),
      f => f.bytes.writeUInt32LE(123, f.localOffsets[0] + 14),
    ];
    for (const mutate of mutations) {
      const fixture = zipFixture([{ name: "xl/workbook.xml" }]);
      mutate(fixture);
      assertUnsafe(fixture.bytes);
    }
  });

  it("fájlon kívüli local offsetet és central directoryba nyúló adatot tilt", () => {
    const outside = zipFixture([{ name: "xl/workbook.xml" }]);
    outside.bytes.writeUInt32LE(outside.bytes.length + 1, outside.centralOffsets[0] + 42);
    expect(() => inspectXlsxArchive(outside.bytes)).toThrowError(expect.objectContaining({ code: "EON_INVALID_XLSX" }));
    const intrusion = zipFixture([{ name: "xl/workbook.xml" }]);
    intrusion.bytes.writeUInt32LE(100, intrusion.localOffsets[0] + 18);
    intrusion.bytes.writeUInt32LE(100, intrusion.centralOffsets[0] + 20);
    assertUnsafe(intrusion.bytes);
  });

  it("átfedő local entryket tilt", () => {
    const fixture = zipFixture([{ name: "a", data: Buffer.alloc(40) }, { name: "b", compressed: 0, uncompressed: 0 }]);
    const nestedOffset = 31;
    fixture.bytes.writeUInt32LE(0x04034b50, nestedOffset);
    fixture.bytes.writeUInt16LE(0, nestedOffset + 6);
    fixture.bytes.writeUInt16LE(0, nestedOffset + 8);
    fixture.bytes.writeUInt32LE(0, nestedOffset + 14);
    fixture.bytes.writeUInt32LE(0, nestedOffset + 18);
    fixture.bytes.writeUInt32LE(0, nestedOffset + 22);
    fixture.bytes.writeUInt16LE(1, nestedOffset + 26);
    fixture.bytes.writeUInt16LE(0, nestedOffset + 28);
    fixture.bytes[nestedOffset + 30] = "b".charCodeAt(0);
    fixture.bytes.writeUInt32LE(nestedOffset, fixture.centralOffsets[1] + 42);
    assertUnsafe(fixture.bytes);
  });

  it("szignatúrás és szignatúra nélküli data descriptort biztonságosan elfogad", () => {
    const data = Buffer.from("descriptor-payload");
    for (const dataDescriptor of ["signed", "unsigned"] as const) {
      const fixture = zipFixture([{
        name: "xl/workbook.xml",
        data,
        flags: 0x0800,
        dataDescriptor,
      }]);
      expect(() => inspectXlsxArchive(fixture.bytes)).not.toThrow();
    }
  });

  it("data descriptor mellett a local headerben a central értékek is elfogadhatók", () => {
    const fixture = zipFixture([{
      name: "xl/workbook.xml",
      data: Buffer.from("payload"),
      dataDescriptor: "signed",
      localHeaderValues: "central",
    }]);
    expect(() => inspectXlsxArchive(fixture.bytes)).not.toThrow();
  });

  it("data descriptor central/local flageltérést és részleges local értékeket tilt", () => {
    const flagMismatch = zipFixture([{ name: "a", dataDescriptor: "signed" }]);
    flagMismatch.bytes.writeUInt16LE(0, flagMismatch.localOffsets[0] + 6);
    assertUnsafe(flagMismatch.bytes);

    const partialLocalValues = zipFixture([{ name: "a", dataDescriptor: "signed" }]);
    partialLocalValues.bytes.writeUInt32LE(1, partialLocalValues.localOffsets[0] + 18);
    assertUnsafe(partialLocalValues.bytes);
  });

  it("hibás data descriptor CRC-t és méreteket tilt", () => {
    const mutations: Array<(bytes: Buffer, descriptorOffset: number) => void> = [
      (bytes, descriptorOffset) => bytes.writeUInt32LE(123, descriptorOffset + 4),
      (bytes, descriptorOffset) => bytes.writeUInt32LE(123, descriptorOffset + 8),
      (bytes, descriptorOffset) => bytes.writeUInt32LE(123, descriptorOffset + 12),
    ];
    for (const mutate of mutations) {
      const fixture = zipFixture([{ name: "a", data: Buffer.from("payload"), dataDescriptor: "signed" }]);
      const descriptorOffset = fixture.descriptorOffsets[0];
      expect(descriptorOffset).not.toBeNull();
      mutate(fixture.bytes, descriptorOffset!);
      assertUnsafe(fixture.bytes);
    }
  });

  it("csonkolt vagy central directoryba nyúló data descriptort tilt", () => {
    const fixture = zipFixture([{ name: "a", data: Buffer.from("payload"), dataDescriptor: "signed" }]);
    const descriptorOffset = fixture.descriptorOffsets[0]!;
    const removedBytes = 8;
    const truncated = Buffer.concat([
      fixture.bytes.subarray(0, descriptorOffset + 8),
      fixture.bytes.subarray(descriptorOffset + 8 + removedBytes),
    ]);
    const newEocdOffset = fixture.eocdOffset - removedBytes;
    const oldCentralOffset = fixture.bytes.readUInt32LE(fixture.eocdOffset + 16);
    truncated.writeUInt32LE(oldCentralOffset - removedBytes, newEocdOffset + 16);
    assertUnsafe(truncated);
  });

  it("ZIP64 extra mezőt central és local headerben is tilt", () => {
    assertUnsafe(zipFixture([{ name: "a", centralExtra: zip64Extra }]).bytes);
    assertUnsafe(zipFixture([{ name: "a", localExtra: zip64Extra }]).bytes);
  });

  it("ZIP64 EOCD-t és locatort tilt", () => {
    for (const signature of [0x06064b50, 0x07064b50]) {
      const fixture = zipFixture([{ name: "a" }]);
      const markerLength = signature === 0x07064b50 ? 20 : 56;
      const marker = Buffer.alloc(markerLength);
      marker.writeUInt32LE(signature, 0);
      const bytes = Buffer.concat([fixture.bytes.subarray(0, fixture.eocdOffset), marker, fixture.bytes.subarray(fixture.eocdOffset)]);
      assertUnsafe(bytes);
    }
  });

  it("ZIP64 sentinel méreteket és nem támogatott tömörítést tilt", () => {
    const centralSize = zipFixture([{ name: "a" }]);
    centralSize.bytes.writeUInt32LE(0xffffffff, centralSize.centralOffsets[0] + 20);
    assertUnsafe(centralSize.bytes);
    const localSize = zipFixture([{ name: "a" }]);
    localSize.bytes.writeUInt32LE(0xffffffff, localSize.localOffsets[0] + 22);
    assertUnsafe(localSize.bytes);
    assertUnsafe(zipFixture([{ name: "a", method: 9 }]).bytes);
  });

  it("duplikált, abszolút, traversal és aktív entryneveket tilt", () => {
    const names = ["/absolute", "\\absolute", "\\\\server\\share", "C:/secret", "C:secret", "..\\secret", "bad\0name", "xl\\vbaProject.bin", "xl/activeX/control.bin", "xl/embeddings/object.bin", "xl/ctrlProps/a.xml", "xl/externalLinks/a.xml"];
    for (const name of names) assertUnsafe(zipFixture([{ name }]).bytes);
    assertUnsafe(zipFixture([{ name: "a".repeat(1_025) }]).bytes);
    assertUnsafe(zipFixture([{ name: "xl/workbook.xml" }, { name: "xl\\workbook.xml" }]).bytes);
  });

  it("EOCD/central integritást és méret/arány limiteket ellenőriz", () => {
    const comment = zipFixture([{ name: "a" }]);
    comment.bytes.writeUInt16LE(1, comment.eocdOffset + 20);
    expect(() => inspectXlsxArchive(comment.bytes)).toThrowError(expect.objectContaining({ code: "EON_INVALID_XLSX" }));
    expect(() => inspectXlsxArchive(zipFixture([{ name: "a", compressed: 1, uncompressed: EON_MAX_UNCOMPRESSED_BYTES + 1 }]).bytes)).toThrowError(expect.objectContaining({ code: "EON_XLSX_LIMIT_EXCEEDED" }));
    expect(() => inspectXlsxArchive(zipFixture([{ name: "a", compressed: 10, uncompressed: 10 * (EON_MAX_COMPRESSION_RATIO + 1) }]).bytes)).toThrowError(expect.objectContaining({ code: "EON_XLSX_LIMIT_EXCEEDED" }));
  });
});

describe("E.ON SheetJS parse-korlátok", () => {
  it("a SheetJS olvasást már parse közben szűk opciókkal korlátozza", () => {
    const fixture = zipFixture([{ name: "xl/workbook.xml" }]);
    const reader = vi.fn(() => ({ SheetNames: ["Adatok"], Sheets: { Adatok: { A1: { t: "n", v: 1 }, "!ref": "A1" } } } as XLSX.WorkBook));
    readSecureWorkbook(fixture.bytes, 12, 100_000, reader as typeof XLSX.read);
    expect(reader).toHaveBeenCalledWith(fixture.bytes, expect.objectContaining({
      type: "buffer", cellDates: true, cellFormula: true, cellHTML: false, cellText: false,
      cellStyles: false, bookDeps: false, bookFiles: false, bookProps: false, bookVBA: true,
      PRN: false, WTF: true, sheetRows: 100_001, nodim: true,
    }));
  });

  it("képletcellát cached value mellett is elutasít", () => {
    const bytes = workbook((_wb, ws) => { ws.B4 = { t: "n", f: "1+1", v: 2 }; });
    expect(() => parseEonWorkbook(bytes, { referenceDate: "2026-08-04" })).toThrowError(expect.objectContaining({ code: "EON_FORMULA_CELL" }));
  });

  it("hamisan kicsi !ref nem rejti el a távoli cellát", () => {
    const sheet: XLSX.WorkSheet = { A1: { t: "n", v: 1 }, BM100001: { t: "n", v: 2 }, "!ref": "A1:A1" };
    expect(() => validateWorksheet(sheet, 100_000)).toThrowError(expect.objectContaining({ code: "EON_XLSX_LIMIT_EXCEEDED" }));
  });

  it("!fullref, tényleges sor és cellaszám külön is korlátozott", () => {
    expect(() => validateWorksheet({ A1: { t: "n", v: 1 }, "!ref": "A1", "!fullref": "A1:A100001" }, 100_000)).toThrowError(expect.objectContaining({ code: "EON_XLSX_LIMIT_EXCEEDED" }));
    expect(() => validateWorksheet({ A1: { t: "n", v: 1 }, A100001: { t: "n", v: 2 }, "!ref": "A1:A100001" }, 100_000)).toThrowError(expect.objectContaining({ code: "EON_XLSX_LIMIT_EXCEEDED" }));
    expect(() => validateWorksheet({ A1: { t: "n", v: 1 }, A2: { t: "n", v: 2 }, A3: { t: "n", v: 3 }, "!ref": "A1:A3" }, 100_000, 2)).toThrowError(expect.objectContaining({ code: "EON_XLSX_LIMIT_EXCEEDED" }));
  });

  it("túl sok munkalapot elutasít", () => {
    const bytes = workbook(wb => { for (let index = 0; index < 12; index++) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[index]]), `S${index}`); });
    expect(() => parseEonWorkbook(bytes)).toThrowError(expect.objectContaining({ code: "EON_XLSX_LIMIT_EXCEEDED" }));
  });
});

describe("vendorizált SheetJS integritás", () => {
  it("a repository tarball SHA-256 értéke rögzített", () => {
    const bytes = readFileSync(resolve(process.cwd(), "vendor/xlsx-0.20.3.tgz"));
    expect(createHash("sha256").update(bytes).digest("hex")).toBe("8dc73fc3b00203e72d176e85b50938627c7b086e607c682e8d3c22c02bb99fe8");
  });
});
