import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/growatt/auth", () => ({ growattRouteAccess: async () => "allowed" }));
vi.mock("@/lib/growatt/service", async (original) => {
  const actual = await original<Record<string, unknown>>();
  return {
    ...actual,
    defaultGrowattLatestProvider: () => ({ provider: {}, fingerprint: "test" }),
    cached: async (_key: string, _ttl: number, loader: () => Promise<unknown>) => loader(),
    latestEnergy: async () => ({
      plantId: "private-plant", deviceId: "private-device", deviceSerialNumber: "private-serial",
      measuredAt: "2026-08-03T07:30:00.000Z", currentPowerW: 100, todayEnergyKwh: 1,
      monthEnergyKwh: 2, yearEnergyKwh: 3, lifetimeEnergyKwh: 4, gridImportPowerW: null,
      gridExportPowerW: null, loadPowerW: null, batteryChargePowerW: null,
      batteryDischargePowerW: null, batterySocPercent: null, source: "growatt", rawCapabilities: ["currentPowerW"],
    }),
  };
});
import { GET } from "./route";

describe("GET /api/growatt/latest publikus válasz", () => {
  it("nem adja vissza a belső Growatt azonosítókat", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).not.toHaveProperty("plantId");
    expect(body).not.toHaveProperty("deviceId");
    expect(body).not.toHaveProperty("deviceSerialNumber");
    expect(body).toMatchObject({ measuredAt: "2026-08-03T07:30:00.000Z", currentPowerW: 100, source: "growatt" });
  });
});
