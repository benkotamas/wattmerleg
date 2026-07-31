import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import { describe, expect, it } from "vitest";
import { EmptyState, KpiCard, PageHeader, SegmentedControl, StatusPanel } from "./ui";

describe("közös UI komponensek",()=>{
  it("a szegmentált vezérlő tab szemantikát és szöveges állapotot ad",()=>{const html=renderToStaticMarkup(<SegmentedControl value="analysis" label="Nézet" onChange={()=>undefined} options={[{value:"analysis",label:"Elemzés"},{value:"details",label:"Részletes adatok"}]}/>);expect(html).toContain('role="tablist"');expect(html).toContain('aria-selected="true"');expect(html).toContain("Részletes adatok")});
  it("a hibapanel képernyőolvasónak alert",()=>expect(renderToStaticMarkup(<StatusPanel tone="danger">Hiba</StatusPanel>)).toContain('role="alert"'));
  it("a KPI, fejléc és empty state megőrzi a látható címkéket",()=>{const html=renderToStaticMarkup(<><PageHeader title="Áttekintés"/><KpiCard label="Fogyasztás" value="10 kWh"/><EmptyState title="Nincs adat"/></>);expect(html).toContain("Áttekintés");expect(html).toContain("Fogyasztás");expect(html).toContain("Nincs adat")});
});
