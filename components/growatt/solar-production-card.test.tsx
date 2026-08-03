import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SolarProductionCardView } from "./solar-production-card";
import type { GrowattUiData, GrowattUiError } from "@/lib/growatt/ui";

const data: GrowattUiData = { status: { configured: true, connected: true, checkedAt: "2026-08-03T08:00:00Z" }, latest: { deviceType: "1", deviceModel: "MIN", deviceStatus: "online", measuredAt: "2026-08-03T07:30:00Z", currentPowerW: 2840, todayEnergyKwh: 12.5, monthEnergyKwh: null, yearEnergyKwh: 1234, lifetimeEnergyKwh: 12345, gridImportPowerW: null, gridExportPowerW: null, loadPowerW: null, batteryChargePowerW: null, batteryDischargePowerW: null, batterySocPercent: null, source: "growatt", rawCapabilities: ["currentPowerW", "todayEnergyKwh", "yearEnergyKwh", "lifetimeEnergyKwh"] } };
const render = (values: Partial<Parameters<typeof SolarProductionCardView>[0]> = {}) => renderToStaticMarkup(<SolarProductionCardView diagnostic={false} data={data} error={null} loading={false} onRefresh={() => undefined} {...values}/>);

describe("SolarProductionCard", () => {
  it("loading állapotot status szereppel jelenít meg", () => expect(render({ data: null, loading: true })).toContain('role="status"'));
  it("sikeres latest adatot és fogalmi magyarázatot mutat", () => { const html = render(); expect(html).toContain("2,84 kW"); expect(html).toContain("12,5 kWh"); expect(html).toContain("09:30"); expect(html).toContain("nem azonos a hálózatba visszatáplált energiával"); });
  it("null capability nem jelenik meg nulla értékként", () => { const html = render(); expect(html).not.toContain("Ebben a hónapban"); expect(html).not.toContain("0 kWh"); });
  it("null measuredAt szöveges ismeretlen állapot", () => { const changed = { ...data, latest: { ...data.latest!, measuredAt: null } }; expect(render({ data: changed })).toContain("Ismeretlen mérési időpont"); });
  it("hibát alertként és magyar szöveggel jelenít meg", () => { const error = { status: 429, code: "GROWATT_RATE_LIMITED", message: "raw technical detail" } satisfies GrowattUiError; const html = render({ data: null, error }); expect(html).toContain('role="alert"'); expect(html).toContain("túl sok kérést"); expect(html).not.toContain("raw technical detail"); });
  it("diagnosztikában capability-ket emberi címkével mutat", () => { const html = render({ diagnostic: true }); expect(html).toContain("Growatt napelem-integráció"); expect(html).toContain("Aktuális teljesítmény"); expect(html).not.toContain("currentPowerW"); });
  it("a publikus UI nem tartalmaz érzékeny azonosítómezőt vagy tokent", () => { const html = render({ diagnostic: true }); expect(html).not.toMatch(/plantId|deviceId|deviceSerialNumber|API token/i); });
});
