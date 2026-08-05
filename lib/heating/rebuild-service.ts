import {addCalendarDays} from "@/lib/weather/date";
import {backfillHistoricalWeather} from "./weather-backfill";
import {buildHeatingAnalysis,featureDatabaseRow,HEATING_MODEL_VERSION,type PvDay} from "./analysis-service";
import type {DayValidation,OperationPeriod,QuarterHour,WeatherHour} from "./eon-analysis";

export const HEATING_ANALYSIS_MAX_DAYS=500;
export const HEATING_ANALYSIS_MAX_EON_INTERVALS=50_000;
export type HeatingProfile={latitude:number|null;longitude:number|null;timeZone:string;targetIndoorC:number;heatSourceType:string|null;maximumElectricPowerKw:number|null};
export type HeatingSource={eon:QuarterHour[];pv:PvDay[];periods:OperationPeriod[];validations:DayValidation[];storedWeather:{observed_at:string;quality_status:string}[];weather:WeatherHour[]};
export interface HeatingAnalysisRepository{
 claim(userId:string):Promise<boolean>;release(userId:string):Promise<void>;profile(userId:string):Promise<HeatingProfile>;
 source(userId:string,start:string,end:string):Promise<HeatingSource>;saveWeather(userId:string,rows:WeatherHour[]):Promise<void>;weather(userId:string,start:string,end:string):Promise<WeatherHour[]>;
 saveAnalysis(userId:string,features:ReturnType<typeof featureDatabaseRow>[],model:Record<string,unknown>):Promise<unknown>;
}
export async function runHeatingAnalysisRebuild(args:{repository:HeatingAnalysisRepository;userId:string;referenceDate:string;fetcher?:typeof fetch}){
 const{repository,userId}=args;if(!await repository.claim(userId))throw new Error("ANALYSIS_ALREADY_RUNNING");
 try{const profile=await repository.profile(userId),end=addCalendarDays(args.referenceDate,-1),start=addCalendarDays(end,-(HEATING_ANALYSIS_MAX_DAYS-1)),source=await repository.source(userId,start,end);if(source.eon.length>HEATING_ANALYSIS_MAX_EON_INTERVALS)throw new Error("ANALYSIS_RANGE_TOO_LARGE");if(!source.eon.length)throw new Error("NO_EON_DATA");const sourceDates=source.eon.map(x=>x.localDate).filter((x):x is string=>Boolean(x)).sort(),analysisStart=sourceDates[0]??start,analysisEnd=sourceDates.at(-1)??end;
  let weatherBackfill={requestedRanges:0,requestedDays:0,savedHours:0};if(profile.latitude==null||profile.longitude==null)throw new Error("WEATHER_LOCATION_REQUIRED");weatherBackfill=await backfillHistoricalWeather({saveRows:rows=>repository.saveWeather(userId,rows),stored:source.storedWeather,start:analysisStart,end:analysisEnd,referenceDate:args.referenceDate,latitude:profile.latitude,longitude:profile.longitude,timeZone:profile.timeZone,fetcher:args.fetcher});
  const weather=weatherBackfill.savedHours?await repository.weather(userId,analysisStart,analysisEnd):source.weather,analysis=buildHeatingAnalysis({eon:source.eon,weather,pv:source.pv,periods:source.periods,validations:source.validations,referenceDate:args.referenceDate,timeZone:profile.timeZone,targetIndoorC:profile.targetIndoorC,heatSourceType:profile.heatSourceType,maximumElectricPowerKw:profile.maximumElectricPowerKw}),save=await repository.saveAnalysis(userId,analysis.features.map(featureDatabaseRow),analysis.model as unknown as Record<string,unknown>);
  return{modelVersion:HEATING_MODEL_VERSION,analyzedDays:analysis.model.analyzed_days,baselineTrainingDays:analysis.model.baseline_training_days,excludedDays:analysis.model.excluded_days,estimatedHeatingKwh:analysis.model.estimated_heating_kwh,weatherBackfill,save};
 }finally{await repository.release(userId)}
}
