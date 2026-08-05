export type HeatingCalculationModel = {
  model_version: string;
  estimated_heating_kwh: number | string | null;
};

export type HeatingCalculationDay = {
  model_version: string;
  operation_state: string;
  detected_grid_heating_kwh: number | string | null;
  estimated_heating_kwh: number | string | null;
  excess_kwh: number | string | null;
  total_home_consumption_kwh: number | string | null;
  baseline_kwh: number | string | null;
};

export type HeatingCalculationSummary = {
  detectedGridHeatingKwh: number;
  conservativeHeatingKwh: number;
  seasonalPositiveExcessKwh: number;
  rangeLowerKwh: number;
  rangeUpperKwh: number;
  heatingPeriodHomeConsumptionKwh: number;
  heatingPeriodBaselineKwh: number;
  positiveHeatingDays: number;
  zeroEstimateHeatingDays: number;
};

const finite = (value:number|string|null|undefined) => {
  if(value===null||value===undefined)return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const sum = (values:(number|null)[]) => values.reduce<number>((total,value)=>total+(value??0),0);

export function heatingCalculationSummary(model:HeatingCalculationModel|null,rows:HeatingCalculationDay[]):HeatingCalculationSummary|null {
  if(!model)return null;
  const relevant=rows.filter(row=>row.model_version===model.model_version);
  const seasonal=relevant.filter(row=>row.operation_state==="available"||row.operation_state==="mixed");
  const conservativeHeatingKwh=finite(model.estimated_heating_kwh)??0;
  const seasonalPositiveExcessKwh=sum(seasonal.map(row=>Math.max(finite(row.excess_kwh)??0,0)));
  return{
    detectedGridHeatingKwh:sum(relevant.map(row=>finite(row.detected_grid_heating_kwh))),
    conservativeHeatingKwh,
    seasonalPositiveExcessKwh,
    rangeLowerKwh:conservativeHeatingKwh,
    rangeUpperKwh:Math.max(conservativeHeatingKwh,seasonalPositiveExcessKwh),
    heatingPeriodHomeConsumptionKwh:sum(seasonal.map(row=>finite(row.total_home_consumption_kwh))),
    heatingPeriodBaselineKwh:sum(seasonal.map(row=>finite(row.baseline_kwh))),
    positiveHeatingDays:seasonal.filter(row=>(finite(row.estimated_heating_kwh)??0)>0).length,
    zeroEstimateHeatingDays:seasonal.filter(row=>row.operation_state==="available"&&finite(row.estimated_heating_kwh)===0).length,
  };
}

const localized=(value:number,divisor:number,maximumFractionDigits:number)=>
  (value/divisor).toLocaleString("hu-HU",{maximumFractionDigits,minimumFractionDigits:0});

export function formatHeatingEnergy(value:number|null){
  if(value===null||!Number.isFinite(value))return"nincs adat";
  return value>1000?`${localized(value,1000,1)} MWh`:`${localized(value,1,1)} kWh`;
}

export function formatHeatingRange(lower:number|null,upper:number|null){
  if(lower===null||upper===null||!Number.isFinite(lower)||!Number.isFinite(upper))return"nincs adat";
  if(Math.max(lower,upper)>1000)return`${localized(lower,1000,1)}–${localized(upper,1000,1)} MWh`;
  return`${localized(lower,1,1)}–${localized(upper,1,1)} kWh`;
}
