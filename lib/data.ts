"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { MeterReading, SettlementPeriod } from "@/lib/types";

export function useEnergyData() {
  const [period, setPeriod] = useState<SettlementPeriod | null>(null);
  const [readings, setReadings] = useState<MeterReading[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data: periodData, error: periodError } = await supabase
        .from("settlement_periods").select("*").eq("status", "open")
        .order("start_date", { ascending: false }).limit(1).maybeSingle();
      if (periodError) throw periodError;
      setPeriod(periodData);
      if (!periodData) {
        setReadings([]);
        return;
      }
      const { data, error: readingsError } = await supabase
        .from("meter_readings").select("*")
        .eq("settlement_period_id", periodData.id)
        .order("reading_at", { ascending: true });
      if (readingsError) throw readingsError;
      setReadings(data ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Az adatok nem tölthetők be.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  return { period, readings, loading, error, refresh };
}
