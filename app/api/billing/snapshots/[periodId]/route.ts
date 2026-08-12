import { NextResponse } from "next/server";
import { buildSettlementBillSnapshot, normalizeInvoiceReference, normalizeOfficialTotal } from "@/lib/billing/snapshots";
import { DEFAULT_TARIFF_SETTINGS } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";
import type { SettlementPeriod, TariffSettings } from "@/lib/types";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store, max-age=0, must-revalidate" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const periodColumns = "id,start_date,opening_reading_at,end_date,opening_consumption_meter_kwh,opening_production_meter_kwh,closing_consumption_meter_kwh,closing_production_meter_kwh,status,created_at";
const tariffColumns = "discounted_limit_kwh,discounted_price_ft,market_price_ft,monthly_base_fee_ft,feed_in_price_ft,annual_closing_month,annual_closing_day,heating_season_start_month,heating_season_start_day,heating_season_end_month,heating_season_end_day";
const fail = (status: number, code: string) => NextResponse.json({ error: { code } }, { status, headers });

function tariffFromRow(row: Record<string, unknown> | null): TariffSettings {
  if (!row) return DEFAULT_TARIFF_SETTINGS;
  const tariff = Object.fromEntries(Object.keys(DEFAULT_TARIFF_SETTINGS).map(key => [key, Number(row[key])])) as unknown as TariffSettings;
  return Object.values(tariff).every(value => Number.isFinite(value) && value >= 0) ? tariff : DEFAULT_TARIFF_SETTINGS;
}

async function context(rawPeriodId: string) {
  if (!UUID.test(rawPeriodId)) return { error: fail(400, "INVALID_PERIOD_ID") };
  const client = await createClient();
  if (!client) return { error: fail(401, "UNAUTHORIZED") };
  const { data: { user } } = await client.auth.getUser();
  if (!user) return { error: fail(401, "UNAUTHORIZED") };
  return { client, userId: user.id, periodId: rawPeriodId };
}

export async function POST(_request: Request, { params }: { params: Promise<{ periodId: string }> }) {
  const { periodId } = await params, auth = await context(periodId);
  if ("error" in auth) return auth.error;
  const existing = await auth.client.from("settlement_bill_snapshots").select("*").eq("user_id", auth.userId).eq("settlement_period_id", periodId).maybeSingle();
  if (!existing.error && existing.data) return NextResponse.json({ snapshot: existing.data }, { headers });
  if (existing.error && existing.error.code !== "PGRST116") return fail(503, "BILLING_SNAPSHOT_UNAVAILABLE");
  const [periodResult, tariffResult] = await Promise.all([
    auth.client.from("settlement_periods").select(periodColumns).eq("id", periodId).eq("user_id", auth.userId).eq("status", "closed").maybeSingle(),
    auth.client.from("tariff_settings").select(tariffColumns).eq("user_id", auth.userId).maybeSingle(),
  ]);
  if (periodResult.error) return fail(503, "BILLING_PERIOD_UNAVAILABLE");
  if (!periodResult.data) return fail(409, "BILLING_PERIOD_NOT_CLOSED");
  try {
    const insert = buildSettlementBillSnapshot(auth.userId, periodResult.data as SettlementPeriod, tariffFromRow(!tariffResult.error ? tariffResult.data as Record<string, unknown> | null : null));
    const created = await auth.client.from("settlement_bill_snapshots").insert(insert).select("*").single();
    if (created.error) {
      if (created.error.code === "23505") {
        const raced = await auth.client.from("settlement_bill_snapshots").select("*").eq("user_id", auth.userId).eq("settlement_period_id", periodId).single();
        return raced.error ? fail(503, "BILLING_SNAPSHOT_UNAVAILABLE") : NextResponse.json({ snapshot: raced.data }, { headers });
      }
      return fail(503, "BILLING_SNAPSHOT_WRITE_FAILED");
    }
    return NextResponse.json({ snapshot: created.data }, { status: 201, headers });
  } catch { return fail(422, "BILLING_SNAPSHOT_INVALID"); }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ periodId: string }> }) {
  const { periodId } = await params, auth = await context(periodId);
  if ("error" in auth) return auth.error;
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; } catch { return fail(400, "INVALID_JSON"); }
  try {
    const update = { official_total_ft: normalizeOfficialTotal(body.officialTotalFt), invoice_reference: normalizeInvoiceReference(body.invoiceReference), official_updated_at: new Date().toISOString() };
    const result = await auth.client.from("settlement_bill_snapshots").update(update).eq("user_id", auth.userId).eq("settlement_period_id", periodId).select("*").maybeSingle();
    if (result.error) return fail(503, "BILLING_SNAPSHOT_WRITE_FAILED");
    return result.data ? NextResponse.json({ snapshot: result.data }, { headers }) : fail(404, "BILLING_SNAPSHOT_NOT_FOUND");
  } catch (error) { return fail(400, error instanceof Error ? error.message : "INVALID_BILLING_SNAPSHOT_UPDATE"); }
}
