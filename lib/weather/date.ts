export function localIsoDate(date: Date, timeZone = "Europe/Budapest"): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function weatherRequestKind(logDate: string, now: Date, timeZone = "Europe/Budapest"): "historical" | "forecast" {
  return logDate < localIsoDate(now, timeZone) ? "historical" : "forecast";
}

const partsInZone=(date:Date,timeZone:string)=>{const parts=new Intl.DateTimeFormat("en-CA",{timeZone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"}).formatToParts(date);const get=(type:Intl.DateTimeFormatPartTypes)=>Number(parts.find(part=>part.type===type)?.value);return{year:get("year"),month:get("month"),day:get("day"),hour:get("hour"),minute:get("minute"),second:get("second")}};
export function zonedMidnightUtc(date:string,timeZone="Europe/Budapest"):Date{const [year,month,day]=date.split("-").map(Number);let timestamp=Date.UTC(year,month-1,day);for(let attempt=0;attempt<3;attempt++){const shown=partsInZone(new Date(timestamp),timeZone);const represented=Date.UTC(shown.year,shown.month-1,shown.day,shown.hour,shown.minute,shown.second);timestamp+=Date.UTC(year,month-1,day)-represented}return new Date(timestamp)}
export function zonedLocalDateTimeUtc(value:string,timeZone="Europe/Budapest"):Date|null{const match=value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);if(!match)return null;const target={year:+match[1],month:+match[2],day:+match[3],hour:+match[4],minute:+match[5],second:0};let timestamp=Date.UTC(target.year,target.month-1,target.day,target.hour,target.minute);for(let attempt=0;attempt<4;attempt++){const shown=partsInZone(new Date(timestamp),timeZone),represented=Date.UTC(shown.year,shown.month-1,shown.day,shown.hour,shown.minute,shown.second),wanted=Date.UTC(target.year,target.month-1,target.day,target.hour,target.minute);timestamp+=wanted-represented}const final=partsInZone(new Date(timestamp),timeZone);return Object.keys(target).every(key=>final[key as keyof typeof final]===target[key as keyof typeof target])?new Date(timestamp):null}
export function addCalendarDays(date:string,days:number):string{const [year,month,day]=date.split("-").map(Number),next=new Date(Date.UTC(year,month-1,day+days));return `${next.getUTCFullYear()}-${String(next.getUTCMonth()+1).padStart(2,"0")}-${String(next.getUTCDate()).padStart(2,"0")}`}
export function localDayWindow(date:string,timeZone="Europe/Budapest"):{start:number;end:number;durationHours:number}{const start=zonedMidnightUtc(date,timeZone).getTime(),end=zonedMidnightUtc(addCalendarDays(date,1),timeZone).getTime();return{start,end,durationHours:(end-start)/3_600_000}}
