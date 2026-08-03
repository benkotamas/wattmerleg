import { describe, expect, it } from "vitest";
import { shouldLoadStatisticsData } from "./statistics-ui";
describe("statisztikai nézet adatbetöltés", () => { it("inaktív nézetben nem tölt", () => expect(shouldLoadStatisticsData(false, "", "2026-08")).toBe(false)); it("azonos, már betöltött kulcsot nem kér le újra", () => expect(shouldLoadStatisticsData(true, "2026-08", "2026-08")).toBe(false)); it("aktív új tartományt lekér", () => expect(shouldLoadStatisticsData(true, "2026-07", "2026-08")).toBe(true)); });
