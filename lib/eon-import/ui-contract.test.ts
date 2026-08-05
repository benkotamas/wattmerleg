import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("components/eon/interval-import-card.tsx", "utf8");

describe("E.ON import UI contract", () => {
  it("fájlválasztást, preview-t, commitot és előzményeket tartalmaz", () => {
    expect(source).toContain('type="file"');
    expect(source).toContain("/api/eon/import/preview");
    expect(source).toContain("/api/eon/import/commit");
    expect(source).toContain("/api/eon/imports");
  });
  it("fájlcsere invalidálja a preview-t és blocking error tilt", () => {
    expect(source).toMatch(/setPreview\(null\)/);
    expect(source).toMatch(/preview\.blockingErrors\.length>0/);
  });
  it("nem jelenít meg fájlnevet, hash-t vagy nyers pontokat", () => {
    expect(source).not.toContain("file.name");
    expect(source).not.toContain("preview.sha256}");
    expect(source).not.toContain("intervals.map");
  });
  it("hálózati hiba után finally ágban oldja a busy állapotot", () => {
    expect(source.match(/finally\{setBusy\(false\)\}/g)?.length).toBeGreaterThanOrEqual(2);
  });
  it("sikeres import után a natív file inputot is üríti", () => {
    expect(source).toContain('inputRef.current.value=""');
  });
  it("sikeres import után biztonságos szöveggel az aktuális pénzügyi helyzetre mutat", () => {
    expect(source).toContain("Az E.ON-import elkészült. Az aktuális pénzügyi helyzet megtekinthető.");
    expect(source).not.toContain("Az aktuális E.ON pénzügyi állapot frissült.");
    expect(source).toContain('href="/#current-financial-position"');
    expect(source).toContain("Aktuális pénzügyi helyzet megnyitása");
  });
  it("magyar címkéket és elkülönített blocking stílust használ", () => {
    expect(source).toContain('completed_with_warnings:"Sikeres, figyelmeztetésekkel"');
    expect(source).toContain('role="alert"');
    expect(source).toContain("EON_PARTIAL_INTERVAL_VALUE");
  });
});
