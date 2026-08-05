import React from"react";
import{renderToStaticMarkup}from"react-dom/server";
import{describe,expect,it}from"vitest";
import{HeatingHistoricalAnalysis}from"./heating-historical-analysis";

const initialData={
  model:{baseline_training_days:10,analyzed_days:20,excluded_days:2,learned_night_baseline_kwh:1,learned_daily_baseline_kwh:12,estimated_heating_kwh:1200,confidence:"medium",detected_season_start:"2025-11-01",detected_season_end:"2026-03-31",manual_season_start:"2025-10-31",manual_season_end:"2026-04-02",season_start_difference_days:1,season_end_difference_days:-2,updated_at:"2026-08-05T12:00:00Z"},
  calculationSummary:{detectedGridHeatingKwh:450,conservativeHeatingKwh:1200,seasonalPositiveExcessKwh:2500,rangeLowerKwh:1200,rangeUpperKwh:2500,heatingPeriodHomeConsumptionKwh:4000,heatingPeriodBaselineKwh:1500,positiveHeatingDays:80,zeroEstimateHeatingDays:12},
  days:[],validations:[],
};

describe("HeatingHistoricalAnalysis result presentation",()=>{
  it("shows all three Hungarian energy levels and the dynamic range",()=>{const html=renderToStaticMarkup(<HeatingHistoricalAnalysis initialData={initialData}/>);expect(html).toContain("Konzervatív fűtésbecslés");expect(html).toContain("Becsült fűtési tartomány");expect(html).toContain("Közvetlenül felismert kazánciklusok");expect(html).toContain("1,2–2,5 MWh")});
  it("explains uncertainty and keeps the E.ON meter limitation explicit",()=>{const html=renderToStaticMarkup(<HeatingHistoricalAnalysis initialData={initialData}/>);expect(html).toContain("Mit jelentenek ezek az értékek?");expect(html).toContain("nem garantált mérési pontosságot");expect(html).toContain("nem közvetlenül a villanykazánt")});
  it("renders detailed seasonal totals and day counts",()=>{const html=renderToStaticMarkup(<HeatingHistoricalAnalysis initialData={initialData}/>);for(const label of["Fűtési időszak teljes házfogyasztása","Fűtési időszak becsült alapfogyasztása","Pozitív fűtési napok","Nulla becslésű fűtési napok"])expect(html).toContain(label)});
});
