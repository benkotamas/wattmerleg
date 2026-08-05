import { assessEonDay, dailyWeather, dayOperationState, detectHeatingCycles, median, recognizeHeatingSeason, seasonDifference, totalHomeConsumption, trainBaseline, type DayValidation, type HeatingDayFeature, type OperationPeriod, type QuarterHour, type WeatherHour } from "./eon-analysis";
import {addCalendarDays,localDayWindow} from "@/lib/weather/date";

export const HEATING_MODEL_VERSION="eon-heating-v3";
export type PvDay={localDate:string;energyKwh:number;qualityStatus:string};
export type AnalysisInput={eon:QuarterHour[];weather:WeatherHour[];pv:PvDay[];periods:OperationPeriod[];validations:DayValidation[];referenceDate:string;timeZone:string;targetIndoorC:number;heatSourceType?:string|null;maximumElectricPowerKw?:number|null};

export const INFORMATION_REASON_CODES=new Set(["MANUAL_HEATING_CONFIRMED"]),CONFIDENCE_REASON_CODES=new Set(["MISSING_OR_INCOMPLETE_PV","INCOMPLETE_WEATHER","MANUAL_UNCERTAIN","POWER_LIMIT_UNKNOWN","POWER_LIMIT_EXCEEDED"]),EXCLUSION_REASON_CODES=new Set(["INCOMPLETE_EON_DAY","PROVISIONAL_DAY","DST_FALLBACK_SOURCE_96","MANUAL_OPERATION_CONFLICT","NEGATIVE_HOME_CONSUMPTION"]);
export function isFeatureExcluded(feature:HeatingDayFeature){if(feature.warnings.some(x=>EXCLUSION_REASON_CODES.has(x)))return true;const unavailableDaily=feature.warnings.some(x=>x==="MISSING_OR_INCOMPLETE_PV"||x==="INCOMPLETE_WEATHER"||x==="POWER_LIMIT_EXCEEDED");return unavailableDaily&&feature.operationState==="available"&&(feature.detectedGridHeatingKwh??0)===0&&!feature.warnings.includes("MANUAL_HEATING_CONFIRMED")}

const sum=(xs:number[])=>xs.reduce((a,b)=>a+b,0);
const weekend=(date:string,timeZone:string)=>["Sat","Sun"].includes(new Intl.DateTimeFormat("en-US",{timeZone,weekday:"short"}).format(new Date(`${date}T12:00:00Z`)));

export function buildHeatingAnalysis(input:AnalysisInput){
  const byDate=new Map<string,QuarterHour[]>();
  for(const row of input.eon){if(!row.localDate)continue;byDate.set(row.localDate,[...(byDate.get(row.localDate)??[]),row])}
  const ordered=[...byDate].sort(([a],[b])=>a.localeCompare(b));
  const qualities=new Map(ordered.map(([date,rows])=>[date,assessEonDay(date,rows,input.referenceDate,input.timeZone)]));
  const gridBaseline=trainBaseline(input.eon,input.periods,qualities,input.timeZone);
  const pv=new Map(input.pv.map(x=>[x.localDate,x]));
  const validations=new Map(input.validations.map(x=>[x.localDate,x]));
  const raw=ordered.map(([localDate,rows])=>{
    const quality=qualities.get(localDate)!;
    const operation=dayOperationState(localDate,input.periods,input.timeZone);
    const validation=validations.get(localDate);
    const gridImport=sum(rows.map(x=>x.importKwh)),gridExport=sum(rows.map(x=>x.exportKwh));
    const pvDay=pv.get(localDate),completePv=pvDay?.qualityStatus==="complete"?pvDay.energyKwh:null;
    const home=totalHomeConsumption(gridImport,gridExport,completePv);
    const weather=dailyWeather(localDate,input.weather,input.targetIndoorC,input.timeZone);
    const cycles=detectHeatingCycles(rows,input.periods,gridBaseline,input.timeZone,validation);
    const slotBaseline=sum(rows.map(row=>{const parts=new Intl.DateTimeFormat("en-GB",{timeZone:input.timeZone,hour:"2-digit",minute:"2-digit",weekday:"short",hourCycle:"h23"}).formatToParts(new Date(row.at)),get=(key:string)=>parts.find(x=>x.type===key)?.value??"",slot=Number(get("hour"))*4+Math.floor(Number(get("minute"))/15),isWeekend=["Sat","Sun"].includes(get("weekday"));return gridBaseline.find(x=>x.slot===slot&&x.weekend===isWeekend)?.kwh??0}));
    return{localDate,rows,quality,operation,validation,gridImport,gridExport,pvDay,home,weather,cycles,slotBaseline};
  });
  const homeTraining=raw.filter(x=>(x.operation==="definitely_off"||x.validation?.label==="definitely_off")&&x.quality.usableForTraining&&x.pvDay?.qualityStatus==="complete"&&x.home.value!==null&&x.validation?.label!=="definitely_on");
  const homeBaselines=new Map<boolean,number|null>([false,true].map(group=>[group,median(homeTraining.filter(x=>weekend(x.localDate,input.timeZone)===group).map(x=>x.home.value!))]));
  const globalHomeBaseline=median(homeTraining.map(x=>x.home.value!));
  const coldDates=new Set(raw.filter(x=>x.weather.coveragePercent>=90&&(x.weather.average??99)<16).map(x=>x.localDate));
  const sustainedCold=(date:string)=>coldDates.has(date)&&(coldDates.has(addCalendarDays(date,-1))||coldDates.has(addCalendarDays(date,1)));
  const features:HeatingDayFeature[]=raw.map(x=>{
    const warnings=[...x.quality.warnings,...x.cycles.warnings];
    if(x.home.warning)warnings.push(x.home.warning);if(x.weather.coveragePercent<90)warnings.push("INCOMPLETE_WEATHER");if(x.operation==="mixed")warnings.push("MIXED_OPERATION_DAY");if(x.validation?.label==="uncertain")warnings.push("MANUAL_UNCERTAIN");
    const conflict=x.validation?.label==="definitely_on"&&x.operation==="definitely_off";if(conflict)warnings.push("MANUAL_OPERATION_CONFLICT");const confirmed=x.validation?.label==="definitely_on"&&!conflict;if(confirmed)warnings.push("MANUAL_HEATING_CONFIRMED");
    const dailyBaseline=homeBaselines.get(weekend(x.localDate,input.timeZone))??globalHomeBaseline;
    const dailyExcess=x.home.value===null||dailyBaseline===null?null:x.home.value-dailyBaseline;
    const gridCycleEligible=x.quality.usableForTraining&&gridBaseline.length>0&&!conflict&&x.validation?.label!=="definitely_off";
    const dailyExcessEligible=x.operation==="available"&&!conflict&&x.validation?.label!=="definitely_off"&&x.validation?.label!=="uncertain"&&x.quality.usableForTraining&&x.pvDay?.qualityStatus==="complete"&&x.weather.coveragePercent>=90;
    const coldSupported=dailyExcessEligible&&sustainedCold(x.localDate)&&dailyExcess!==null&&dailyExcess>0&&dailyBaseline!==null,configuredPower=input.heatSourceType==="electric_boiler"&&Number.isFinite(input.maximumElectricPowerKw)&&input.maximumElectricPowerKw!>0?input.maximumElectricPowerKw!:null,physicalMaximum=configuredPower===null?null:configuredPower*localDayWindow(x.localDate,input.timeZone).durationHours*1.05,withinPhysicalLimit=dailyExcess===null||physicalMaximum===null||dailyExcess<=physicalMaximum;if(coldSupported&&configuredPower===null)warnings.push("POWER_LIMIT_UNKNOWN");if(coldSupported&&!withinPhysicalLimit)warnings.push("POWER_LIMIT_EXCEEDED");const excessSupported=coldSupported&&withinPhysicalLimit;
    const detected=gridCycleEligible?x.cycles.estimatedHeatingKwh:0;
    const estimated=excessSupported?Math.max(detected,dailyExcess!*0.8):detected;
    const excluded=x.operation==="definitely_off"||x.validation?.label==="definitely_off"||conflict;
    return{localDate:x.localDate,gridImportKwh:x.gridImport,gridExportKwh:x.gridExport,pvProductionKwh:x.pvDay?.qualityStatus==="complete"?x.pvDay.energyKwh:null,totalHomeConsumptionKwh:x.home.value,baselineKwh:dailyBaseline,gridImportBaselineKwh:x.slotBaseline,excessKwh:dailyExcess,detectedGridHeatingKwh:detected,dailyHeatingExcessKwh:excessSupported?dailyExcess:null,estimatedHeatingKwh:excluded?0:estimated,averageTemperatureC:x.weather.average,minimumTemperatureC:x.weather.minimum,maximumTemperatureC:x.weather.maximum,heatingDegreeHours:x.weather.heatingDegreeHours,weatherCoveragePercent:x.weather.coveragePercent,availableIntervals:x.quality.availableIntervals,expectedIntervals:x.quality.expectedIntervals,coveragePercent:x.quality.coveragePercent,provisional:x.quality.provisional,detectedCycleCount:excluded?0:x.cycles.cycleCount,confidence:excluded||x.validation?.label==="uncertain"||x.weather.coveragePercent<90||warnings.includes("POWER_LIMIT_UNKNOWN")||warnings.includes("POWER_LIMIT_EXCEEDED")?"low":estimated>0?(x.cycles.confidence==="high"?"high":"medium"):"low",warnings:[...new Set(warnings)],isHeatingRelevant:!excluded&&(estimated>0||confirmed),operationState:x.operation};
  });
  const season=recognizeHeatingSeason(features),difference=seasonDifference(season,input.periods),trainingDays=homeTraining.length,nightPoints=gridBaseline.filter(x=>x.slot<24||x.slot>=88),confidence=trainingDays>=14&&features.filter(x=>x.confidence==="high").length>=3?"high":trainingDays>=3?"medium":"low";
  return{features,baseline:gridBaseline,model:{model_version:HEATING_MODEL_VERSION,period_start:features[0]?.localDate??input.referenceDate,period_end:features.at(-1)?.localDate??input.referenceDate,baseline_training_days:trainingDays,analyzed_days:features.length,excluded_days:features.filter(isFeatureExcluded).length,learned_night_baseline_kwh:nightPoints.length?sum(nightPoints.map(x=>x.kwh))/nightPoints.length*32:null,learned_daily_baseline_kwh:globalHomeBaseline,estimated_heating_kwh:sum(features.map(x=>x.estimatedHeatingKwh??0)),confidence,detected_season_start:season.start,detected_season_end:season.end,manual_season_start:difference.manualStart,manual_season_end:difference.manualEnd,season_start_difference_days:difference.startDays,season_end_difference_days:difference.endDays,summary:{baselineSlots:gridBaseline.length,highConfidenceDays:features.filter(x=>x.confidence==="high").length,manualConflicts:features.filter(x=>x.warnings.includes("MANUAL_OPERATION_CONFLICT")).length,informationReasonCodes:[...INFORMATION_REASON_CODES],confidenceReasonCodes:[...CONFIDENCE_REASON_CODES],exclusionReasonCodes:[...EXCLUSION_REASON_CODES],automaticControl:false}}};
}

export const featureDatabaseRow=(x:HeatingDayFeature)=>({local_date:x.localDate,grid_import_kwh:x.gridImportKwh,grid_export_kwh:x.gridExportKwh,pv_production_kwh:x.pvProductionKwh,total_home_consumption_kwh:x.totalHomeConsumptionKwh,baseline_kwh:x.baselineKwh,grid_import_baseline_kwh:x.gridImportBaselineKwh,excess_kwh:x.excessKwh,detected_grid_heating_kwh:x.detectedGridHeatingKwh,daily_heating_excess_kwh:x.dailyHeatingExcessKwh,estimated_heating_kwh:x.estimatedHeatingKwh,average_temperature_c:x.averageTemperatureC,minimum_temperature_c:x.minimumTemperatureC,maximum_temperature_c:x.maximumTemperatureC,heating_degree_hours:x.heatingDegreeHours,weather_coverage_percent:x.weatherCoveragePercent,available_intervals:x.availableIntervals,expected_intervals:x.expectedIntervals,coverage_percent:x.coveragePercent,provisional:x.provisional,detected_cycle_count:x.detectedCycleCount,confidence:x.confidence,data_quality_warnings:x.warnings,is_heating_relevant:x.isHeatingRelevant,operation_state:x.operationState});
