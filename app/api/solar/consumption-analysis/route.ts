import { NextRequest, NextResponse } from "next/server";
import { growattHistoryRouteContext } from "@/lib/growatt/history-route";
import { buildSolarConsumptionAnalysis, monthEnd, monthRange, monthStart, validYearMonth } from "@/lib/solar/monthly-analysis";
import { localIsoDate } from "@/lib/weather/date";
import type { MeterReading } from "@/lib/types";
import type { GrowattDailyQuality } from "@/lib/growatt/historical";

export const runtime = "nodejs";
const error = (status: number, code: string) => NextResponse.json({ error: { code } }, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(request: NextRequest) {
  const context = await growattHistoryRouteContext();
  if (context.access === "unauthenticated") return error(401, "UNAUTHORIZED");
  if (context.access === "forbidden") return error(403, "FORBIDDEN");
  if (context.access === "not_configured") return error(503, "GROWATT_NOT_CONFIGURED");
  const startMonth = request.nextUrl.searchParams.get("startMonth") ?? "", endMonth = request.nextUrl.searchParams.get("endMonth") ?? "", currentLocalDate = localIsoDate(new Date(), "Europe/Budapest"), currentMonth = currentLocalDate.slice(0, 7);
  if (!validYearMonth(startMonth) || !validYearMonth(endMonth) || startMonth > endMonth) return error(400, "INVALID_MONTH_RANGE");
  const requestedMonths = monthRange(startMonth, endMonth);
  if (requestedMonths.length > 24) return error(400, "MONTH_RANGE_TOO_LONG");
  if (endMonth > currentMonth) return error(400, "FUTURE_MONTH");
  const endDate = endMonth === currentMonth ? currentLocalDate : monthEnd(endMonth);
  const [meterResult, pvResult] = await Promise.all([
    context.client.from("meter_readings").select("id,reading_at,consumption_meter_kwh,production_meter_kwh,note,settlement_period_id,created_at,updated_at").eq("user_id", context.userId).order("reading_at"),
    context.client.from("growatt_daily_energy").select("local_date,energy_kwh,quality_status,plant_timezone").eq("user_id", context.userId).gte("local_date", monthStart(startMonth)).lte("local_date", endDate).order("local_date"),
  ]);
  if (meterResult.error || pvResult.error) return error(503, "SOLAR_ANALYSIS_UNAVAILABLE");
  const readings = (meterResult.data ?? []).map(row => ({ ...row, consumption_meter_kwh: Number(row.consumption_meter_kwh), production_meter_kwh: Number(row.production_meter_kwh) })) as MeterReading[];
  const pvRows = (pvResult.data ?? []).map(row => ({ localDate: row.local_date, energyKwh: Number(row.energy_kwh), qualityStatus: row.quality_status as GrowattDailyQuality, plantTimezone: row.plant_timezone }));
  const response = buildSolarConsumptionAnalysis({ startMonth, endMonth, currentLocalDate, readings, pvRows });
  return NextResponse.json(response, { headers: { "Cache-Control": "private, no-store" } });
}
