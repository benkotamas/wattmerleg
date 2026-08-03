import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const page = readFileSync("app/statisztika/page.tsx", "utf8"), dashboard = readFileSync("app/page.tsx", "utf8"), settings = readFileSync("app/beallitasok/page.tsx", "utf8"), solar = readFileSync("components/solar/consumption-analysis-section.tsx", "utf8");
describe("Statisztika információs architektúra", () => {
  it("külön meter, solar és heating tabpanelt használ", () => { expect(page).toContain('statistics-panel-meter'); expect(page).toContain('statistics-panel-solar'); expect(page).toContain('statistics-panel-heating'); });
  it("a solar nézet lusta és visszaváltáskor megtartott", () => { expect(page).toContain("visitedSolar"); expect(page).toContain('active={view === "solar"}'); });
  it("a heating nézet közvetlen CTA-kat tartalmaz, Growatt komponens csak a SolarView-ban van", () => { expect(page).toContain('href="/futes"'); expect(page).toContain('href="/futes/elemzes"'); expect(page.indexOf("GrowattPvHistorySection")).toBeLessThan(page.indexOf("function HeatingView")); });
  it("a két közvetlen napelemes CTA a solar URL-re mutat", () => { expect(dashboard).toContain('/statisztika?view=solar'); expect(settings).toContain('/statisztika?view=solar'); });
  it("a használhatatlan hónapokat kiszűri a grafikonból és a magyarázat csukott", () => { expect(solar).toContain("totalHomeConsumptionKwh !== null"); expect(solar).toContain("<details"); expect(solar).not.toContain("<details open"); });
  it("keeps custom solar edits in draft state until Apply validates them", () => {
    expect(page).toContain("draftStartMonth");
    expect(page).toContain("draftEndMonth");
    expect(page).toContain("onChange={event => setDraftStartMonth(event.target.value)}");
    expect(page).toContain("onChange={event => setDraftEndMonth(event.target.value)}");
    expect(page).toContain("onClick={applyDraft}");
    expect(page).toContain("validateSolarMonthRange(draftStartMonth, draftEndMonth, todayMonth)");
  });
  it("keeps requests on the applied range and changes URL in one controlled location", () => {
    expect(page).toContain("<GrowattPvHistorySection startMonth={startMonth} endMonth={endMonth}");
    expect(page).toContain("<SolarConsumptionAnalysisSection startMonth={startMonth} endMonth={endMonth}");
    expect(page.match(/window\.history\.replaceState/g)).toHaveLength(1);
  });
  it("uses the same 24 closed-month range for snapshot history as backfill", () => { expect(page).toContain("snapshotBackfillRange(24, budapestDate())"); expect(page).toContain("startMonth={snapshotHistoryRange.startMonth}"); expect(page).toContain("endMonth={snapshotHistoryRange.endMonth}"); });
});
