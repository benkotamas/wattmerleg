import { NextRequest, NextResponse } from "next/server";
import { growattHistoryRouteContext } from "@/lib/growatt/history-route";
import { syncGrowattHistory, withGrowattSyncLock, type HistoricalDatabase } from "@/lib/growatt/historical-sync";
import { growattErrorResponse } from "@/lib/growatt/route";
import { validIsoDate } from "@/lib/growatt/historical";
import { readGrowattCoverage } from "@/lib/growatt/coverage";

export const runtime = "nodejs";
const jsonError = (status: number, code: string, message: string) => NextResponse.json({ error: { code, message } }, { status, headers: { "Cache-Control": "no-store" } });
export async function POST(request: NextRequest) {
  const context = await growattHistoryRouteContext();
  if (context.access === "unauthenticated") return jsonError(401, "UNAUTHORIZED", "Bejelentkezés szükséges.");
  if (context.access === "forbidden") return jsonError(403, "FORBIDDEN", "Ehhez a Growatt-integrációhoz nincs hozzáférésed.");
  if (context.access === "not_configured") return jsonError(503, "GROWATT_NOT_CONFIGURED", "A Growatt tulajdonosa nincs konfigurálva.");
  let body: unknown; try { body = await request.json(); } catch { return jsonError(400, "INVALID_REQUEST", "Hibás JSON kérés."); }
  if (typeof body !== "object" || body === null || !("startDate" in body) || !("endDate" in body) || typeof body.startDate !== "string" || typeof body.endDate !== "string" || !validIsoDate(body.startDate) || !validIsoDate(body.endDate)) return jsonError(400, "INVALID_REQUEST", "Érvényes kezdő- és záródátum szükséges.");
  const database: HistoricalDatabase = {
    existingCoverage: (userId, startDate, endDate) => readGrowattCoverage(context.client,userId,startDate,endDate),
    upsert: rows => context.client.from("growatt_daily_energy").upsert(rows, { onConflict: "user_id,local_date" }),
  };
  try { const result = await withGrowattSyncLock(context.userId, () => syncGrowattHistory({ userId: context.userId, startDate: body.startDate as string, endDate: body.endDate as string, database })); return NextResponse.json(result, { status: result.partial ? 207 : 200, headers: { "Cache-Control": "no-store" } }); }
  catch (error) { if (error instanceof Error && ["INVALID_DATE_RANGE", "DATE_RANGE_TOO_LONG", "FUTURE_DATE"].includes(error.message)) return jsonError(400, error.message, "A dátumtartomány érvénytelen, jövőbeli vagy 28 napnál hosszabb."); if (error instanceof Error && error.message === "SYNC_ALREADY_RUNNING") return jsonError(409, "SYNC_ALREADY_RUNNING", "Ehhez a felhasználóhoz már fut szinkron."); return growattErrorResponse(error); }
}
