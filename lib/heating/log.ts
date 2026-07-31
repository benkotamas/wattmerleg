import type { ComfortResult, HeatingLog } from "./types";

export const temperatureSourceAfterManualEdit = (): "manual" => "manual";
export function heatingLogGuard(outdoorC:number,targetC:number,comfort:string,summerOverride=false):string|null{if(!comfort)return"Válassz komforteredményt.";if(outdoorC>=targetC&&!summerOverride)return"Ehhez a naphoz nem várható fűtési igény.";return null}

export function buildHeatingLog(input: {
  userId: string; date: string; outdoorC: number; outdoorMinC?:number|null; outdoorMaxC?:number|null; source: "weather_api" | "manual";
  targetC: number; flowC: number; powerKw: number; sensitivity: 0.1 | 0.2 | 0.3;
  comfort: ComfortResult; indoorMinC?: number | null; indoorAvgC?: number | null; pa02?:number|null; notes?: string;
}): HeatingLog {
  return { user_id: input.userId, log_date: input.date, outdoor_temperature_mean_c: input.outdoorC,
    outdoor_temperature_min_c: input.source === "weather_api" ? input.outdoorMinC ?? null : null,
    outdoor_temperature_max_c: input.source === "weather_api" ? input.outdoorMaxC ?? null : null,
    temperature_source: input.source, target_indoor_temperature_c: input.targetC,
    actual_indoor_min_temp_c: input.indoorMinC, actual_indoor_avg_temp_c: input.indoorAvgC,
    flow_temperature_c: input.flowC, boiler_max_power_kw: input.powerKw, boiler_pa02_max_rods:input.pa02,
    thermostat_switching_sensitivity_c: input.sensitivity, comfort_result: input.comfort,
    notes: input.notes ?? null };
}
