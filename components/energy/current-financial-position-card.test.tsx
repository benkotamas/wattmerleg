import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { formatGridEnergy } from "./current-financial-position-card";

const source = readFileSync("components/energy/current-financial-position-card.tsx", "utf8");
const page = readFileSync("app/page.tsx", "utf8");

describe("current financial position UI", () => {
  it("a kötelező címet, forrást, KPI-kat, cutoffot és becslés-jelzést mutatja", () => {
    for (const text of ["Aktuális pénzügyi helyzet", "E.ON 15 perces hálózati adatok alapján", "Hálózatból vételezett", "Hálózatba betáplált", "Nettó hálózati egyenleg", "Becsült fizetendő", "Várható jóváírás", "Adatok eddig:", "Tájékoztató becslés"]) expect(source).toContain(text);
  });
  it("magyar MWh formátumot használ nagy értéknél", () => { expect(formatGridEnergy(1234.5)).toBe("1,23 MWh"); });
  it("provisional, incomplete, stale és üres állapotot érthetően jelez", () => {
    for (const code of ["PROVISIONAL_CURRENT_DAY", "INCOMPLETE_CLOSED_DAYS", "STALE_DATA", "Még nincs E.ON-adat az aktuális elszámolási időszakhoz."]) expect(source).toContain(code);
  });
  it("megőrzi az őszi DST 96/100 warningot", () => {
    expect(source).toContain("DST_FALLBACK_SOURCE_96");
    expect(source).toContain("Az E.ON az őszi óraátállítás napján 96 intervallumot adott a várt 100 helyett.");
  });
  it("a kézi KPI blokk külön forrást és egyértelmű betáplálási címkét kap", () => {
    expect(page).toContain("Kézi mérőállás alapján"); expect(page).toContain("Legutóbbi kézi mérés:"); expect(page).toContain("Hálózatba betáplált – kézi mérő"); expect(page).toContain("<CurrentFinancialPositionCard/>");
  });
});
