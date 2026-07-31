import { describe, expect, it } from "vitest";
import type { TariffSettings } from "@/lib/types";
import { estimateBaseGridImport, type MeterIntervalSample, type RetrospectiveSample } from "./historical-calibration";
import {
  NON_HEATING_EXPLANATION,
  analysisSummary,
  analyzeHeatingRelevance,
  assignIntervalsToHeatingSeasons,
  heatingCharacteristic,
  heatingSeasonAnalyses,
  selectBestSupportedBucket,
  toggleSelectedInterval,
} from "./period-analysis";

const tariff = {
  heating_season_start_month: 10,
  heating_season_start_day: 1,
  heating_season_end_month: 4,
  heating_season_end_day: 30,
} as TariffSettings;

function sample(start: string, end: string, mean = 2, min = 0, raw = 48, days = 1): RetrospectiveSample {
  return {
    start,
    end,
    durationHours: days * 24,
    durationDays: days,
    observedGridImportKwh: raw,
    observedDailyGridImportKwh: raw / days,
    productionDeltaKwh: 0,
    dataWarning: null,
    sampleType: "retrospective",
    weatherMeanTempC: mean,
    weatherMinTempC: min,
    weatherMaxTempC: mean + 2,
    estimatedBaseGridImportKwhDay: 10,
    gridImportAboveBaselineKwhDay: raw / days - 10,
    confidence: "medium",
    weatherDayCount: days,
    weatherCoverageRatio: 1,
  };
}

describe("heating relevance szemantika", () => {
  it("a nyári alapterhelés feletti import nem lesz fűtési többlet", () => {
    const analyzed = analyzeHeatingRelevance([sample("2026-07-01", "2026-07-02", 25, 20)], tariff, 21)[0];
    expect(analyzed.gridImportAboveBaselineKwhDay).toBe(38);
    expect(analyzed.heatingRelevance).toBe("no_heating_context");
    expect(analyzed.heatingRelatedExcessKwhDay).toBeNull();
  });

  it("a tiszta, hideg, szezonon belüli intervallum heating relevant", () => {
    const analyzed = analyzeHeatingRelevance([sample("2026-11-01", "2026-11-02")], tariff, 21)[0];
    expect(analyzed.heatingRelevance).toBe("likely");
    expect(analyzed.heatingRelatedExcessKwhDay).toBe(38);
  });

  it("a szezonhatárt átlépő intervallum kimarad a heating characteristicból", () => {
    const crossing = sample("2026-09-29", "2026-10-05", 10, 5);
    expect(assignIntervalsToHeatingSeasons([crossing], tariff)[0].crossSeason).toBe(true);
    expect(heatingCharacteristic([crossing], tariff, 21).every((row) => row.sampleCount === 0)).toBe(true);
  });

  it("csak a releváns intervallum tanítja a fűtési karakterisztikát", () => {
    const rows = heatingCharacteristic([
      sample("2026-07-01", "2026-07-02", 25, 20),
      sample("2026-11-01", "2026-11-02", 2, 0),
    ], tariff, 21);
    expect(rows.reduce((sum, row) => sum + row.sampleCount, 0)).toBe(1);
  });

  it("a magyarázat nem állít automatikus fűtési okozatot", () => {
    expect(NON_HEATING_EXPLANATION).toContain("nem bizonyítja");
  });

  it("a magas confidence bucket megelőzi a több low mintás bucketet", () => {
    const best = selectBestSupportedBucket([
      { bucket: "5–10 °C", sampleCount: 20, actualLogCount: 0, medianGridImportKwhDay: 20, medianGridImportAboveBaselineKwhDay: 10, medianHeatingExcessKwhDay: 10, averageElectricalLoadEquivalentKw: 10 / 24, confidence: "low", confidenceReason: "" },
      { bucket: "0–5 °C", sampleCount: 12, actualLogCount: 0, medianGridImportKwhDay: 30, medianGridImportAboveBaselineKwhDay: 20, medianHeatingExcessKwhDay: 20, averageElectricalLoadEquivalentKw: 20 / 24, confidence: "high", confidenceReason: "" },
    ]);
    expect(best).toMatchObject({ bucket: "0–5 °C", confidence: "high", sampleCount: 12 });
  });

  it("nyári adat a tanult házösszefoglaló alapjába sem kerül", () => {
    const summer = sample("2026-07-01", "2026-07-02", 25, 20);
    const analyzed = analyzeHeatingRelevance([summer], tariff, 21)[0];
    const characteristic = heatingCharacteristic([summer], tariff, 21);
    expect(analyzed.gridImportAboveBaselineKwhDay).toBe(38);
    expect(analyzed.heatingRelatedExcessKwhDay).toBeNull();
    expect(selectBestSupportedBucket(characteristic)).toBeNull();
  });
});

describe("összesítő mértékegységek", () => {
  it("a period total nyers kWh-kat összegez, nem napi normalizált értékeket", () => {
    const rows = [sample("2026-11-01", "2026-11-03", 2, 0, 100, 2), sample("2026-11-03", "2026-11-06", 2, 0, 120, 3)];
    const assigned = rows.map((row) => ({ sample: row, periodId: "p", crossPeriod: false }));
    const heating = analyzeHeatingRelevance(rows, tariff, 21);
    const summary = analysisSummary(assigned, assigned, heating);
    expect(summary.observedGridImportTotalKwh).toBe(220);
    expect(summary.observedGridImportTotalKwh).not.toBe(90);
  });

  it("a heating-season total is nyers megfigyelt kWh", () => {
    const rows = [sample("2026-11-01", "2026-11-03", 2, 0, 100, 2), sample("2026-11-03", "2026-11-06", 2, 0, 120, 3)];
    expect(heatingSeasonAnalyses(rows, tariff)[0].observedGridImportKwh).toBe(220);
    expect(heatingSeasonAnalyses(rows, tariff)[0].estimatedHeatingExcessKwh).toBeGreaterThan(0);
  });
});

describe("baseline és inline kiválasztás", () => {
  it("a baseline továbbra is nem fűtési szezonból készül", () => {
    const interval = (start: string, end: string, daily: number): MeterIntervalSample => ({
      start,
      end,
      durationHours: 24,
      durationDays: 1,
      observedGridImportKwh: daily,
      observedDailyGridImportKwh: daily,
      productionDeltaKwh: 0,
      dataWarning: null,
    });
    const result = estimateBaseGridImport([
      interval("2026-07-01", "2026-07-02", 10),
      interval("2026-08-01", "2026-08-02", 12),
      interval("2026-11-01", "2026-11-02", 100),
    ], tariff);
    expect(result.value).toBe(11);
    expect(result.sampleCount).toBe(2);
  });

  it("egyszerre egy sor részlete választható és ugyanaz bezárható", () => {
    const first = sample("2026-11-01", "2026-11-02");
    const second = sample("2026-11-02", "2026-11-03");
    expect(toggleSelectedInterval(null, first)).toBe(first);
    expect(toggleSelectedInterval(first, second)).toBe(second);
    expect(toggleSelectedInterval(first, first)).toBeNull();
  });
});
