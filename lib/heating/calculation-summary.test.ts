import{describe,expect,it}from"vitest";
import{formatHeatingEnergy,formatHeatingRange,heatingCalculationSummary,type HeatingCalculationDay}from"./calculation-summary";

const model={model_version:"latest",estimated_heating_kwh:80};
const row=(overrides:Partial<HeatingCalculationDay>={}):HeatingCalculationDay=>({model_version:"latest",operation_state:"available",detected_grid_heating_kwh:10,estimated_heating_kwh:20,excess_kwh:30,total_home_consumption_kwh:50,baseline_kwh:20,...overrides});

describe("heating calculation summary",()=>{
  it("sums detected cycles and only available or mixed seasonal values",()=>{const result=heatingCalculationSummary(model,[row(),row({operation_state:"mixed",detected_grid_heating_kwh:5}),row({operation_state:"definitely_off",detected_grid_heating_kwh:2,excess_kwh:999,total_home_consumption_kwh:999,baseline_kwh:999})])!;expect(result).toMatchObject({detectedGridHeatingKwh:17,seasonalPositiveExcessKwh:60,heatingPeriodHomeConsumptionKwh:100,heatingPeriodBaselineKwh:40,positiveHeatingDays:2})});
  it("does not let negative excess reduce the upper estimate",()=>{const result=heatingCalculationSummary(model,[row({excess_kwh:-100}),row({operation_state:"mixed",excess_kwh:120})])!;expect(result.seasonalPositiveExcessKwh).toBe(120);expect(result.rangeUpperKwh).toBe(120)});
  it("never returns an upper bound below the conservative estimate",()=>{const result=heatingCalculationSummary({...model,estimated_heating_kwh:500},[row({excess_kwh:10})])!;expect(result.rangeLowerKwh).toBe(500);expect(result.rangeUpperKwh).toBe(500)});
  it("uses only rows of the latest model version",()=>{const result=heatingCalculationSummary(model,[row(),row({model_version:"old",detected_grid_heating_kwh:1000,excess_kwh:1000})])!;expect(result.detectedGridHeatingKwh).toBe(10);expect(result.seasonalPositiveExcessKwh).toBe(30)});
  it("counts zero estimates only on available days",()=>{const result=heatingCalculationSummary(model,[row({estimated_heating_kwh:0}),row({operation_state:"mixed",estimated_heating_kwh:0}),row({estimated_heating_kwh:2})])!;expect(result).toMatchObject({positiveHeatingDays:1,zeroEstimateHeatingDays:1})});
  it("returns null without a model",()=>expect(heatingCalculationSummary(null,[row()])).toBeNull());
});

describe("heating energy formatting",()=>{
  it("uses Hungarian kWh formatting below 1000",()=>expect(formatHeatingEnergy(999.45)).toBe("999,5 kWh"));
  it("uses at most one decimal in MWh",()=>{expect(formatHeatingEnergy(1549.7)).toBe("1,5 MWh");expect(formatHeatingRange(7836.4,9938)).toBe("7,8–9,9 MWh")});
});
