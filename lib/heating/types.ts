export type ComfortResult = "too_cold" | "comfortable" | "too_warm";
export type RecommendationConfidence = "low" | "medium" | "high";

export interface HeatingProfile {
  heated_area_m2?: number | null; conditioned_volume_m3?: number | null; specific_heat_loss_w_m3k?: number | null; target_indoor_temperature_c: number;
  design_heat_loss_kw?: number | null; design_heat_loss_is_estimate?: boolean; design_indoor_temperature_c?: number | null; design_outdoor_temperature_c?: number | null;
  building_energy_rating?: string | null; specific_heat_demand_kwh_m2_year?: number | null;
  heat_distribution_type: "radiators"; weather_location_name?: string | null;
  weather_latitude?: number | null; weather_longitude?: number | null; weather_timezone: string;
  optimization_enabled: boolean;
}
export interface HeatSource { manufacturer: string; model: string; heat_source_type: "electric_boiler" | "heat_pump" | "other"; nominal_power_kw: number; minimum_configurable_power_kw?: number | null; maximum_configurable_power_kw: number; has_buffer_tank: boolean; current_flow_temperature_c?: number | null; boiler_pa02_max_rods?: number | null; boiler_pa03_regulation_mode?: number | null; control_notes?: string | null; }
export interface ThermostatSettings { manufacturer: string; model: string; thermostat_type: "on_off"; location_room?: string | null; location_floor?: string | null; target_temperature_c: number; switching_sensitivity_c: 0.1 | 0.2 | 0.3; calibration_offset_c: number; }
export interface HeatingLog { id?: string; user_id?: string; log_date: string; outdoor_temperature_mean_c?: number | null; outdoor_temperature_min_c?: number | null; outdoor_temperature_max_c?: number | null; temperature_source: "weather_api" | "manual"; target_indoor_temperature_c: number; actual_indoor_temperature_c?: number | null; actual_indoor_min_temp_c?: number | null; actual_indoor_avg_temp_c?: number | null; flow_temperature_c: number; boiler_max_power_kw: number; boiler_pa02_max_rods?: number | null; thermostat_switching_sensitivity_c: 0.1 | 0.2 | 0.3; comfort_result: ComfortResult; notes?: string | null; }
export interface Radiator { id?: string; user_id?: string; room_name: string; floor?: string | null; radiator_type?: string | null; width_mm?: number | null; height_mm?: number | null; quantity: number; nominal_output_w?: number | null; }
export interface HeatingRecommendation { estimatedHeatDemandKw: number | null; recommendedFlowTemperatureC: number | null; recommendedBoilerPowerKw: number | null; confidence: RecommendationConfidence; similarLogCount: number; reason: string; capacityWarning: string | null; referenceLog?: HeatingLog | null; }
