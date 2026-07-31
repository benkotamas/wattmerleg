"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DEFAULT_TARIFF_SETTINGS } from "@/lib/config";
import { createClient } from "@/lib/supabase/client";
import type { MeterReading, SettlementPeriod, TariffSettings } from "@/lib/types";

export function useEnergyData() {
  const [periods, setPeriods] = useState<SettlementPeriod[]>([]);
  const [allReadings, setAllReadings] = useState<MeterReading[]>([]);
  const [tariff, setTariff] = useState<TariffSettings>(DEFAULT_TARIFF_SETTINGS);
  const [tariffFromDatabase, setTariffFromDatabase] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const supabase = createClient();
      const [periodResult, readingResult, tariffResult] = await Promise.all([
        supabase.from("settlement_periods").select("*").order("start_date", { ascending: true }),
        supabase.from("meter_readings").select("*").order("reading_at", { ascending: true }),
        supabase.from("tariff_settings").select("discounted_limit_kwh,discounted_price_ft,market_price_ft,feed_in_price_ft,annual_closing_month,annual_closing_day,heating_season_start_month,heating_season_start_day,heating_season_end_month,heating_season_end_day").maybeSingle(),
      ]);
      if (periodResult.error) throw periodResult.error;
      if (readingResult.error) throw readingResult.error;
      setPeriods(periodResult.data ?? []);
      setAllReadings(readingResult.data ?? []);
      if (!tariffResult.error && tariffResult.data) {
        setTariff({
          discounted_limit_kwh: Number(tariffResult.data.discounted_limit_kwh),
          discounted_price_ft: Number(tariffResult.data.discounted_price_ft),
          market_price_ft: Number(tariffResult.data.market_price_ft),
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
  return { period, periods, readings, allReadings, readingsForPeriod, tariff, tariffFromDatabase, loading, error, refresh };
}
