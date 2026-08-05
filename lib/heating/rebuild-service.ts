import {addCalendarDays,localIsoDate} from "@/lib/weather/date";
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
export type HeatingAnalysisTimingStage="input_profile_load"|"source_db_read"|"weather_backfill"|"weather_db_refresh"|"build_heating_analysis"|"save_analysis"|"total";
export type HeatingAnalysisTiming=(stage:HeatingAnalysisTimingStage,durationMs:number)=>void;
const defaultTiming:HeatingAnalysisTiming=(stage,durationMs)=>console.info("HEATING_ANALYSIS_TIMING",{stage,durationMs});
export async function runHeatingAnalysisRebuild(args:{repository:HeatingAnalysisRepository;userId:string;referenceDate?:string;now?:Date;fetcher?:typeof fetch;timing?:HeatingAnalysisTiming}){
 const{repository,userId}=args,timing=args.timing??defaultTiming,totalStarted=performance.now(),measure=async<T>(stage:HeatingAnalysisTimingStage,work:()=>Promise<T>)=>{const started=performance.now();try{return await work()}finally{timing(stage,Math.round(performance.now()-started))}};if(!await repository.claim(userId))throw new Error("ANALYSIS_ALREADY_RUNNING");
 try{const profile=await measure("input_profile_load",()=>repository.profile(userId)),referenceDate=args.referenceDate??localIsoDate(args.now??new Date(),profile.timeZone),end=addCalendarDays(referenceDate,-1),start=addCalendarDays(end,-(HEATING_ANALYSIS_MAX_DAYS-1)),source=await measure("source_db_read",()=>repository.source(userId,start,end));if(source.eon.length>HEATING_ANALYSIS_MAX_EON_INTERVALS)throw new Error("ANALYSIS_RANGE_TOO_LARGE");if(!source.eon.length)throw new Error("NO_EON_DATA");const sourceDates=source.eon.map(x=>x.localDate).filter((x):x is string=>Boolean(x)).sort(),analysisStart=sourceDates[0]??start,analysisEnd=sourceDates.at(-1)??end;
  let weatherBackfill={requestedRanges:0,requestedDays:0,savedHours:0};if(profile.latitude==null||profile.longitude==null)throw new Error("WEATHER_LOCATION_REQUIRED");const latitude=profile.latitude,longitude=profile.longitude;weatherBackfill=await measure("weather_backfill",()=>backfillHistoricalWeather({saveRows:rows=>repository.saveWeather(userId,rows),stored:source.storedWeather,start:analysisStart,end:analysisEnd,referenceDate,latitude,longitude,timeZone:profile.timeZone,fetcher:args.fetcher}));
  const weather=weatherBackfill.savedHours?await measure("weather_db_refresh",()=>repository.weather(userId,analysisStart,analysisEnd)):source.weather,buildStarted=performance.now(),analysis=buildHeatingAnalysis({eon:source.eon,weather,pv:source.pv,periods:source.periods,validations:source.validations,referenceDate,timeZone:profile.timeZone,targetIndoorC:profile.targetIndoorC,heatSourceType:profile.heatSourceType,maximumElectricPowerKw:profile.maximumElectricPowerKw});timing("build_heating_analysis",Math.round(performance.now()-buildStarted));const save=await measure("save_analysis",()=>repository.saveAnalysis(userId,analysis.features.map(featureDatabaseRow),analysis.model as unknown as Record<string,unknown>));
  return{modelVersion:HEATING_MODEL_VERSION,analyzedDays:analysis.model.analyzed_days,baselineTrainingDays:analysis.model.baseline_training_days,excludedDays:analysis.model.excluded_days,estimatedHeatingKwh:analysis.model.estimated_heating_kwh,weatherBackfill,save};
 }finally{try{await repository.release(userId)}finally{timing("total",Math.round(performance.now()-totalStarted))}}
}
