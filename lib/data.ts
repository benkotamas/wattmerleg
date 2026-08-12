"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DEFAULT_TARIFF_SETTINGS } from "@/lib/config";
import { createClient } from "@/lib/supabase/client";
import type { MeterReading, SettlementBillSnapshot, SettlementPeriod, TariffSettings } from "@/lib/types";
import { readAllBillingSnapshots, readAllMeterReadings, readAllSettlementPeriods } from "@/lib/supabase/paginated-energy";

const snapshotColumns = "id,user_id,settlement_period_id,billing_start_date,billing_end_date,opening_consumption_meter_kwh,opening_production_meter_kwh,closing_consumption_meter_kwh,closing_production_meter_kwh,consumption_kwh,production_kwh,balance_kwh,billing_days,discounted_quantity_kwh,discounted_fee_ft,market_quantity_kwh,market_fee_ft,base_fee_ft,feed_in_credit_ft,calculated_total_ft,discounted_limit_kwh,discounted_price_ft,market_price_ft,monthly_base_fee_ft,feed_in_price_ft,official_total_ft,invoice_reference,calculation_version,snapshotted_at,official_updated_at,created_at,updated_at";

export function useEnergyData() {
  const [periods, setPeriods] = useState<SettlementPeriod[]>([]);
  const [allReadings, setAllReadings] = useState<MeterReading[]>([]);
  const [tariff, setTariff] = useState<TariffSettings>(DEFAULT_TARIFF_SETTINGS);
  const [billingSnapshots, setBillingSnapshots] = useState<SettlementBillSnapshot[]>([]);
  const [billingSnapshotsAvailable, setBillingSnapshotsAvailable] = useState(true);
  const [tariffFromDatabase, setTariffFromDatabase] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Bejelentkezés szükséges.");
      const [periodResult, readingResult, tariffResult, snapshotResult] = await Promise.all([
        readAllSettlementPeriods((from, to) => supabase.from("settlement_periods").select("*").eq("user_id", user.id).order("start_date", { ascending: true }).order("id", { ascending: true }).range(from, to)),
        readAllMeterReadings((from, to) => supabase.from("meter_readings").select("*").eq("user_id", user.id).order("reading_at", { ascending: true }).order("id", { ascending: true }).range(from, to)),
        supabase.from("tariff_settings").select("discounted_limit_kwh,discounted_price_ft,market_price_ft,monthly_base_fee_ft,feed_in_price_ft,annual_closing_month,annual_closing_day,heating_season_start_month,heating_season_start_day,heating_season_end_month,heating_season_end_day").maybeSingle(),
        readAllBillingSnapshots((from, to) => supabase.from("settlement_bill_snapshots").select(snapshotColumns).eq("user_id", user.id).order("billing_start_date", { ascending: true }).order("id", { ascending: true }).range(from, to))
          .then(data => ({ data, available: true })).catch(() => ({ data: [] as SettlementBillSnapshot[], available: false })),
      ]);
      setPeriods(periodResult);
      setAllReadings(readingResult);
      setBillingSnapshots(snapshotResult.data);
      setBillingSnapshotsAvailable(snapshotResult.available);
      if (!tariffResult.error && tariffResult.data) {
        setTariff({
          discounted_limit_kwh: Number(tariffResult.data.discounted_limit_kwh),
          discounted_price_ft: Number(tariffResult.data.discounted_price_ft),
          market_price_ft: Number(tariffResult.data.market_price_ft),
          monthly_base_fee_ft: Number(tariffResult.data.monthly_base_fee_ft),
          feed_in_price_ft: Number(tariffResult.data.feed_in_price_ft),
          annual_closing_month: tariffResult.data.annual_closing_month,
          annual_closing_day: tariffResult.data.annual_closing_day,
          heating_season_start_month: tariffResult.data.heating_season_start_month,
          heating_season_start_day: tariffResult.data.heating_season_start_day,
          heating_season_end_month: tariffResult.data.heating_season_end_month,
          heating_season_end_day: tariffResult.data.heating_season_end_day,
        });
        setTariffFromDatabase(true);
      } else {
        setTariff(DEFAULT_TARIFF_SETTINGS);
        setTariffFromDatabase(false);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Az adatok nem tölthetők be.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  const period = useMemo(() => [...periods].reverse().find(item => item.status === "open") ?? null, [periods]);
  const readings = useMemo(() => period ? allReadings.filter(reading => reading.settlement_period_id === period.id) : [], [allReadings, period]);
  const readingsForPeriod = useCallback((periodId: string) => allReadings.filter(reading => reading.settlement_period_id === periodId), [allReadings]);
  return { period, periods, readings, allReadings, readingsForPeriod, billingSnapshots, billingSnapshotsAvailable, tariff, tariffFromDatabase, loading, error, refresh };
}
