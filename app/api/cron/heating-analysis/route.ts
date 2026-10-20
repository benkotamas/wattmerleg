import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cronAuthorized } from "@/lib/eon-gmail/http";
import { runHeatingAnalysisRebuild } from "@/lib/heating/rebuild-service";
import { repository } from "@/app/api/heating/analysis/rebuild/route";

export const runtime = "nodejs";
export const maxDuration = 300;
const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  if (!cronAuthorized(request)) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401, headers });
  const userId = process.env.HEATING_ANALYSIS_USER_ID?.trim() || process.env.EON_ALLOWED_USER_ID?.trim();
  const admin = createAdminClient();
  if (!userId || !admin) return NextResponse.json({ error: { code: "NOT_CONFIGURED" } }, { status: 503, headers });
  try {
    const result = await runHeatingAnalysisRebuild({ repository: repository(admin), userId });
    return NextResponse.json({ ok: true, ...result }, { headers });
  } catch (error) {
    const code = error instanceof Error ? error.message : "HEATING_REBUILD_FAILED";
    return NextResponse.json({ error: { code } }, { status: code === "ANALYSIS_ALREADY_RUNNING" ? 409 : 503, headers });
  }
}
