import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { normalizeStatisticsView, StatisticsViewTabs, statisticsViewUrl } from "./view-tabs";

describe("Statisztika főnézet-választó", () => {
  it("hiányzó és hibás view esetén Villanyórára áll", () => { expect(normalizeStatisticsView(null)).toBe("meter"); expect(normalizeStatisticsView("invalid")).toBe("meter"); });
  it("közvetlen solar és heating nézetet felismer", () => { expect(normalizeStatisticsView("solar")).toBe("solar"); expect(normalizeStatisticsView("heating")).toBe("heating"); });
  it("URL-váltáskor megtartja a többi paramétert", () => expect(statisticsViewUrl("https://example.test/statisztika?startMonth=2026-01", "solar")).toContain("view=solar"));
  it("tablist, tab, aria-selected és tördelésbiztos mobil markup készül", () => { const html = renderToStaticMarkup(<StatisticsViewTabs value="solar" onChange={() => undefined}/>); expect(html).toContain('role="tablist"'); expect(html).toContain('role="tab"'); expect(html).toContain('aria-selected="true"'); expect(html).toContain("overflow-x-auto"); expect(html).toContain("Napelem"); });
});
