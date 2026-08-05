import{readFileSync}from"node:fs";import{describe,expect,it}from"vitest";const sql=readFileSync("supabase/migrations/014_eon_heating_analysis.sql","utf8");
describe("014 heating analysis migration",()=>{
 it("does not seed personal dates",()=>{expect(sql).not.toContain("2025-10-03");expect(sql).not.toContain("2026-05-06")});
 it("prevents overlap, multiple open periods and concurrent rebuilds",()=>{expect(sql).toContain("heating_operation_one_open_idx");expect(sql).toContain("HEATING_OPERATION_PERIOD_OVERLAP");expect(sql).toContain("claim_heating_analysis");expect(sql).toContain("heating_analysis_runs")});
 it("supports detailed quality and separate baseline semantics",()=>{for(const value of["'mixed'","available_intervals","expected_intervals","coverage_percent","provisional","weather_coverage_percent","grid_import_baseline_kwh","detected_grid_heating_kwh","daily_heating_excess_kwh"])expect(sql).toContain(value)});
 it("derived tables are read-only to browser and writers are service-role only",()=>{expect(sql).toContain("revoke all on public.heating_weather_hourly,public.heating_energy_daily_features,public.heating_analysis_models from anon,authenticated");expect(sql).toContain("from public,anon,authenticated");expect(sql).toContain("to service_role");expect(sql).not.toMatch(/grant execute[^;]+to authenticated/);expect(sql).not.toMatch(/policy heating_(weather|features|models)_(insert|update|delete)/)});
 it("removes stale same-version features",()=>expect(sql).toContain("not exists(select 1 from jsonb_array_elements(features)"));
 it("manual periods and validations retain own-user CRUD",()=>{expect(sql).toContain("heating_operation_update_own");expect(sql).toContain("heating_validations_update_own")});
});
