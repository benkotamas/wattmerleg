import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/growatt/auth", () => ({ growattRouteAccess: async () => "allowed" }));
vi.mock("@/lib/growatt/service", async (original) => {
  const actual = await original<Record<string, unknown>>();
  return {
    ...actual,
    defaultGrowattLatestProvider: () => ({ provider: {}, fingerprint: "test" }),
  };
});
const publicLatest = { deviceType:"1",deviceModel:"MIN",deviceStatus:"online",measuredAt:"2026-08-03T07:30:00.000Z",currentPowerW:100,todayEnergyKwh:1,monthEnergyKwh:2,yearEnergyKwh:3,lifetimeEnergyKwh:4,gridImportPowerW:null,gridExportPowerW:null,loadPowerW:null,batteryChargePowerW:null,batteryDischargePowerW:null,batterySocPercent:null,source:"growatt",rawCapabilities:["currentPowerW"] };
const state = { result: { kind: "success", data: publicLatest } as { kind:"success";data:typeof publicLatest } | {kind:"rate_limited";retryAt:number;stale?:typeof publicLatest}, error:null as Error|null };
vi.mock("@/lib/growatt/latest-cache", () => ({ growattLatestCached: async () => {if(state.error)throw state.error;return state.result;} }));
import { GET } from "./route";

describe("GET /api/growatt/latest publikus válasz", () => {
  beforeEach(()=>{state.result={kind:"success",data:publicLatest};state.error=null;});
  it("nem adja vissza a belső Growatt azonosítókat", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    const body = await response.json();
    expect(body).not.toHaveProperty("plantId");
    expect(body).not.toHaveProperty("deviceId");
    expect(body).not.toHaveProperty("deviceSerialNumber");
    expect(body).toMatchObject({ measuredAt: "2026-08-03T07:30:00.000Z", currentPowerW: 100, deviceType: "1", deviceModel: "MIN", deviceStatus: "online", source: "growatt" });
  });
  it("rate-limit sentinel Retry-After headert ad és stale publikus adatot küld", async () => {
    state.result = { kind:"rate_limited", retryAt:Date.now()+300_000, stale:publicLatest };
    const response = await GET();
    expect(response.status).toBe(200);
    expect(Number(response.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    await expect(response.json()).resolves.toMatchObject({currentPowerW:100,rateLimited:true});
  });
  it("stale nélküli rate limit 429 és no-store",async()=>{state.result={kind:"rate_limited",retryAt:Date.now()+300_000};const response=await GET();expect(response.status).toBe(429);expect(response.headers.get("Cache-Control")).toContain("no-store");expect(Number(response.headers.get("Retry-After"))).toBeGreaterThan(0);});
  it("egyéb upstream hiba válasza is no-store",async()=>{state.error=new Error("upstream");const response=await GET();expect(response.status).toBe(503);expect(response.headers.get("Cache-Control")).toContain("no-store");});
});
