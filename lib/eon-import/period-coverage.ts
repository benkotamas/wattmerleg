import{localDayWindow}from"@/lib/weather/date";
export function firstFullQuarterHour(boundary:string|Date){const value=new Date(boundary).getTime();if(!Number.isFinite(value))throw new Error("INVALID_PERIOD_BOUNDARY");return new Date(Math.ceil(value/900_000)*900_000)}
export function expectedIntervalsWithinPeriodDay(localDate:string,firstInterval:string|Date){const day=localDayWindow(localDate,"Europe/Budapest"),start=Math.max(day.start,firstFullQuarterHour(firstInterval).getTime());return Math.max(0,Math.floor((day.end-start)/900_000))}
