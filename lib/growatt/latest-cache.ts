import "server-only";
import { unstable_cache } from "next/cache";
import { asGrowattError } from "./errors";
import { defaultGrowattLatestProvider, latestEnergy, publicGrowattLatest } from "./service";
import type { PublicGrowattLatestEnergy } from "./types";

export const GROWATT_LATEST_CACHE_SECONDS = 120;
export const GROWATT_RATE_LIMIT_SENTINEL_MS = 5 * 60_000;

export type GrowattLatestCacheResult =
  | { kind: "success"; data: PublicGrowattLatestEnergy }
  | { kind: "rate_limited"; retryAt: number };

// A 5 perces revalidate egyszerre teljesíti a legalább 120 másodperces pozitív
// cache-t és a legalább 5 perces negatív rate-limit sentinelt.
const sharedLoad = unstable_cache(async (fingerprint: string): Promise<GrowattLatestCacheResult> => {
  try {
    const configured = defaultGrowattLatestProvider();
    if (configured.fingerprint !== fingerprint) throw new Error("Growatt configuration changed");
    return { kind: "success", data: publicGrowattLatest(await latestEnergy(configured.provider)) };
  } catch (error) {
    const safe = asGrowattError(error);
    if (safe.code === "GROWATT_RATE_LIMITED") return { kind: "rate_limited", retryAt: Date.now() + GROWATT_RATE_LIMIT_SENTINEL_MS };
    throw error;
  }
}, ["growatt-public-latest-v1"], { revalidate: GROWATT_RATE_LIMIT_SENTINEL_MS / 1000 });

type SharedLoader = (fingerprint: string) => Promise<GrowattLatestCacheResult>;
type FingerprintState = { flight?: Promise<GrowattLatestCacheResult>; sentinelUntil: number; stale?: PublicGrowattLatestEnergy };
const publicCopy = (value: PublicGrowattLatestEnergy): PublicGrowattLatestEnergy => ({ deviceType:value.deviceType,deviceModel:value.deviceModel,deviceStatus:value.deviceStatus,measuredAt:value.measuredAt,currentPowerW:value.currentPowerW,todayEnergyKwh:value.todayEnergyKwh,monthEnergyKwh:value.monthEnergyKwh,yearEnergyKwh:value.yearEnergyKwh,lifetimeEnergyKwh:value.lifetimeEnergyKwh,gridImportPowerW:value.gridImportPowerW,gridExportPowerW:value.gridExportPowerW,loadPowerW:value.loadPowerW,batteryChargePowerW:value.batteryChargePowerW,batteryDischargePowerW:value.batteryDischargePowerW,batterySocPercent:value.batterySocPercent,source:"growatt",rawCapabilities:[...value.rawCapabilities] });

/** Ez a production growattLatestCached tényleges resolver-logikája. A Map csak
 * best-effort process-local single-flight/stale réteg; a beadott sharedLoad a
 * Next Data Cache-en keresztül megosztott a Vercel példányok között. */
export function createGrowattLatestResolver(loader: SharedLoader, now = Date.now) {
  const states = new Map<string, FingerprintState>();
  return async (fingerprint: string): Promise<GrowattLatestCacheResult & { stale?: PublicGrowattLatestEnergy }> => {
    const state = states.get(fingerprint) ?? { sentinelUntil: 0 };
    states.set(fingerprint, state);
    if (state.sentinelUntil > now()) return { kind: "rate_limited", retryAt: state.sentinelUntil, ...(state.stale ? { stale: state.stale } : {}) };
    if (!state.flight) state.flight = loader(fingerprint).finally(() => { state.flight = undefined; });
    const result = await state.flight;
    if (result.kind === "success") { const data = publicCopy(result.data); state.stale = data; state.sentinelUntil = 0; return { kind: "success", data }; }
    state.sentinelUntil = result.retryAt;
    return { ...result, ...(state.stale ? { stale: state.stale } : {}) };
  };
}

const productionResolver = createGrowattLatestResolver(sharedLoad);
export const growattLatestCached = (fingerprint: string) => productionResolver(fingerprint);
