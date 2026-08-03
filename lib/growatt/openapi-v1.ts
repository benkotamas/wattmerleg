import "server-only";
import { GrowattClient } from "./client";
import { GrowattError } from "./errors";
import { safeNumber } from "./mapper";
import { growattLocalTimeToUtc } from "./time";
import type { GrowattDeviceSummary, GrowattLatestEnergy, GrowattPlantSummary } from "./types";

export const GROWATT_V1_BASE_URL = "https://openapi.growatt.com/v1/";
export const GROWATT_V1_USER_AGENT = "Wattmerleg-GrowattOpenApiV1/1.0";

type V1Path = "plant/list" | "plant/details" | "plant/data" | "plant/power" | "plant/energy" | "device/list" | "device/tlx/tlx_data_info" | "device/tlx/tlx_last_data" | "device/tlx/tlx_data" | "device/mix/mix_data_info" | "device/mix/mix_last_data" | "device/mix/mix_data";
const READ_ONLY = new Set<string>([
  "GET plant/list", "GET plant/details", "GET plant/data", "GET plant/power", "GET plant/energy", "GET device/list",
  "GET device/tlx/tlx_data_info", "POST device/tlx/tlx_last_data", "POST device/tlx/tlx_data",
  "GET device/mix/mix_data_info", "POST device/mix/mix_last_data", "POST device/mix/mix_data",
]);
export function assertV1ReadOnly(method: "GET" | "POST", path: string) { if (!READ_ONLY.has(`${method} ${path}`)) throw new GrowattError("GROWATT_INVALID_RESPONSE", 502); }
type ObjectValue = Record<string, unknown>;
const object = (value: unknown): value is ObjectValue => typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : typeof value === "number" && Number.isFinite(value) ? String(value) : null;

export function processV1Envelope(raw: unknown): unknown {
  if (!object(raw) || !["number", "string"].includes(typeof raw.error_code)) throw new GrowattError("GROWATT_INVALID_RESPONSE", 502);
  const errorCode = Number(raw.error_code);
  if (!Number.isFinite(errorCode)) throw new GrowattError("GROWATT_INVALID_RESPONSE", 502);
  if (errorCode === 10011) throw new GrowattError("GROWATT_PERMISSION_DENIED", 403);
  if (errorCode === 10012) throw new GrowattError("GROWATT_RATE_LIMITED", 429);
  if (errorCode !== 0) throw new GrowattError("GROWATT_INVALID_RESPONSE", 502);
  return raw.data;
}

export class GrowattOpenApiV1 {
  private readonly client: GrowattClient;
  constructor(token: string, options: { baseUrl?: string; fetcher?: ConstructorParameters<typeof GrowattClient>[0]["fetcher"] } = {}) {
    const normalizedToken = token.trim();
    if (!normalizedToken || normalizedToken === "[SENSITIVE]" || /^(YOUR_|<|placeholder)/i.test(normalizedToken)) throw new GrowattError("GROWATT_NOT_CONFIGURED", 503);
    this.client = new GrowattClient({ baseUrl: options.baseUrl ?? GROWATT_V1_BASE_URL, token: normalizedToken, authHeader: "token", authValueTemplate: "{token}", userAgent: GROWATT_V1_USER_AGENT, fetcher: options.fetcher });
  }
  private async call(method: "GET" | "POST", path: V1Path, parameters: Record<string, string> = {}) {
    assertV1ReadOnly(method, path);
    const raw = await this.client.request({ method, path, ...(method === "GET" ? { query: parameters } : { form: parameters }) });
    return processV1Envelope(raw);
  }
  plantList() { return this.call("GET", "plant/list"); }
  plantDetails(plantId: string) { return this.call("GET", "plant/details", { plant_id: plantId }); }
  plantEnergyOverview(plantId: string) { return this.call("GET", "plant/data", { plant_id: plantId }); }
  plantPower(plantId: string, date: string) { return this.call("GET", "plant/power", { plant_id: plantId, date }); }
  plantEnergyHistory(plantId: string, startDate: string, endDate: string, timeUnit: "day" | "month" | "year", page = 1, perpage = 20) { return this.call("GET", "plant/energy", { plant_id: plantId, start_date: startDate, end_date: endDate, time_unit: timeUnit, page: String(page), perpage: String(perpage) }); }
  deviceList(plantId: string) { return this.call("GET", "device/list", { plant_id: plantId }); }
  deviceDetails(type: 5 | 7, serial: string) { return this.call("GET", type === 7 ? "device/tlx/tlx_data_info" : "device/mix/mix_data_info", { device_sn: serial }); }
  deviceEnergy(type: 5 | 7, serial: string) { return this.call("POST", type === 7 ? "device/tlx/tlx_last_data" : "device/mix/mix_last_data", { [type === 7 ? "tlx_sn" : "mix_sn"]: serial }); }
  deviceEnergyHistory(type: 5 | 7, serial: string, startDate: string, endDate: string, timezone: string, page = 1, perpage = 20) { return this.call("POST", type === 7 ? "device/tlx/tlx_data" : "device/mix/mix_data", { [type === 7 ? "tlx_sn" : "mix_sn"]: serial, start_date: startDate, end_date: endDate, timezone_id: timezone, page: String(page), perpage: String(perpage) }); }
}

export function mapV1Plants(data: unknown): GrowattPlantSummary[] {
  if (!object(data) || !Array.isArray(data.plants)) throw new GrowattError("GROWATT_INVALID_RESPONSE", 502);
  return data.plants.map(item => { if (!object(item)) throw new GrowattError("GROWATT_INVALID_RESPONSE", 502); const id = text(item.plant_id); if (!id) throw new GrowattError("GROWATT_INVALID_RESPONSE", 502); return { id, name: text(item.name ?? item.plant_name), timezone: text(item.timezone ?? item.time_zone), status: text(item.status) }; });
}

export function mapV1Devices(data: unknown, plantId: string): GrowattDeviceSummary[] {
  if (!object(data) || !Array.isArray(data.devices)) throw new GrowattError("GROWATT_INVALID_RESPONSE", 502);
  return data.devices.map(item => { if (!object(item)) throw new GrowattError("GROWATT_INVALID_RESPONSE", 502); const serialNumber = text(item.device_sn), id = text(item.device_id) ?? serialNumber; if (!serialNumber || !id) throw new GrowattError("GROWATT_INVALID_RESPONSE", 502); return { id, serialNumber, type: text(item.type), model: text(item.model), status: text(item.status), plantId }; });
}

export function supportedV1DeviceType(value: string | null): 1 | 5 | 7 {
  const type = Number(value); if (type === 1 || type === 5 || type === 7) return type; throw new GrowattError("GROWATT_UNSUPPORTED_DEVICE", 409);
}

export function mapV1PlantEnergy(data: unknown): { todayEnergyKwh: number | null; monthEnergyKwh: number | null; yearEnergyKwh: number | null; lifetimeEnergyKwh: number | null } {
  if (!object(data)) throw new GrowattError("GROWATT_INVALID_RESPONSE", 502);
  return { todayEnergyKwh: safeNumber(data.today_energy), monthEnergyKwh: safeNumber(data.monthly_energy), yearEnergyKwh: safeNumber(data.yearly_energy), lifetimeEnergyKwh: safeNumber(data.total_energy) };
}

export function selectLatestPlantPower(data: unknown, nowLocal: string): { power: number; time: string } | null {
  if (!object(data) || !Array.isArray(data.powers)) throw new GrowattError("GROWATT_INVALID_RESPONSE", 502);
  return data.powers.flatMap(item => { if (!object(item)) return []; const power = safeNumber(item.power), time = text(item.time); return power === null || !time || time > nowLocal ? [] : [{ power, time }]; }).sort((a, b) => a.time.localeCompare(b.time)).at(-1) ?? null;
}

export function mapV1PlantLatest(plantData: unknown, powerData: unknown, context: { plantId: string; device: GrowattDeviceSummary }, nowLocal: string, timezone = "Europe/Budapest"): GrowattLatestEnergy {
  const energy = mapV1PlantEnergy(plantData), latestPower = selectLatestPlantPower(powerData, nowLocal);
  const measuredAt = latestPower ? growattLocalTimeToUtc(latestPower.time, timezone) : null;
  const capabilities = [...Object.entries(energy).filter(([, value]) => value !== null).map(([key]) => key), ...(latestPower ? ["currentPowerW"] : []), ...(measuredAt ? ["measuredAt"] : [])];
  return { plantId: context.plantId, deviceId: context.device.id, deviceSerialNumber: context.device.serialNumber, measuredAt, currentPowerW: latestPower?.power ?? null, ...energy, gridImportPowerW: null, gridExportPowerW: null, loadPowerW: null, batteryChargePowerW: null, batteryDischargePowerW: null, batterySocPercent: null, source: "growatt", rawCapabilities: capabilities };
}

export function mapV1DeviceEnergy(data: unknown, context: { plantId: string; device: GrowattDeviceSummary }): GrowattLatestEnergy {
  if (!object(data)) throw new GrowattError("GROWATT_INVALID_RESPONSE", 502);
  const number = (key: string) => safeNumber(data[key]);
  const measured = text(data.last_update_time ?? data.time);
  const fields: Record<string, number | null> = { currentPowerW: number("pac"), todayEnergyKwh: number("eacToday"), lifetimeEnergyKwh: number("eacTotal"), gridImportPowerW: number("pacToUserTotal"), gridExportPowerW: number("pacToGridTotal"), loadPowerW: number("pacToLocalLoad"), batteryChargePowerW: number("bdc1ChargePower"), batteryDischargePowerW: number("bdc1DischargePower"), batterySocPercent: number("bdc1Soc") };
  return { plantId: context.plantId, deviceId: context.device.id, deviceSerialNumber: context.device.serialNumber, measuredAt: measured && Number.isFinite(Date.parse(measured)) ? new Date(measured).toISOString() : null, currentPowerW: fields.currentPowerW, todayEnergyKwh: fields.todayEnergyKwh, monthEnergyKwh: null, yearEnergyKwh: null, lifetimeEnergyKwh: fields.lifetimeEnergyKwh, gridImportPowerW: fields.gridImportPowerW, gridExportPowerW: fields.gridExportPowerW, loadPowerW: fields.loadPowerW, batteryChargePowerW: fields.batteryChargePowerW, batteryDischargePowerW: fields.batteryDischargePowerW, batterySocPercent: fields.batterySocPercent, source: "growatt", rawCapabilities: Object.entries(fields).filter(([, value]) => value !== null).map(([key]) => key) };
}
