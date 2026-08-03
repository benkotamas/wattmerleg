import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const sql = readFileSync("supabase/migrations/009_solar_monthly_analysis_snapshots.sql", "utf8");
describe("009 solar snapshot migration", () => {
  it("validates month, ratios, non-negative energy and uniqueness", () => { expect(sql).toContain("year_month ~"); expect(sql.match(/between 0 and 1/g)).toHaveLength(2); expect(sql).toContain("grid_import_kwh >= 0"); expect(sql).toContain("unique (user_id, year_month, algorithm_version)"); });
  it("enables own-user RLS and updated_at", () => { expect(sql).toContain("enable row level security"); expect(sql.match(/auth\.uid\(\) = user_id/g)?.length).toBeGreaterThanOrEqual(4); expect(sql).toContain("set_updated_at()"); });
  it("enforces finalized snapshot consistency", () => { expect(sql).toContain("finalized_at timestamptz not null"); expect(sql).toContain("self_consumed_pv_kwh <= pv_production_kwh"); expect(sql).toContain("pv_stored_days <= pv_expected_days"); expect(sql).toContain("pv_complete_days <= pv_stored_days"); expect(sql).toContain("pv_provisional_days = 0"); expect(sql).toContain("pv_invalid_days = 0"); expect(sql).toContain("meter_coverage_start_at <= meter_coverage_end_at"); expect(sql).toContain("solar_monthly_snapshots_status_quality_check"); });
  it("requires finalized calculated values and consistent PV ratio nullability", () => { expect(sql).toContain("self_consumed_pv_kwh numeric not null"); expect(sql).toContain("total_home_consumption_kwh numeric not null"); expect(sql).toContain("pv_coverage_ratio numeric not null"); expect(sql).toContain("pv_production_kwh > 0 and pv_self_consumption_ratio is not null"); expect(sql).toContain("pv_production_kwh = 0 and pv_self_consumption_ratio is null"); expect(sql).toContain("19[0-9]{2}"); });
  it("contains no Growatt identifiers or secrets", () => { expect(sql).not.toMatch(/token|plant_id|device_id|serial_number/i); });
});
