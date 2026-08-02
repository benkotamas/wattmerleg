import { describe, expect, it } from "vitest";
import { collectSafePaths, safeObjectKey, shapeLines } from "./discovery-redaction";

describe("Growatt discovery kulcsredakció", () => {
  it("megtartja a stabil strukturális mezőneveket", () => expect(["data", "plants", "devices", "power", "energyToday"].map(safeObjectKey)).toEqual(["data", "plants", "devices", "power", "energyToday"]));
  it("a sorozatszám-szerű objektumkulcsot minden kimenetből eltávolítja", () => {
    const serial = "INV2026ABC123456";
    const payload = { data: { [serial]: { power: 42 } } };
    expect(shapeLines(payload).join("\n")).not.toContain(serial);
    expect(collectSafePaths(payload).join("\n")).not.toContain(serial);
    expect(collectSafePaths(payload)).toContain("data.<dynamic-key>.power");
  });
  it("UUID és numerikus azonosító kulcsokat is maszkol", () => {
    expect(safeObjectKey("550e8400-e29b-41d4-a716-446655440000")).toBe("<dynamic-key>");
    expect(safeObjectKey("123456789")).toBe("<dynamic-key>");
  });
});
