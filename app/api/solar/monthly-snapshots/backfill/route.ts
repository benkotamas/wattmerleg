import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildSolarConsumptionAnalysis, monthEnd, monthStart, type SolarPvDailyRow } from "@/lib/solar/monthly-analysis";
import { finalizableMonthlySnapshot, monthlySnapshotFingerprint, relevantMeterRevision, snapshotFingerprintUnchanged, SOLAR_MONTHLY_ALGORITHM_VERSION, validateSnapshotBackfillRange } from "@/lib/solar/monthly-snapshot-service";
import { localIsoDate } from "@/lib/weather/date";
import { monthlyStatistics } from "@/lib/statistics";
import type { MeterReading } from "@/lib/types";
import type { GrowattDailyQuality } from "@/lib/growatt/historical";

export const runtime = "nodejs";
const fail = (status: number, code: string) => NextResponse.json({ error: { code } }, { status, headers: { "Cache-Control": "no-store" } });
async function context() { const client = await createClient(); if (!client) return null; const { data: { user } } = await client.auth.getUser(); return user ? { client, userId: user.id } : null; }

export async function POST(request: NextRequest) {
  const auth = await context(); if (!auth) return fail(401, "UNAUTHORIZED");
  let unknownBody: unknown; try { unknownBody = await request.json(); } catch { return fail(400, "INVALID_JSON"); }
  if (!unknownBody || typeof unknownBody !== "object" || Array.isArray(unknownBody)) return fail(400, "INVALID_BODY");
  const body = unknownBody as Record<string, unknown>; if (typeof body.startMonth !== "string" || typeof body.endMonth !== "string") return fail(400, "INVALID_BODY");
  const currentLocalDate = localIsoDate(new Date(), "Europe/Budapest"), currentMonth = currentLocalDate.slice(0, 7), validation = validateSnapshotBackfillRange(body.startMonth, body.endMonth, currentMonth);
  if (!validation.ok) return fail(400, validation.code);
  const startMonth = body.startMonth, endMonth = body.endMonth, months = validation.months;
  const [meterResult, pvResult, snapshotResult] = await Promise.all([
    auth.client.from("meter_readings").select("id,reading_at,consumption_meter_kwh,production_meter_kwh,note,settlement_period_id,created_at,updated_at").eq("user_id", auth.userId).order("reading_at"),
    auth.client.from("growatt_daily_energy").select("local_date,energy_kwh,quality_status,plant_timezone,updated_at").eq("user_id", auth.userId).gte("local_date", monthStart(startMonth)).lte("local_date", monthEnd(endMonth)).order("local_date"),
    auth.client.from("solar_monthly_analysis_snapshots").select("id,year_month,input_fingerprint").eq("user_id", auth.userId).eq("algorithm_version", SOLAR_MONTHLY_ALGORITHM_VERSION).gte("year_month", startMonth).lte("year_month", endMonth),
  ]);
  if (meterResult.error || pvResult.error || snapshotResult.error) return fail(503, "SNAPSHOT_INPUT_READ_FAILED");
  const readings = (meterResult.data ?? []).map(row => ({ ...row, consumption_meter_kwh: Number(row.consumption_meter_kwh), production_meter_kwh: Number(row.production_meter_kwh) })) as MeterReading[];
  const rawPv = pvResult.data ?? [], pvRows: SolarPvDailyRow[] = rawPv.map(row => ({ localDate: row.local_date, energyKwh: Number(row.energy_kwh), qualityStatus: row.quality_status as GrowattDailyQuality, plantTimezone: row.plant_timezone }));
  const analyses = buildSolarConsumptionAnalysis({ startMonth, endMonth, currentLocalDate, readings, pvRows }).months, meterStats = new Map(monthlyStatistics(readings).map(row => [row.month, row])), existing = new Map((snapshotResult.data ?? []).map(row => [row.year_month, { id: row.id, inputFingerprint: row.input_fingerprint }]));
  const details: Array<{ yearMonth: string; status: "created_or_updated" | "unchanged" | "skipped" | "failed"; reason?: string }> = [];
  for (const analysis of analyses) {
    const meterRevision = relevantMeterRevision(readings, meterStats.get(analysis.yearMonth)?.sourceReadingIds ?? []), monthPv = rawPv.filter(row => row.local_date.startsWith(`${analysis.yearMonth}-`));
    const fingerprint = monthlySnapshotFingerprint({ userId: auth.userId, yearMonth: analysis.yearMonth, ...meterRevision, growattRecordCount: monthPv.length, growattMaxUpdatedAt: monthPv.reduce<string | null>((max, row) => !max || row.updated_at > max ? row.updated_at : max, null), meterTimezone: analysis.meterTimezone, growattTimezone: analysis.pvTimezone });
    const existingSnapshot = existing.get(analysis.yearMonth);
    if (snapshotFingerprintUnchanged(existingSnapshot?.inputFingerprint, fingerprint)) { details.push({ yearMonth: analysis.yearMonth, status: "unchanged" }); continue; }
    const result = finalizableMonthlySnapshot({ analysis, userId: auth.userId, currentMonth, fingerprint });
    if ("skip" in result) {
      if (existingSnapshot) { const { error } = await auth.client.from("solar_monthly_analysis_snapshots").delete().eq("user_id", auth.userId).eq("year_month", analysis.yearMonth).eq("algorithm_version", SOLAR_MONTHLY_ALGORITHM_VERSION); if (error) { details.push({ yearMonth: analysis.yearMonth, status: "failed", reason: "database_delete_failed" }); continue; } }
      details.push({ yearMonth: analysis.yearMonth, status: "skipped", reason: result.skip }); continue;
    }
    const { error } = await auth.client.from("solar_monthly_analysis_snapshots").upsert(result.snapshot, { onConflict: "user_id,year_month,algorithm_version" });
    details.push(error ? { yearMonth: analysis.yearMonth, status: "failed", reason: "database_write_failed" } : { yearMonth: analysis.yearMonth, status: "created_or_updated" });
  }
  return NextResponse.json({ requestedMonths: months.length, createdOrUpdatedMonths: details.filter(x => x.status === "created_or_updated").length, unchangedMonths: details.filter(x => x.status === "unchanged").length, skippedMonths: details.filter(x => x.status === "skipped").length, failedMonths: details.filter(x => x.status === "failed").length, details }, { headers: { "Cache-Control": "no-store" } });
}
