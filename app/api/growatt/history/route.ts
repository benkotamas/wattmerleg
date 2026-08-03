import { NextRequest, NextResponse } from "next/server";
import { growattHistoryRouteContext } from "@/lib/growatt/history-route";
import { GROWATT_HISTORY_MAX_ROWS, inclusiveDays, validIsoDate } from "@/lib/growatt/historical";

export const runtime = "nodejs";
const error = (status: number, code: string) => NextResponse.json({ error: { code } }, { status, headers: { "Cache-Control": "no-store" } });
export async function GET(request: NextRequest) {
  const context = await growattHistoryRouteContext(); if (context.access === "unauthenticated") return error(401, "UNAUTHORIZED"); if (context.access === "forbidden") return error(403, "FORBIDDEN"); if (context.access === "not_configured") return error(503, "GROWATT_NOT_CONFIGURED");
  const startDate = request.nextUrl.searchParams.get("startDate") ?? "", endDate = request.nextUrl.searchParams.get("endDate") ?? "";
  if (!validIsoDate(startDate) || !validIsoDate(endDate) || startDate > endDate || inclusiveDays(startDate, endDate) > GROWATT_HISTORY_MAX_ROWS) return error(400, "INVALID_DATE_RANGE");
  const { data, error: queryError } = await context.client.from("growatt_daily_energy").select("local_date,energy_kwh,quality_status,fetched_at,plant_timezone").eq("user_id", context.userId).gte("local_date", startDate).lte("local_date", endDate).order("local_date").limit(GROWATT_HISTORY_MAX_ROWS);
  if (queryError) return error(503, "HISTORY_UNAVAILABLE");
  const rows = (data ?? []).map((row: { local_date: string; energy_kwh: number | string; quality_status: string; fetched_at: string; plant_timezone: string }) => ({ localDate: row.local_date, energyKwh: Number(row.energy_kwh), qualityStatus: row.quality_status, fetchedAt: row.fetched_at, plantTimezone: row.plant_timezone, apiLastUpdateAt: null }));
  const [earliest, latest, lastSync] = await Promise.all([
    context.client.from("growatt_daily_energy").select("local_date", { count: "exact" }).eq("user_id", context.userId).order("local_date").limit(1),
    context.client.from("growatt_daily_energy").select("local_date").eq("user_id", context.userId).order("local_date", { ascending: false }).limit(1),
    context.client.from("growatt_daily_energy").select("fetched_at").eq("user_id", context.userId).order("fetched_at", { ascending: false }).limit(1),
  ]);
  return NextResponse.json({ startDate, endDate, rows, summary: { earliestDate: earliest.data?.[0]?.local_date ?? null, latestDate: latest.data?.[0]?.local_date ?? null, storedDays: earliest.count ?? 0, lastSyncAt: lastSync.data?.[0]?.fetched_at ?? null } }, { headers: { "Cache-Control": "no-store" } });
}
