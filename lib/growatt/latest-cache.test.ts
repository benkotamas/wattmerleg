import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createGrowattLatestResolver, GROWATT_RATE_LIMIT_SENTINEL_MS, type GrowattLatestCacheResult } from "./latest-cache";
import type { PublicGrowattLatestEnergy } from "./types";

const latest = { deviceType:"1",deviceModel:null,deviceStatus:null,measuredAt:null,currentPowerW:100,todayEnergyKwh:1,monthEnergyKwh:null,yearEnergyKwh:null,lifetimeEnergyKwh:null,gridImportPowerW:null,gridExportPowerW:null,loadPowerW:null,batteryChargePowerW:null,batteryDischargePowerW:null,batterySocPercent:null,source:"growatt",rawCapabilities:["currentPowerW"] } satisfies PublicGrowattLatestEnergy;

describe("production Growatt latest resolver", () => {
  it("azonos fingerprint párhuzamos kéréseit egy sharedLoad hívásba vonja", async () => {
    let finish!: (value: GrowattLatestCacheResult) => void;
    const loader = vi.fn(() => new Promise<GrowattLatestCacheResult>(resolve => { finish = resolve; }));
    const resolve = createGrowattLatestResolver(loader);
    const first = resolve("same"), second = resolve("same");
    expect(loader).toHaveBeenCalledOnce(); finish({kind:"success",data:latest});
    await expect(Promise.all([first,second])).resolves.toEqual([{kind:"success",data:latest},{kind:"success",data:latest}]);
  });
  it("más fingerprint külön cache és loader hívás", async () => { const loader=vi.fn(async()=>({kind:"success",data:latest}) as const),resolve=createGrowattLatestResolver(loader);await Promise.all([resolve("a"),resolve("b")]);expect(loader).toHaveBeenCalledTimes(2); });
  it("rate_limited sentinel alatt nincs loader, lejárat után újra betölthet", async () => { let now=1000;const loader=vi.fn<() => Promise<GrowattLatestCacheResult>>().mockResolvedValueOnce({kind:"success",data:latest}).mockResolvedValueOnce({kind:"rate_limited",retryAt:2000+GROWATT_RATE_LIMIT_SENTINEL_MS}).mockResolvedValueOnce({kind:"success",data:{...latest,currentPowerW:200}});const resolve=createGrowattLatestResolver(loader,()=>now);await resolve("x");now=2000;await expect(resolve("x")).resolves.toMatchObject({kind:"rate_limited",stale:latest});now=3000;await resolve("x");expect(loader).toHaveBeenCalledTimes(2);now=2000+GROWATT_RATE_LIMIT_SENTINEL_MS+1;await expect(resolve("x")).resolves.toMatchObject({kind:"success",data:{currentPowerW:200}});expect(loader).toHaveBeenCalledTimes(3); });
  it("stale cache csak a publikus DTO-t őrzi", async () => { let now=1;const response={...latest,plantId:"private",deviceId:"private",deviceSerialNumber:"private",token:"private"} as PublicGrowattLatestEnergy;const loader=vi.fn<() => Promise<GrowattLatestCacheResult>>().mockResolvedValueOnce({kind:"success",data:response}).mockResolvedValueOnce({kind:"rate_limited",retryAt:999});const resolve=createGrowattLatestResolver(loader,()=>now);await resolve("x");now=2;const result=await resolve("x");const serialized=JSON.stringify(result.stale);expect(serialized).not.toMatch(/plantId|deviceId|deviceSerialNumber|token/); });
});
