import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { monthRange, validYearMonth } from "@/lib/solar/monthly-analysis";
import { SOLAR_MONTHLY_ALGORITHM_VERSION } from "@/lib/solar/monthly-snapshot-service";

export const runtime = "nodejs";
const fail = (status: number, code: string) => NextResponse.json({ error: { code } }, { status, headers: { "Cache-Control": "no-store" } });
async function context() { const client = await createClient(); if (!client) return null; const { data: { user } } = await client.auth.getUser(); return user ? { client, userId: user.id } : null; }

export async function GET(request: NextRequest) {
  const auth = await context(); if (!auth) return fail(401, "UNAUTHORIZED");
  const startMonth = request.nextUrl.searchParams.get("startMonth"), endMonth = request.nextUrl.searchParams.get("endMonth");
  if (typeof startMonth !== "string" || typeof endMonth !== "string") return fail(400, "MONTH_RANGE_REQUIRED");
  if (!validYearMonth(startMonth) || !validYearMonth(endMonth) || startMonth > endMonth || monthRange(startMonth, endMonth).length > 24) return fail(400, "INVALID_MONTH_RANGE");
  const { data, error } = await auth.client.from("solar_monthly_analysis_snapshots").select("year_month,timezone,meter_source,grid_import_kwh,grid_export_kwh,pv_production_kwh,self_consumed_pv_kwh,total_home_consumption_kwh,pv_self_consumption_ratio,pv_coverage_ratio,analysis_status,meter_data_quality,pv_expected_days,pv_stored_days,pv_complete_days,pv_provisional_days,pv_invalid_days,meter_coverage_start_at,meter_coverage_end_at,algorithm_version,calculated_at").eq("user_id", auth.userId).eq("algorithm_version", SOLAR_MONTHLY_ALGORITHM_VERSION).not("finalized_at", "is", null).gte("year_month", startMonth).lte("year_month", endMonth).order("year_month");
  return error ? fail(503, "SNAPSHOT_READ_FAILED") : NextResponse.json({ snapshots: data ?? [] }, { headers: { "Cache-Control": "private, no-store" } });
}
