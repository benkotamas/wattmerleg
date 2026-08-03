import { NextRequest, NextResponse } from "next/server";
import { growattHistoryRouteContext } from "@/lib/growatt/history-route";
import { growattJobRange, publicGrowattJob, type GrowattJobSelection, validYearMonth } from "@/lib/growatt/history-jobs";
import { localIsoDate } from "@/lib/weather/date";
import { inclusiveDays } from "@/lib/growatt/historical";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store, max-age=0, must-revalidate" };
const active = ["queued", "running", "rate_limited", "paused", "retry_pending", "finalizing_snapshots", "failed", "cancelling"];
const fail = (status: number, code: string) => NextResponse.json({ error: { code } }, { status, headers });
const object = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const authFailure = (access: string) => fail(access === "unauthenticated" ? 401 : access === "forbidden" ? 403 : 503, access.toUpperCase());
export async function GET() {
  const context = await growattHistoryRouteContext(); if (context.access !== "allowed") return authFailure(context.access);
  const [job, settings, lastFinished] = await Promise.all([
    context.client.from("growatt_history_sync_jobs").select("*").eq("user_id", context.userId).in("status", active).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    context.client.from("growatt_history_sync_settings").select("history_start_month").eq("user_id", context.userId).maybeSingle(),
    context.client.from("growatt_history_sync_jobs").select("*").eq("user_id",context.userId).in("status",["completed","cancelled"]).order("completed_at",{ascending:false}).limit(1).maybeSingle(),
  ]);
  if (job.error || settings.error || lastFinished.error) return fail(503, "SYNC_JOB_READ_FAILED");
  let current=job.data,recoveredFinished=null;if(current?.status==="cancelling"&&(!current.claim_token||!current.lease_expires_at||Date.parse(current.lease_expires_at)<=Date.now())){const recovered=await context.client.rpc("cancel_growatt_history_sync_job",{job_id:current.id,expected_status:"cancelling"});if(recovered.error)return fail(503,"SYNC_JOB_WRITE_FAILED");recoveredFinished=recovered.data?.[0]??null;current=null;}
  return NextResponse.json({ job: publicGrowattJob(current), lastFinishedJob: publicGrowattJob(recoveredFinished??lastFinished.data), historyStartMonth: settings.data?.history_start_month?.slice(0, 7) ?? "2022-01" }, { headers });
}

export async function POST(request: NextRequest) {
  const context = await growattHistoryRouteContext(); if (context.access !== "allowed") return authFailure(context.access);
  let body: unknown; try { body = await request.json(); } catch { return fail(400, "INVALID_BODY"); }
  if (!object(body)) return fail(400, "INVALID_BODY");
  const selection = body.selection as GrowattJobSelection, historyStartMonth = typeof body.historyStartMonth === "string" ? body.historyStartMonth : "";
  if (!["current_month", "previous_month", "custom_month", "repair_incomplete", "full_history"].includes(selection) || !validYearMonth(historyStartMonth)) return fail(400, "INVALID_SELECTION");
  const currentDate = localIsoDate(new Date(), "Europe/Budapest"); let range;
  try { range = growattJobRange(selection, currentDate, typeof body.customMonth === "string" ? body.customMonth : undefined, historyStartMonth); } catch { return fail(400, "INVALID_RANGE"); }
  const existing = await context.client.from("growatt_history_sync_jobs").select("id").eq("user_id", context.userId).in("status", active).limit(1).maybeSingle();
  if (existing.error) return fail(503, "SYNC_JOB_READ_FAILED"); if (existing.data) return fail(409, "SYNC_ALREADY_RUNNING");
  const setting = await context.client.from("growatt_history_sync_settings").upsert({ user_id: context.userId, history_start_month: `${historyStartMonth}-01` }, { onConflict: "user_id" }); if (setting.error) return fail(503, "SYNC_SETTINGS_WRITE_FAILED");
  const coverage = await context.client.from("growatt_daily_energy").select("local_date,quality_status").eq("user_id", context.userId).gte("local_date", range.startDate).lte("local_date", range.endDate); if (coverage.error) return fail(503, "HISTORY_DATABASE_READ_FAILED");
  const complete = new Set((coverage.data ?? []).filter(row => row.quality_status === "complete").map(row => row.local_date)).size;
  const created = await context.client.from("growatt_history_sync_jobs").insert({ user_id: context.userId, selection_type: selection, start_date: range.startDate, end_date: range.endDate, cursor_date: range.startDate, status: "queued", total_days: inclusiveDays(range.startDate, range.endDate), completed_days: complete, already_complete_days: complete }).select("*").single();
  if (created.error) return fail(created.error.code === "23505" ? 409 : 503, created.error.code === "23505" ? "SYNC_ALREADY_RUNNING" : "SYNC_JOB_WRITE_FAILED");
  return NextResponse.json({ job: publicGrowattJob(created.data) }, { status: 201, headers });
}

export async function PATCH(request: NextRequest) {
  const context = await growattHistoryRouteContext(); if (context.access !== "allowed") return authFailure(context.access);
  let body: unknown; try { body = await request.json(); } catch { return fail(400, "INVALID_BODY"); }
  if (!object(body) || typeof body.id !== "string" || !body.id.trim() || typeof body.action !== "string" || !["pause", "resume", "cancel"].includes(body.action)) return fail(400, "INVALID_BODY");
  const current = await context.client.from("growatt_history_sync_jobs").select("*").eq("id", body.id).eq("user_id", context.userId).single(); if (current.error) return fail(404, "SYNC_JOB_NOT_FOUND");
  const prior = current.data.status as string, liveClaim = Boolean(current.data.claim_token && current.data.lease_expires_at && Date.parse(current.data.lease_expires_at) > Date.now());
  let status: string;
  if (body.action === "pause") { if (!["queued", "running", "finalizing_snapshots"].includes(prior)) return fail(409, "INVALID_JOB_TRANSITION"); status = "paused"; }
  else if (body.action === "resume") { if (liveClaim) return fail(409, "SYNC_JOB_BUSY"); if (!["paused", "failed", "retry_pending", "rate_limited"].includes(prior)) return fail(409, "INVALID_JOB_TRANSITION"); if (["retry_pending", "rate_limited"].includes(prior) && current.data.retry_after && Date.parse(current.data.retry_after) > Date.now()) return fail(409, "RETRY_NOT_READY"); status = "queued"; }
  else { if (!["queued", "running", "paused", "failed", "retry_pending", "rate_limited", "finalizing_snapshots", "cancelling"].includes(prior)) return fail(409, "INVALID_JOB_TRANSITION");const cancelled=await context.client.rpc("cancel_growatt_history_sync_job",{job_id:body.id,expected_status:prior});if(cancelled.error)return fail(503,"SYNC_JOB_WRITE_FAILED");if(!cancelled.data?.length)return fail(409,"STALE_JOB_STATE");return NextResponse.json({job:publicGrowattJob(cancelled.data[0])},{headers}); }
  const result = await context.client.from("growatt_history_sync_jobs").update({ status, retry_after: body.action === "resume" ? null : current.data.retry_after, ...(body.action==="resume"?{history_retry_count:0,snapshot_retry_count:0}:{}), last_activity_at: new Date().toISOString(), ...(status === "cancelled" ? { completed_at: new Date().toISOString() } : {}) }).eq("id", body.id).eq("user_id", context.userId).eq("status", prior).select("*").maybeSingle();
  if (result.error) return fail(503, "SYNC_JOB_WRITE_FAILED"); if (!result.data) return fail(409, "STALE_JOB_STATE"); return NextResponse.json({ job: publicGrowattJob(result.data) }, { headers });
}
