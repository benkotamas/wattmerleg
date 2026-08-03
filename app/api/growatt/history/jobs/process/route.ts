import { NextRequest, NextResponse } from "next/server";
import { growattHistoryRouteContext } from "@/lib/growatt/history-route";
import { classifySnapshotBackfill, completeClosedMonths, firstUnsettledDate, nextGrowattJobChunk, publicGrowattJob, retryDecision, satisfiedCoverageDates, type GrowattSyncJob, type JobCoverage } from "@/lib/growatt/history-jobs";
import { addLocalDays } from "@/lib/growatt/historical";
import { syncGrowattHistory, type HistoricalDatabase } from "@/lib/growatt/historical-sync";
import { asGrowattError } from "@/lib/growatt/errors";
import { localIsoDate } from "@/lib/weather/date";
import { POST as refreshSnapshots } from "@/app/api/solar/monthly-snapshots/backfill/route";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store, max-age=0, must-revalidate" };
const fail = (status: number, code: string) => NextResponse.json({ error: { code } }, { status, headers });
const validBody = (value: unknown): value is { id: string } => typeof value === "object" && value !== null && !Array.isArray(value) && "id" in value && typeof value.id === "string" && value.id.trim().length > 0;
const dates = function* (start: string, end: string) { for (let date = start; date <= end; date = addLocalDays(date, 1)) yield date; };

export async function POST(request: NextRequest) {
  const context = await growattHistoryRouteContext(); if (context.access !== "allowed") return fail(context.access === "unauthenticated" ? 401 : context.access === "forbidden" ? 403 : 503, context.access.toUpperCase());
  let body: unknown; try { body = await request.json(); } catch { return fail(400, "INVALID_BODY"); } if (!validBody(body)) return fail(400, "INVALID_BODY");
  const found = await context.client.from("growatt_history_sync_jobs").select("*").eq("id", body.id).eq("user_id", context.userId).single(); if (found.error) return fail(404, "SYNC_JOB_NOT_FOUND"); const job = found.data as GrowattSyncJob;
  if (["completed", "cancelled", "cancelling", "paused", "failed"].includes(job.status)) return NextResponse.json({ job: publicGrowattJob(job as unknown as Record<string, unknown>) }, { headers });
  if (job.retry_after && Date.parse(job.retry_after) > Date.now()) return NextResponse.json({ job: publicGrowattJob(job as unknown as Record<string, unknown>) }, { status: 429, headers: { ...headers, "Retry-After": String(Math.max(1, Math.ceil((Date.parse(job.retry_after) - Date.now()) / 1000))) } });
  const currentLocalDate = localIsoDate(new Date(), "Europe/Budapest");
  const readCoverage = async () => { const result = await context.client.from("growatt_daily_energy").select("local_date,quality_status,plant_timezone").eq("user_id", context.userId).gte("local_date", job.start_date).lte("local_date", job.end_date); if (result.error) throw new Error("HISTORY_DATABASE_READ_FAILED"); return (result.data ?? []).map(row => ({ localDate: row.local_date, qualityStatus: row.quality_status, plantTimezone: row.plant_timezone })); };
  if (job.status === "finalizing_snapshots") return finalizeSnapshotBatch(request, context.client, job, currentLocalDate, readCoverage);
  let before: Array<JobCoverage & { plantTimezone?: string | null }>; try { before = await readCoverage(); } catch { return fail(503, "HISTORY_DATABASE_READ_FAILED"); }
  const completionSatisfiedBefore = satisfiedCoverageDates(before, currentLocalDate), effectiveCursor = firstUnsettledDate(job.start_date, job.end_date, completionSatisfiedBefore);
  const fetchSatisfied = new Set(before.filter(row => row.qualityStatus === "complete").map(row => row.localDate)), fetchCursor = firstUnsettledDate(job.start_date, job.end_date, fetchSatisfied);
  const chunk = fetchCursor ? nextGrowattJobChunk(fetchCursor, job.end_date, fetchSatisfied) : null;
  const claimToken = crypto.randomUUID(), claimStart = chunk?.startDate ?? job.end_date, claimEnd = chunk?.endDate ?? job.end_date;
  const claim = await context.client.rpc("claim_growatt_history_sync_job_block", { job_id: job.id, expected_cursor: job.cursor_date, chunk_start: claimStart, chunk_end: claimEnd, new_claim_token: claimToken, lease_seconds: 300 });
  if (claim.error) return fail(503, "SYNC_CLAIM_FAILED"); if (!claim.data?.length) return fail(409, "SYNC_JOB_BUSY");

  if (!chunk) {
    const completedDays = completionSatisfiedBefore.size, trulyComplete = firstUnsettledDate(job.start_date, job.end_date, completionSatisfiedBefore) === null && completedDays === job.total_days;
    const retry=retryDecision(job.history_retry_count??0),finish = await finishJob(context.client, job, claimToken, trulyComplete ? addLocalDays(job.end_date, 1) : (effectiveCursor ?? job.cursor_date), trulyComplete ? "finalizing_snapshots" : retry.failed?"failed":"retry_pending", completedDays, [], trulyComplete ? [] : [...dates(job.start_date, job.end_date)].filter(date => !completionSatisfiedBefore.has(date)), trulyComplete ? null : "INCOMPLETE_COVERAGE", trulyComplete||retry.failed?null:retry.retryAt,0,0,trulyComplete?0:retry.count);
    if (!finish) return fail(503, "SYNC_CHECKPOINT_WRITE_FAILED"); return NextResponse.json({ job: publicGrowattJob(finish as unknown as Record<string, unknown>) }, { status: 202, headers });
  }

  const database: HistoricalDatabase = { existingCoverage: async (_userId, start, end) => (await readCoverage()).filter(row => row.localDate >= start && row.localDate <= end), upsert: rows => context.client.from("growatt_daily_energy").upsert(rows, { onConflict: "user_id,local_date" }) };
  try {
    const result = await syncGrowattHistory({ userId: context.userId, startDate: chunk.startDate, endDate: chunk.endDate, database, rateLimitRetries: 0 });
    const after = await readCoverage(), satisfied = satisfiedCoverageDates(after, currentLocalDate), firstMissing = firstUnsettledDate(job.start_date, job.end_date, satisfied), blockMissing = firstUnsettledDate(chunk.startDate, chunk.endDate, satisfied), completedDays = satisfied.size;
    const refreshed = [...satisfied].filter(date => date >= chunk.startDate && date <= chunk.endDate && !completionSatisfiedBefore.has(date));
    const failed = blockMissing ? [...dates(chunk.startDate, chunk.endDate)].filter(date => !satisfied.has(date)) : [];
    const completed = firstMissing === null && completedDays === job.total_days,progressed=completedDays>completionSatisfiedBefore.size,retry=retryDecision(job.history_retry_count??0),nextStatus = completed ? "finalizing_snapshots" : blockMissing ? (progressed?"retry_pending":retry.failed?"failed":"retry_pending") : "running", retryAt = blockMissing&&!progressed&&!retry.failed ? retry.retryAt : blockMissing&&progressed?retryDecision(0).retryAt:null;
    const finish = await finishJob(context.client, job, claimToken, firstMissing ?? addLocalDays(job.end_date, 1), nextStatus, completedDays, refreshed, failed, blockMissing ? "INCOMPLETE_COVERAGE" : null, retryAt, result.invalidRecords, result.duplicateRecords,progressed||completed?0:blockMissing?retry.count:0);
    if (!finish) return fail(503, "SYNC_CHECKPOINT_WRITE_FAILED"); return NextResponse.json({ job: publicGrowattJob(finish as unknown as Record<string, unknown>) }, { status: 202, headers });
  } catch (error) {
    const safe = asGrowattError(error), rate = safe.code === "GROWATT_RATE_LIMITED", terminal = ["GROWATT_AUTH_FAILED", "GROWATT_PERMISSION_DENIED", "GROWATT_NOT_CONFIGURED"].includes(safe.code),retry=retryDecision(job.history_retry_count??0), exhausted=retry.failed,delay=rate?Math.max(300,retry.delaySeconds):retry.delaySeconds,retryAt = terminal||exhausted ? null : new Date(Date.now()+delay*1000).toISOString(), nextStatus = terminal||exhausted?"failed":rate?"rate_limited":"retry_pending";
    const finish = await finishJob(context.client, job, claimToken, effectiveCursor ?? job.cursor_date, nextStatus, completionSatisfiedBefore.size, [], [...dates(chunk.startDate, chunk.endDate)], safe.code, retryAt,0,0,retry.count);
    if (!finish) return fail(503, "SYNC_CHECKPOINT_WRITE_FAILED"); return NextResponse.json({ job: publicGrowattJob(finish as unknown as Record<string, unknown>) }, { status: exhausted||terminal ? 503 : rate ? 429 : 202, headers: { ...headers, ...(retryAt ? { "Retry-After": String(delay) } : {}) } });
  }
}

// Supabase's generated fluent client type is intentionally kept at the route boundary.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function finishJob(client: any, job: GrowattSyncJob, token: string, cursor: string, status: string, completed: number, refreshed: string[], failed: string[], errorCode: string | null, retryAt: string | null, invalid = 0, duplicates = 0,historyRetry:number|null=null,snapshotRetry:number|null=null) {
  const result = await client.rpc("finish_growatt_history_sync_job_block", { job_id: job.id, expected_claim_token: token, next_cursor: cursor, next_status: status, new_completed_days: completed, new_already_complete_days: job.already_complete_days, new_refreshed_dates: refreshed, new_failed_dates: failed, added_invalid: invalid, added_duplicates: duplicates, error_code: errorCode, retry_at: retryAt,new_history_retry_count:historyRetry,new_snapshot_retry_count:snapshotRetry }); return result.error || !result.data?.length ? null : result.data[0];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function finalizeSnapshotBatch(request: NextRequest, client: any, job: GrowattSyncJob, currentDate: string, readCoverage: () => Promise<JobCoverage[]>) {
  let coverage: JobCoverage[]; try { coverage = await readCoverage(); } catch { return fail(503, "HISTORY_DATABASE_READ_FAILED"); }
  const eligible = completeClosedMonths(job.start_date, job.end_date, currentDate, satisfiedCoverageDates(coverage, currentDate)), results = { ...(job.snapshot_month_results ?? {}) }, refreshed = new Set(job.snapshot_refreshed_months ?? []);
  const pending = eligible.filter(month => !refreshed.has(month) && results[month]?.status !== "skipped");
  if (!pending.length) { const update = await client.from("growatt_history_sync_jobs").update({ status: "completed", snapshot_pending_months: [], completed_at: new Date().toISOString(), last_activity_at: new Date().toISOString() }).eq("id", job.id).eq("status", "finalizing_snapshots").is("claim_token", null).select("*").single(); return update.error ? fail(503, "SYNC_CHECKPOINT_WRITE_FAILED") : NextResponse.json({ job: publicGrowattJob(update.data) }, { headers }); }
  const token = crypto.randomUUID(), claim = await client.rpc("claim_growatt_history_sync_job_block", { job_id: job.id, expected_cursor: job.cursor_date, chunk_start: job.end_date, chunk_end: job.end_date, new_claim_token: token, lease_seconds: 300 }); if (claim.error) return fail(503, "SYNC_CLAIM_FAILED"); if (!claim.data?.length) return fail(409, "SYNC_JOB_BUSY");
  const batch = pending.slice(0, 2); let technicalFailure = false;
  for (const month of batch) {
    let outcome: { status: "refreshed" | "skipped" | "failed"; reason?: string };
    try { const response = await refreshSnapshots(new NextRequest(new URL("/api/solar/monthly-snapshots/backfill", request.url), { method: "POST", headers: { "Content-Type": "application/json", cookie: request.headers.get("cookie") ?? "" }, body: JSON.stringify({ startMonth: month, endMonth: month }) })), body = await response.json(); outcome = classifySnapshotBackfill(month,response.ok,body); if(outcome.status==="failed")technicalFailure=true; } catch { outcome = { status: "failed", reason: "SNAPSHOT_REFRESH_FAILED" }; technicalFailure = true; }
    results[month] = outcome; if (outcome.status === "refreshed") refreshed.add(month);
    const remaining = eligible.filter(value => !refreshed.has(value) && results[value]?.status !== "skipped"), failed = Object.entries(results).filter(([, value]) => value.status === "failed").map(([key]) => key);
    const checkpoint = await client.from("growatt_history_sync_jobs").update({ snapshot_pending_months: remaining, snapshot_refreshed_months: [...refreshed], snapshot_failed_months: failed, snapshot_month_results: results, snapshot_last_error_code: failed.length ? "SNAPSHOT_REFRESH_FAILED" : null, last_activity_at: new Date().toISOString() }).eq("id", job.id).eq("claim_token", token).select("*").single(); if (checkpoint.error) return fail(503, "SNAPSHOT_CHECKPOINT_WRITE_FAILED");
    if (["paused", "cancelling"].includes(checkpoint.data.status)) { const stopped = await finishJob(client, job, token, job.cursor_date, "finalizing_snapshots", job.total_days, [], [], null, null); return stopped ? NextResponse.json({ job: publicGrowattJob(stopped as Record<string, unknown>) }, { status: 202, headers }) : fail(503, "SYNC_CHECKPOINT_WRITE_FAILED"); }
  }
  const remaining = eligible.filter(value => !refreshed.has(value) && results[value]?.status !== "skipped"),retry=retryDecision(job.snapshot_retry_count??0), finish = await finishJob(client, job, token, job.cursor_date, remaining.length ? (technicalFailure ? retry.failed?"failed":"retry_pending" : "finalizing_snapshots") : "completed", job.total_days, [], [], technicalFailure ? "SNAPSHOT_REFRESH_FAILED" : null, technicalFailure&&!retry.failed ? retry.retryAt : null,0,0,null,technicalFailure?retry.count:0); if (!finish) return fail(503, "SYNC_CHECKPOINT_WRITE_FAILED");
  return NextResponse.json({ job: publicGrowattJob(finish as Record<string, unknown>) }, { status: remaining.length ? 202 : 200, headers });
}
