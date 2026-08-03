import { describe, expect, it } from "vitest";
import { growattLocalTimeToUtc, validGrowattTimezone } from "./time";

describe("Growatt helyi idő konverzió", () => {
  it("Europe/Budapest nyári időt UTC-re alakít", () => expect(growattLocalTimeToUtc("2026-08-03 09:30", "Europe/Budapest")).toBe("2026-08-03T07:30:00.000Z"));
  it("Europe/Budapest téli időt UTC-re alakít", () => expect(growattLocalTimeToUtc("2026-01-03 09:30", "Europe/Budapest")).toBe("2026-01-03T08:30:00.000Z"));
  it("helyesen kezeli a tavaszi DST-váltás két oldalát", () => {
    expect(growattLocalTimeToUtc("2026-03-29 01:30", "Europe/Budapest")).toBe("2026-03-29T00:30:00.000Z");
    expect(growattLocalTimeToUtc("2026-03-29 03:30", "Europe/Budapest")).toBe("2026-03-29T01:30:00.000Z");
    expect(growattLocalTimeToUtc("2026-03-29 02:30", "Europe/Budapest")).toBeNull();
  });
  it("érvénytelen timezone esetén Europe/Budapest fallbacket használ", () => {
    expect(validGrowattTimezone("invalid/timezone")).toBe("Europe/Budapest");
    expect(growattLocalTimeToUtc("2026-08-03 09:30", "invalid/timezone")).toBe("2026-08-03T07:30:00.000Z");
  });
  it("hibás időszöveget nem értelmez dátumként", () => {
    expect(growattLocalTimeToUtc("not-a-date", "Europe/Budapest")).toBeNull();
    expect(growattLocalTimeToUtc("2026-02-31 09:30", "Europe/Budapest")).toBeNull();
  });
});
