import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { V1GrowattProvider } from "./service";
import type { GrowattDeviceSummary, GrowattPlantSummary } from "./types";

describe("Growatt V1 type 1 routing", () => {
  it("plant adaptert használ és nem hív device-specifikus current endpointot", async () => {
    const api = {
      plantList: vi.fn(), deviceList: vi.fn(),
      plantEnergyOverview: vi.fn(async () => ({ today_energy: "1", monthly_energy: "2", yearly_energy: "3", total_energy: "4" })),
      plantPower: vi.fn(async () => ({ powers: [{ time: "2026-08-03 09:30", power: 100 }] })),
      deviceEnergy: vi.fn(),
    };
    const provider = new V1GrowattProvider(api, () => new Date("2026-08-03T08:00:00Z"));
    const plant = { id: "plant-id", name: null, timezone: "Europe/Budapest", status: null } satisfies GrowattPlantSummary;
    const device = { id: "device-id", serialNumber: "SERIAL-PLACEHOLDER", type: "1", model: "classic", status: "1", plantId: "plant-id" } satisfies GrowattDeviceSummary;
    const result = await provider.latest(plant, device);
    expect(api.plantEnergyOverview).toHaveBeenCalledWith("plant-id");
    expect(api.plantPower).toHaveBeenCalledWith("plant-id", "2026-08-03");
    expect(api.deviceEnergy).not.toHaveBeenCalled();
    expect(result).toMatchObject({ currentPowerW: 100, measuredAt: "2026-08-03T07:30:00.000Z", todayEnergyKwh: 1, monthEnergyKwh: 2, yearEnergyKwh: 3, lifetimeEnergyKwh: 4 });
  });
});
