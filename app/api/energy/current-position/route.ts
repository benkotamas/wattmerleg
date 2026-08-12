import { NextResponse } from "next/server";
import { DEFAULT_TARIFF_SETTINGS } from "@/lib/config";
import { buildCurrentFinancialPosition } from "@/lib/energy/current-financial-position";
import { accessFail, noStore } from "@/lib/eon-import/http";
import { publicEonOverview } from "@/lib/eon-import/overview";
import { eonImportContext } from "@/lib/eon-import/route-auth";
import type { TariffSettings } from "@/lib/types";

export const runtime = "nodejs";

const tariffColumns = "discounted_limit_kwh,discounted_price_ft,market_price_ft,monthly_base_fee_ft,feed_in_price_ft,annual_closing_month,annual_closing_day,heating_season_start_month,heating_season_start_day,heating_season_end_month,heating_season_end_day";

function tariffFromRow(row: Record<string, unknown> | null): TariffSettings | null {
  if (!row) return null;
  const tariff = {
    discounted_limit_kwh: Number(row.discounted_limit_kwh), discounted_price_ft: Number(row.discounted_price_ft),
    market_price_ft: Number(row.market_price_ft), monthly_base_fee_ft: Number(row.monthly_base_fee_ft), feed_in_price_ft: Number(row.feed_in_price_ft),
    annual_closing_month: Number(row.annual_closing_month), annual_closing_day: Number(row.annual_closing_day),
    heating_season_start_month: Number(row.heating_season_start_month), heating_season_start_day: Number(row.heating_season_start_day),
    heating_season_end_month: Number(row.heating_season_end_month), heating_season_end_day: Number(row.heating_season_end_day),
  };
  return Object.values(tariff).every(Number.isFinite) ? tariff : null;
}

const unavailable = () => NextResponse.json({ error: { code: "CURRENT_POSITION_UNAVAILABLE" } }, { status: 503, headers: noStore });

export async function GET() {
  const auth = await eonImportContext();
  if (auth.access !== "allowed") return accessFail(auth.access);

  const periodResult = await auth.client.from("settlement_periods").select("id").eq("user_id", auth.userId).eq("status", "open").order("start_date", { ascending: false }).limit(1).maybeSingle();
  if (periodResult.error) return unavailable();
  if (!periodResult.data) return NextResponse.json({ position: null }, { headers: noStore });

  const [overviewResult, tariffResult] = await Promise.all([
    auth.client.rpc("get_current_eon_period_overview"),
    auth.client.from("tariff_settings").select(tariffColumns).eq("user_id", auth.userId).maybeSingle(),
  ]);
  if (overviewResult.error) return unavailable();
  const overview = publicEonOverview(overviewResult.data);
  if (overviewResult.data && !overview) return unavailable();
  const databaseTariff = !tariffResult.error ? tariffFromRow(tariffResult.data as Record<string, unknown> | null) : null;

  try {
    const position = buildCurrentFinancialPosition({
      settlementPeriodId: String(periodResult.data.id), overview,
      tariff: databaseTariff ?? DEFAULT_TARIFF_SETTINGS,
      tariffSource: databaseTariff ? "database" : "fallback",
    });
    return NextResponse.json({ position }, { headers: noStore });
  } catch {
    return unavailable();
  }
}
