import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { GrowattOpenApiV1, assertV1ReadOnly, mapV1DeviceEnergy, mapV1Devices, mapV1PlantEnergy, mapV1PlantLatest, mapV1Plants, processV1Envelope, selectLatestPlantPower, supportedV1DeviceType } from "./openapi-v1";

const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const device = { id: "device-id", serialNumber: "SERIAL-PLACEHOLDER", type: "7", model: "MIN", status: "1", plantId: "plant-id" };

describe("Growatt OpenAPI V1 szerződés", () => {
  it("a nyers tokent token headerben és azonosítható User-Agenttel küldi", async () => {
    const fetcher = vi.fn(async (_url: string | URL, init?: RequestInit) => { const headers = new Headers(init?.headers); expect(headers.get("token")).toBe("secret-placeholder"); expect(headers.get("User-Agent")).toBe("Wattmerleg-GrowattOpenApiV1/1.0"); return response({ error_code: 0, error_msg: "", data: { count: 0, plants: [] } }); });
    await new GrowattOpenApiV1("secret-placeholder", { baseUrl: "https://example.test/v1/", fetcher }).plantList();
  });
  it("plant-lista és plant energy GET endpointot pontos paraméterrel hív", async () => {
    const fetcher = vi.fn(async (url: string | URL, init?: RequestInit) => { const parsed = new URL(url); expect(init?.method).toBe("GET"); if (parsed.pathname.endsWith("plant/data")) expect(parsed.searchParams.get("plant_id")).toBe("plant-id"); return response({ error_code: 0, data: { current_power: 10 } }); });
    const api = new GrowattOpenApiV1("x", { baseUrl: "https://example.test/v1/", fetcher });
    await expect(api.plantEnergyOverview("plant-id")).resolves.toEqual({ current_power: 10 });
  });
  it("device-list GET mapping", () => expect(mapV1Devices({ count: 1, devices: [{ device_id: 2, device_sn: "SERIAL-PLACEHOLDER", type: 7, model: "MIN", status: 1 }] }, "plant-id")[0]).toMatchObject({ ...device, id: "2" }));
  it("plant-list mapping", () => expect(mapV1Plants({ count: 1, plants: [{ plant_id: 1, name: "Otthon" }] })[0]).toMatchObject({ id: "1", name: "Otthon" }));
  it("MIN aktuális energy form POST és mapping", async () => {
    const fetcher = vi.fn(async (url: string | URL, init?: RequestInit) => { expect(new URL(url).pathname).toContain("tlx_last_data"); expect(init?.method).toBe("POST"); expect(init?.body).toBe("tlx_sn=SERIAL-PLACEHOLDER"); return response({ error_code: 0, data: { pac: "1200", eacToday: "4.2", eacTotal: "900", pacToUserTotal: "50" } }); });
    const data = await new GrowattOpenApiV1("x", { baseUrl: "https://example.test/v1/", fetcher }).deviceEnergy(7, "SERIAL-PLACEHOLDER");
    const mapped = mapV1DeviceEnergy(data, { plantId: "plant-id", device });
    expect(mapped).toMatchObject({ currentPowerW: 1200, todayEnergyKwh: 4.2, lifetimeEnergyKwh: 900, gridImportPowerW: 50, monthEnergyKwh: null, yearEnergyKwh: null });
  });
  it("hiányzó capability null marad", () => { const mapped = mapV1DeviceEnergy({}, { plantId: "plant-id", device }); expect(mapped.currentPowerW).toBeNull(); expect(mapped.gridExportPowerW).toBeNull(); expect(mapped.rawCapabilities).toEqual([]); });
  it("type 1, 5 és 7 támogatott, más típus kontrolláltan elutasított", () => { expect(supportedV1DeviceType("1")).toBe(1); expect(supportedV1DeviceType("5")).toBe(5); expect(supportedV1DeviceType("7")).toBe(7); expect(() => supportedV1DeviceType("2")).toThrowError(/nem választható egyértelműen/); });
  it("permission denied normalizált 403", () => expect(() => processV1Envelope({ error_code: 10011, error_msg: "raw" })).toThrowError(expect.objectContaining({ code: "GROWATT_PERMISSION_DENIED", status: 403 })));
  it("rate limit normalizált 429", () => expect(() => processV1Envelope({ error_code: 10012, error_msg: "raw" })).toThrowError(expect.objectContaining({ code: "GROWATT_RATE_LIMITED", status: 429 })));
  it("nem enged író vagy ismeretlen endpointot", () => { expect(() => assertV1ReadOnly("POST", "writeMinParam")).toThrow(); expect(() => assertV1ReadOnly("GET", "newTwoLoginAPI.do")).toThrow(); expect(() => assertV1ReadOnly("GET", "plant/list")).not.toThrow(); });
  it("plant/power rajta van a read-only allowlisten", () => expect(() => assertV1ReadOnly("GET", "plant/power")).not.toThrow());
  it("numerikus string error_code értékeket elfogad és normalizál", () => { expect(processV1Envelope({ error_code: "0", data: { ok: true } })).toEqual({ ok: true }); expect(() => processV1Envelope({ error_code: "10011" })).toThrowError(expect.objectContaining({ code: "GROWATT_PERMISSION_DENIED" })); expect(() => processV1Envelope({ error_code: "10012" })).toThrowError(expect.objectContaining({ code: "GROWATT_RATE_LIMITED" })); });
  it("placeholder token hálózati kérés előtt tiltott", () => { const fetcher = vi.fn(); expect(() => new GrowattOpenApiV1("[SENSITIVE]", { fetcher })).toThrowError(expect.objectContaining({ code: "GROWATT_NOT_CONFIGURED" })); expect(fetcher).not.toHaveBeenCalled(); });
  it("day/month/year/lifetime plant energy mezőket külön térképez", () => expect(mapV1PlantEnergy({ today_energy: "1", monthly_energy: "2", yearly_energy: "3", total_energy: "4" })).toEqual({ todayEnergyKwh: 1, monthEnergyKwh: 2, yearEnergyKwh: 3, lifetimeEnergyKwh: 4 }));
  it("az utolsó érvényes, nem jövőbeli power rekordot választja", () => expect(selectLatestPlantPower({ powers: [{ time: "2026-08-03 08:00", power: 10 }, { time: "2026-08-03 09:00", power: null }, { time: "2026-08-03 10:00", power: 20 }, { time: "2026-08-03 12:00", power: 30 }] }, "2026-08-03 10:30:00")).toEqual({ time: "2026-08-03 10:00", power: 20 }));
  it("type 1 latest megőrzi a késleltetett rekord időpontját egyértelmű UTC-ként és nem következtet hálózati mezőkre", () => { const result = mapV1PlantLatest({ today_energy: "1" }, { powers: [{ time: "2026-08-03 09:30", power: "50" }] }, { plantId: "plant-id", device }, "2026-08-03 10:30:00", "Europe/Budapest"); expect(result).toMatchObject({ measuredAt: "2026-08-03T07:30:00.000Z", currentPowerW: 50, todayEnergyKwh: 1, monthEnergyKwh: null, gridImportPowerW: null, gridExportPowerW: null, loadPowerW: null, batterySocPercent: null }); });
  it("hibás plant/power time esetén measuredAt null", () => { const result = mapV1PlantLatest({}, { powers: [{ time: "hibás-idő", power: 50 }] }, { plantId: "plant-id", device }, "zzzz", "Europe/Budapest"); expect(result.measuredAt).toBeNull(); expect(result.rawCapabilities).not.toContain("measuredAt"); });
  it("a token nem kerül V1 hibaüzenetbe", async () => { const token = "never-log-this"; await new GrowattOpenApiV1(token, { baseUrl: "https://example.test/v1/", fetcher: async () => response({ error_code: 10011, error_msg: token }) }).plantList().catch(error => expect(String(error)).not.toContain(token)); });
});
