import type { GrowattConnectionStatus, PublicGrowattLatestEnergy } from "./types";

export const GROWATT_FRESH_MAX_MS = 15 * 60_000;
export const GROWATT_DELAYED_MAX_MS = 60 * 60_000;

export type GrowattFreshness = "fresh" | "delayed" | "stale" | "unknown";
export type GrowattUiData = { status: GrowattConnectionStatus; latest: PublicGrowattLatestEnergy | null };
export type GrowattUiError = { status: number; code: string; message: string };

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

async function json<T>(fetcher: typeof fetch, path: string): Promise<T> { const response = await fetcher(path, { credentials: "same-origin" }); const body = await response.json().catch(() => ({})) as { error?: { code?: string } } & T; if (!response.ok) throw { status: response.status, code: body.error?.code ?? "GROWATT_UNAVAILABLE", message: "Growatt request failed" } satisfies GrowattUiError; return body; }
export async function fetchGrowattUiData(fetcher: typeof fetch = fetch): Promise<GrowattUiData> {
  const latest = await json<PublicGrowattLatestEnergy>(fetcher, "/api/growatt/latest");
  return { status: { configured: true, connected: true, checkedAt: new Date().toISOString() }, latest };
}
export function singleFlight<T>(loader: () => Promise<T>) { let running: Promise<T> | null = null; return () => { if (!running) running = loader().finally(() => { running = null; }); return running; }; }

export const growattCapabilityLabels: Record<string, string> = { currentPowerW: "Aktuális teljesítmény", todayEnergyKwh: "Mai termelés", monthEnergyKwh: "Havi termelés", yearEnergyKwh: "Éves termelés", lifetimeEnergyKwh: "Teljes termelés" };
