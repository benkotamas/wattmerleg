import type { HeatSource, HeatingLog, HeatingProfile, HeatingRecommendation } from "./types";

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
export function isValidBoschPa02(value: number | null | undefined) { return value == null || Number.isInteger(value) && value >= 1 && value <= 6; }
export function isValidBoschPa03(value: number | null | undefined) { return value == null || Number.isInteger(value) && value >= 0 && value <= 4; }

export function estimatedBuildingHeatDemand(designLossKw: number | null | undefined, designIndoorC: number | null | undefined, designOutdoorC: number | null | undefined, targetIndoorC: number, outdoorC: number): number | null {
  if (!finite(designLossKw) || designLossKw <= 0 || !finite(designIndoorC) || !finite(designOutdoorC) || !finite(targetIndoorC) || !finite(outdoorC)) return null;
  const designDelta = designIndoorC - designOutdoorC;
  if (designDelta <= 0) return null;
  return designLossKw * Math.max(0, targetIndoorC - outdoorC) / designDelta;
}

export function interpolateTemperature(minC: number | null | undefined, maxC: number | null | undefined): number | null {
  return finite(minC) && finite(maxC) && minC <= maxC ? (minC + maxC) / 2 : null;
}

export function validateHeatingLog(log: HeatingLog, nominalPowerKw?: number, configuredMaximumKw?: number): string[] {
  const errors: string[] = [];
  if (!finite(log.outdoor_temperature_mean_c) || log.outdoor_temperature_mean_c < -50 || log.outdoor_temperature_mean_c > 50) errors.push("Érvénytelen külső hőmérséklet.");
  if (!finite(log.target_indoor_temperature_c) || log.target_indoor_temperature_c < 5 || log.target_indoor_temperature_c > 35) errors.push("Érvénytelen beltéri célhőmérséklet.");
  if (!finite(log.flow_temperature_c) || log.flow_temperature_c < 20 || log.flow_temperature_c > 90) errors.push("Érvénytelen előremenő hőmérséklet.");
  if (!finite(log.boiler_max_power_kw) || log.boiler_max_power_kw <= 0 || (finite(nominalPowerKw) && log.boiler_max_power_kw > nominalPowerKw)) errors.push("A kazánteljesítmény nem lépheti túl a névleges teljesítményt.");
  if (finite(configuredMaximumKw) && log.boiler_max_power_kw > configuredMaximumKw) errors.push("A naplózott teljesítmény nem lépheti túl a profilban engedélyezett maximumot.");
  if (!isValidBoschPa02(log.boiler_pa02_max_rods)) errors.push("A PA02 értéke csak 1–6 lehet.");
  if (![0.1, 0.2, 0.3].includes(log.thermostat_switching_sensitivity_c)) errors.push("Nem támogatott termosztát-érzékenység.");
  return errors;
}

export function similarHeatingLogs(logs: HeatingLog[], outdoorC: number, targetC: number, nominalPowerKw: number, configuredMaximumKw?: number): HeatingLog[] {
  return logs.filter(log => validateHeatingLog(log, nominalPowerKw, configuredMaximumKw).length === 0 && Math.abs(log.outdoor_temperature_mean_c! - outdoorC) <= 3 && Math.abs(log.target_indoor_temperature_c - targetC) <= 1).sort((a,b) => Math.abs(a.outdoor_temperature_mean_c! - outdoorC) - Math.abs(b.outdoor_temperature_mean_c! - outdoorC));
}

export function heatingRecommendation(profile: HeatingProfile, source: HeatSource, logs: HeatingLog[], outdoorC: number): HeatingRecommendation {
  const target = profile.target_indoor_temperature_c;
  const demand = estimatedBuildingHeatDemand(profile.design_heat_loss_kw, profile.design_indoor_temperature_c, profile.design_outdoor_temperature_c, target, outdoorC);
  if (!finite(outdoorC) || outdoorC < -50 || outdoorC > 50 || source.heat_source_type !== "electric_boiler" || source.nominal_power_kw <= 0) return { estimatedHeatDemandKw: null, recommendedFlowTemperatureC: null, recommendedBoilerPowerKw: null, confidence: "low", similarLogCount: 0, reason: "Hiányos vagy érvénytelen adatok miatt nem adható biztonságos ajánlás.", capacityWarning: null };
  // A korábbi, magasabb korláttal készült log történeti adat marad, de nem
  // válhat a jelenlegi maximumra clampelt, valójában nem tesztelt referenciává.
  const similar = similarHeatingLogs(logs, outdoorC, target, source.nominal_power_kw, source.maximum_configurable_power_kw);
  const cold = similar.filter(log => log.comfort_result === "too_cold");
  const comfortable = similar.filter(log => log.comfort_result === "comfortable" && !cold.some(failed =>
    failed.outdoor_temperature_mean_c! >= outdoorC - 0.5 &&
    log.flow_temperature_c <= failed.flow_temperature_c &&
    log.boiler_max_power_kw <= failed.boiler_max_power_kw));
  let flow: number | null = null;
  let power: number | null = null;
  let reference: HeatingLog | null = null;
  if (comfortable.length) {
    reference = [...comfortable].sort((a,b) => Math.abs(a.outdoor_temperature_mean_c! - outdoorC) - Math.abs(b.outdoor_temperature_mean_c! - outdoorC) || a.flow_temperature_c + a.boiler_max_power_kw - b.flow_temperature_c - b.boiler_max_power_kw)[0];
    flow = reference.flow_temperature_c;
    power = reference.boiler_max_power_kw;
    // Egy kísérletben csak az előremenő változik; a bizonyított teljesítménypár megmarad.
    if (outdoorC >= reference.outdoor_temperature_mean_c! + 1) flow -= 1;
    flow = clamp(Math.round(flow), 20, 90);
  }
  const maximum = Math.min(source.nominal_power_kw, source.maximum_configurable_power_kw);
  const minimum = source.minimum_configurable_power_kw ?? 0.5;
  if (power == null && demand != null) power = Math.round(clamp(demand * 1.35, minimum, maximum) * 2) / 2;
  if (power != null) power = clamp(power, minimum, maximum);
  const spread = comfortable.length ? Math.max(...comfortable.map(x => x.flow_temperature_c)) - Math.min(...comfortable.map(x => x.flow_temperature_c)) : Infinity;
  const strongComfort = comfortable.filter(log => log.actual_indoor_min_temp_c == null || log.actual_indoor_min_temp_c >= log.target_indoor_temperature_c - 0.5);
  const confidence = strongComfort.length >= 3 && comfortable.length === strongComfort.length && spread <= 2 ? "high" : comfortable.length >= 1 ? "medium" : "low";
  const capacityWarning = demand != null && demand > maximum ? "A becsült pillanatnyi hőigény meghaladja a jelenleg engedélyezett kazánteljesítményt. A korlát ilyen körülmények között elégtelen lehet." : null;
  const baseReason = reference ? `Referencia: ${reference.log_date}, ${reference.flow_temperature_c} °C / ${reference.boiler_max_power_kw} kW, megfelelő komfort. ${flow !== reference.flow_temperature_c ? "Most csak az előremenő 1 °C-os csökkentése próbálható; a teljesítmény változatlan." : "A bizonyított konfiguráció változtatás nélkül javasolt."}` : cold.length ? "A hasonló megfigyelések között az ismert konfiguráció elégtelen volt; nincs biztonságosan ajánlható sikeres referenciapár." : demand == null ? "Még nincs elegendő adat megbízható ajánláshoz." : "Csak becsült épület-hőigény áll rendelkezésre; az előremenőhöz további megfigyelés kell.";
  const reason = capacityWarning ? `${baseReason} FIGYELMEZTETÉS: ${capacityWarning}` : baseReason;
  return { estimatedHeatDemandKw: demand, recommendedFlowTemperatureC: flow, recommendedBoilerPowerKw: power, confidence, similarLogCount: comfortable.length, reason, capacityWarning, referenceLog: reference };
}
