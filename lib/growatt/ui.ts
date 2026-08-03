import type { GrowattConnectionStatus, PublicGrowattLatestEnergy } from "./types";

export const GROWATT_FRESH_MAX_MS = 15 * 60_000;
export const GROWATT_DELAYED_MAX_MS = 60 * 60_000;

export type GrowattFreshness = "fresh" | "delayed" | "stale" | "unknown";
export type GrowattUiData = { status: GrowattConnectionStatus; latest: PublicGrowattLatestEnergy | null; rateLimitedUntil?: number };
export type GrowattUiError = { status: number; code: string; message: string; retryAt?: number };

export function growattFreshness(measuredAt: string | null, now = Date.now()): GrowattFreshness {
  if (!measuredAt) return "unknown";
  const measured = Date.parse(measuredAt);
  if (!Number.isFinite(measured)) return "unknown";
  const age = Math.max(0, now - measured);
  return age <= GROWATT_FRESH_MAX_MS ? "fresh" : age <= GROWATT_DELAYED_MAX_MS ? "delayed" : "stale";
}

export const freshnessLabel: Record<GrowattFreshness, string> = { fresh: "Friss adat", delayed: "Késleltetett adat", stale: "Elavult adat", unknown: "Ismeretlen mérési időpont" };
export function formatGrowattPower(watts: number | null): string { if (watts === null) return "Nincs adat"; return Math.abs(watts) < 1000 ? `${watts.toLocaleString("hu-HU", { maximumFractionDigits: 0 })} W` : `${(watts / 1000).toLocaleString("hu-HU", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} kW`; }
export function formatGrowattEnergy(kwh: number): string { return `${kwh.toLocaleString("hu-HU", { maximumFractionDigits: 2 })} kWh`; }
export function formatGrowattMeasuredAt(value: string | null): string { if (!value || !Number.isFinite(Date.parse(value))) return "Ismeretlen mérési időpont"; return new Intl.DateTimeFormat("hu-HU", { timeZone: "Europe/Budapest", hour: "2-digit", minute: "2-digit", year: "numeric", month: "short", day: "numeric" }).format(new Date(value)); }
export function formatGrowattRelativeTime(value: string | null, now = Date.now()): string | null {
  if (!value) return null;
  const measured = Date.parse(value); if (!Number.isFinite(measured)) return null;
  const minutes = Math.max(0, Math.floor((now - measured) / 60_000));
  if (minutes < 1) return "kevesebb mint 1 perce";
  if (minutes < 60) return `${minutes} perce`;
  const hours = Math.floor(minutes / 60); if (hours < 24) return `${hours} órája`;
  return `${Math.floor(hours / 24)} napja`;
}

const deviceTypeLabels: Record<string, string> = {
  "1": "Hálózatra tápláló inverter", "2": "Energiatároló", "3": "Egyéb Growatt eszköz", "4": "Growatt MAX inverter", "5": "Growatt SPH/MIX hibrid inverter",
  "6": "Growatt SPA", "7": "Growatt MIN/TLX inverter", "8": "Growatt PCS", "9": "Growatt HPS", "10": "Growatt PBD",
};
export function growattDeviceTypeLabel(value: string | null): string { return value ? deviceTypeLabels[value.trim()] ?? "Ismeretlen eszköztípus" : "Ismeretlen eszköztípus"; }
export function growattDeviceStatusDisplay(value: string | null): { label: string; technicalCode: string | null } {
  return value?.trim() ? { label: "Elérhető adat", technicalCode: value.trim() } : { label: "Nincs adat", technicalCode: null };
}

const errorMessages: Record<string, string> = {
  UNAUTHORIZED: "A Growatt-adatok megtekintéséhez jelentkezz be újra.", FORBIDDEN: "A bejelentkezett felhasználó nem jogosult ehhez a Growatt-integrációhoz.",
  GROWATT_NOT_CONFIGURED: "A Growatt-integráció nincs teljesen beállítva.", GROWATT_PERMISSION_DENIED: "A Growatt-token nem rendelkezik megfelelő hozzáféréssel.",
  GROWATT_AUTH_FAILED: "A Growatt-hitelesítés sikertelen.", GROWATT_RATE_LIMITED: "A Growatt ideiglenesen túl sok kérést érzékelt.",
  GROWATT_TIMEOUT: "A Growatt nem válaszolt időben.", GROWATT_UNAVAILABLE: "A Growatt szolgáltatása jelenleg nem érhető el.",
  GROWATT_INVALID_RESPONSE: "A Growatt válasza nem volt feldolgozható.", GROWATT_NO_PLANT: "Nem található Growatt erőmű.",
  GROWATT_NO_DEVICE: "Nem található támogatott Growatt eszköz.", GROWATT_UNSUPPORTED_DEVICE: "A Growatt eszköztípus jelenleg nem támogatott.",
};
export function growattErrorMessage(error: Pick<GrowattUiError, "status" | "code">): string { if (error.code === "UNAUTHORIZED" || error.status === 401) return errorMessages.UNAUTHORIZED; if (error.code === "FORBIDDEN") return errorMessages.FORBIDDEN; return errorMessages[error.code] ?? (error.status === 403 ? errorMessages.FORBIDDEN : "A Growatt-adatok átmenetileg nem érhetők el."); }

type LatestApiResponse = PublicGrowattLatestEnergy & { rateLimited?: boolean; retryAt?: number };
const noStoreFetcher = (fetcher: typeof fetch): typeof fetch => (input, init) => fetcher(input, { ...init, cache: "no-store" });
async function latestJson(fetcher: typeof fetch): Promise<{ latest: PublicGrowattLatestEnergy; rateLimitedUntil?: number }> { const response = await fetcher("/api/growatt/latest", { credentials: "same-origin" }); const body = await response.json().catch(() => ({})) as { error?: { code?: string }; rateLimited?: boolean; retryAt?: number } & Partial<PublicGrowattLatestEnergy>; if (!response.ok) { const retryAfter = Number(response.headers.get("Retry-After")); const retryAt = Number.isFinite(retryAfter) && retryAfter > 0 ? Date.now() + retryAfter * 1000 : undefined; throw { status: response.status, code: body.error?.code ?? "GROWATT_UNAVAILABLE", message: "Growatt request failed", ...(retryAt ? { retryAt } : {}) } satisfies GrowattUiError; } const rateLimitedUntil = body.rateLimited && typeof body.retryAt === "number" ? body.retryAt : undefined; if (!validPublicLatest(body)) throw { status: 502, code: "GROWATT_INVALID_RESPONSE", message: "Growatt request failed" } satisfies GrowattUiError; return { latest: sanitizePublicLatest(body as LatestApiResponse), ...(rateLimitedUntil ? { rateLimitedUntil } : {}) }; }
export const GROWATT_POST_HISTORY_SYNC_COOLDOWN_MS = 15_000;
export const GROWATT_RATE_LIMIT_COOLDOWN_MS = 15 * 60_000;
export const GROWATT_LOCAL_SNAPSHOT_FRESH_MS = 2 * 60_000;
export const GROWATT_SESSION_CACHE_VERSION = 2;
export const GROWATT_SESSION_SNAPSHOT_MAX_AGE_MS = 24 * 60 * 60_000;
export const GROWATT_SNAPSHOT_STORAGE_KEY = "wattmerleg:growatt:latest:v2";
export const GROWATT_COOLDOWN_STORAGE_KEY = "wattmerleg:growatt:cooldown:v2";
type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type CooldownReason = "history_sync" | "rate_limit";
type Cooldown = { until: number; reason: CooldownReason };
export type GrowattBrowserState = { data: GrowattUiData | null; rateLimitedUntil: number | null };
let latestCooldown: Cooldown | null = null;
let latestUiSnapshot: GrowattUiData | null = null;
const browserStorage = (): StorageLike | null => { try { return typeof window === "undefined" ? null : window.localStorage; } catch { return null; } };
const object = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const nullableNumber = (value: unknown): value is number | null => value === null || typeof value === "number" && Number.isFinite(value);
const nullableString = (value: unknown): value is string | null => value === null || typeof value === "string";
function validPublicLatest(value: unknown): value is PublicGrowattLatestEnergy { if (!object(value)) return false; const numeric = ["currentPowerW","todayEnergyKwh","monthEnergyKwh","yearEnergyKwh","lifetimeEnergyKwh","gridImportPowerW","gridExportPowerW","loadPowerW","batteryChargePowerW","batteryDischargePowerW","batterySocPercent"]; return nullableString(value.measuredAt) && nullableString(value.deviceType) && nullableString(value.deviceModel) && nullableString(value.deviceStatus) && value.source === "growatt" && Array.isArray(value.rawCapabilities) && value.rawCapabilities.every(item => typeof item === "string") && numeric.every(key => nullableNumber(value[key])); }
function sanitizePublicLatest(value: PublicGrowattLatestEnergy): PublicGrowattLatestEnergy { return { deviceType:value.deviceType,deviceModel:value.deviceModel,deviceStatus:value.deviceStatus,measuredAt:value.measuredAt,currentPowerW:value.currentPowerW,todayEnergyKwh:value.todayEnergyKwh,monthEnergyKwh:value.monthEnergyKwh,yearEnergyKwh:value.yearEnergyKwh,lifetimeEnergyKwh:value.lifetimeEnergyKwh,gridImportPowerW:value.gridImportPowerW,gridExportPowerW:value.gridExportPowerW,loadPowerW:value.loadPowerW,batteryChargePowerW:value.batteryChargePowerW,batteryDischargePowerW:value.batteryDischargePowerW,batterySocPercent:value.batterySocPercent,source:"growatt",rawCapabilities:[...value.rawCapabilities] }; }
function remove(storage: StorageLike | null, key: string) { try { storage?.removeItem(key); } catch { /* A storage tiltása nem akadályozhatja az API-t. */ } }
export function loadGrowattSessionSnapshot(storage: StorageLike | null = browserStorage(), now = Date.now()): GrowattUiData | null { try { const raw = storage?.getItem(GROWATT_SNAPSHOT_STORAGE_KEY); if (!raw) return null; const parsed: unknown = JSON.parse(raw); if (!object(parsed) || parsed.version !== GROWATT_SESSION_CACHE_VERSION || typeof parsed.savedAt !== "number" || now - parsed.savedAt > GROWATT_SESSION_SNAPSHOT_MAX_AGE_MS || parsed.savedAt > now + 60_000 || !validPublicLatest(parsed.data)) { remove(storage, GROWATT_SNAPSHOT_STORAGE_KEY); return null; } return { status: { configured: true, connected: true, checkedAt: new Date(parsed.savedAt).toISOString() }, latest: sanitizePublicLatest(parsed.data) }; } catch { remove(storage, GROWATT_SNAPSHOT_STORAGE_KEY); return null; } }
function saveGrowattSessionSnapshot(data: PublicGrowattLatestEnergy, storage: StorageLike | null, now: number) { try { storage?.setItem(GROWATT_SNAPSHOT_STORAGE_KEY, JSON.stringify({ version: GROWATT_SESSION_CACHE_VERSION, savedAt: now, data: sanitizePublicLatest(data) })); } catch { /* Best-effort klienscache. */ } }
function storedCooldown(storage: StorageLike | null, now: number): Cooldown | null { try { const raw = storage?.getItem(GROWATT_COOLDOWN_STORAGE_KEY); if (!raw) return null; const parsed: unknown = JSON.parse(raw); if (!object(parsed) || parsed.version !== GROWATT_SESSION_CACHE_VERSION || typeof parsed.until !== "number" || !["history_sync", "rate_limit"].includes(String(parsed.reason)) || parsed.until <= now) { remove(storage, GROWATT_COOLDOWN_STORAGE_KEY); return null; } return { until: parsed.until, reason: parsed.reason as CooldownReason }; } catch { remove(storage, GROWATT_COOLDOWN_STORAGE_KEY); return null; } }
function storeCooldown(cooldown: Cooldown, storage: StorageLike | null) { latestCooldown = !latestCooldown || cooldown.until > latestCooldown.until ? cooldown : latestCooldown; try { storage?.setItem(GROWATT_COOLDOWN_STORAGE_KEY, JSON.stringify({ version: GROWATT_SESSION_CACHE_VERSION, ...latestCooldown })); } catch { /* Best-effort klienscache. */ } }
export function growattLatestCooldownUntil(storage: StorageLike | null = browserStorage(), now = Date.now()): number | null { const stored = storedCooldown(storage, now); if (stored && (!latestCooldown || stored.until > latestCooldown.until)) latestCooldown = stored; return latestCooldown?.until && latestCooldown.until > now ? latestCooldown.until : null; }
export function suppressGrowattLatestRefresh(durationMs = GROWATT_POST_HISTORY_SYNC_COOLDOWN_MS, now = Date.now(), storage: StorageLike | null = browserStorage()): void { storeCooldown({ until: now + durationMs, reason: "history_sync" }, storage); }
export function clearGrowattUiRuntimeCache(): void { latestCooldown = null; latestUiSnapshot = null; }
export function clearGrowattBrowserCache(storage: StorageLike | null = browserStorage()): void { remove(storage, GROWATT_SNAPSHOT_STORAGE_KEY); remove(storage, GROWATT_COOLDOWN_STORAGE_KEY); clearGrowattUiRuntimeCache(); }
export function loadGrowattBrowserState(storage: StorageLike | null = browserStorage(), now = Date.now()): GrowattBrowserState { clearGrowattUiRuntimeCache(); const snapshot = loadGrowattSessionSnapshot(storage, now); const cooldown = storedCooldown(storage, now); if (cooldown) latestCooldown = cooldown; latestUiSnapshot = snapshot; const rateLimitedUntil = cooldown?.reason === "rate_limit" ? cooldown.until : null; return { data: snapshot ? { ...snapshot, ...(rateLimitedUntil ? { rateLimitedUntil } : {}) } : null, rateLimitedUntil }; }
export function growattBrowserStateForStorageEvent(key: string | null, storage: StorageLike | null = browserStorage(), now = Date.now()): GrowattBrowserState | null { return key === GROWATT_SNAPSHOT_STORAGE_KEY || key === GROWATT_COOLDOWN_STORAGE_KEY ? loadGrowattBrowserState(storage, now) : null; }
export async function fetchGrowattUiData(fetcher: typeof fetch = fetch, options: { force?: boolean; storage?: StorageLike | null; now?: number } = {}): Promise<GrowattUiData> {
  const now = options.now ?? Date.now(), storage = options.storage === undefined ? browserStorage() : options.storage;
  latestUiSnapshot ??= loadGrowattSessionSnapshot(storage, now);
  const stored = storedCooldown(storage, now); if (stored && (!latestCooldown || stored.until > latestCooldown.until)) latestCooldown = stored;
  if (latestCooldown?.until && latestCooldown.until > now && (latestCooldown.reason === "rate_limit" || !options.force)) {
    if (latestUiSnapshot) return { ...latestUiSnapshot, ...(latestCooldown.reason === "rate_limit" ? { rateLimitedUntil: latestCooldown.until } : {}) };
    if (latestCooldown.reason === "rate_limit") throw { status: 429, code: "GROWATT_RATE_LIMITED", message: "Growatt cooldown active", retryAt: latestCooldown.until } satisfies GrowattUiError;
  }
  const savedAt = latestUiSnapshot?.status.checkedAt ? Date.parse(latestUiSnapshot.status.checkedAt) : NaN;
  if (!options.force && latestUiSnapshot && Number.isFinite(savedAt) && now - savedAt <= GROWATT_LOCAL_SNAPSHOT_FRESH_MS) return latestUiSnapshot;
  try {
    const result = await latestJson(noStoreFetcher(fetcher));
    if (result.rateLimitedUntil) storeCooldown({ until: Math.max(result.rateLimitedUntil, now + GROWATT_RATE_LIMIT_COOLDOWN_MS), reason: "rate_limit" }, storage);
    latestUiSnapshot = { status: { configured: true, connected: true, checkedAt: new Date(now).toISOString() }, latest: result.latest, ...(result.rateLimitedUntil ? { rateLimitedUntil: latestCooldown?.until } : {}) };
    saveGrowattSessionSnapshot(result.latest, storage, now);
    return latestUiSnapshot;
  } catch (value) {
    const error = value as GrowattUiError;
    if (error.status === 401 || error.status === 403 || error.code === "UNAUTHORIZED" || error.code === "FORBIDDEN") { clearGrowattBrowserCache(storage); throw value; }
    if (error.status === 429 || error.code === "GROWATT_RATE_LIMITED") {
      const until = Math.max(error.retryAt ?? 0, now + GROWATT_RATE_LIMIT_COOLDOWN_MS);
      storeCooldown({ until, reason: "rate_limit" }, storage);
      if (latestUiSnapshot) return { ...latestUiSnapshot, rateLimitedUntil: until };
      throw { ...error, retryAt: until };
    }
    throw value;
  }
}
export function singleFlight<T>(loader: () => Promise<T>) { let running: Promise<T> | null = null; return () => { if (!running) running = loader().finally(() => { running = null; }); return running; }; }

export const growattCapabilityLabels: Record<string, string> = { currentPowerW: "Aktuális teljesítmény", todayEnergyKwh: "Mai termelés", monthEnergyKwh: "Havi termelés", yearEnergyKwh: "Éves termelés", lifetimeEnergyKwh: "Teljes termelés" };
