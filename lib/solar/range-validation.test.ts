import { describe, expect, it } from "vitest";
import { solarMonthRangeFromSearch, validateSolarMonthRange } from "./range-validation";

describe("egyéni napelemes hónaptartomány validáció", () => {
  it("érvényes YYYY-MM tartományt elfogad", () => expect(validateSolarMonthRange("2026-01", "2026-08", "2026-08")).toMatchObject({ ok: true }));
  it("hibás formátumot elutasít", () => expect(validateSolarMonthRange("2026-1", "2026-08", "2026-08")).toMatchObject({ ok: false, error: expect.stringContaining("ÉÉÉÉ-HH") }));
  it("fordított tartományt elutasít", () => expect(validateSolarMonthRange("2026-08", "2026-07", "2026-08")).toMatchObject({ ok: false, error: expect.stringContaining("kezdő hónap") }));
  it("24 hónapot enged, 25 hónapot tilt", () => { expect(validateSolarMonthRange("2025-01", "2026-12", "2026-12").ok).toBe(true); expect(validateSolarMonthRange("2024-12", "2026-12", "2026-12")).toMatchObject({ ok: false, error: expect.stringContaining("24 hónapos") }); });
  it("jövőbeli hónapot tilt", () => expect(validateSolarMonthRange("2026-08", "2026-09", "2026-08")).toMatchObject({ ok: false, error: expect.stringContaining("Jövőbeli") }));
  it("hibás URL-paramétereknél biztonságos fallbacket ad", () => expect(solarMonthRangeFromSearch("?view=solar&startMonth=bad&endMonth=2026-08", { startMonth: "2026-08", endMonth: "2026-08" }, "2026-08")).toMatchObject({ range: { startMonth: "2026-08", endMonth: "2026-08" }, usedFallback: true, error: expect.any(String) }));
  it("hiányzó URL-t nem tekint hibának", () => expect(solarMonthRangeFromSearch("?view=solar", { startMonth: "2026-08", endMonth: "2026-08" }, "2026-08")).toMatchObject({ usedFallback: false, error: null }));
  it("partial URL range uses the safe fallback", () => expect(solarMonthRangeFromSearch("?view=solar&startMonth=2026-01", { startMonth: "2026-08", endMonth: "2026-08" }, "2026-08")).toMatchObject({ range: { startMonth: "2026-08", endMonth: "2026-08" }, usedFallback: true, error: expect.any(String) }));
  it("valid URL range is preserved", () => expect(solarMonthRangeFromSearch("?view=solar&startMonth=2025-09&endMonth=2026-08", { startMonth: "2026-08", endMonth: "2026-08" }, "2026-08")).toEqual({ range: { startMonth: "2025-09", endMonth: "2026-08" }, usedFallback: false, error: null }));
});
