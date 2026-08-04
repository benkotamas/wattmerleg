import type { EonDayCoverage, EonInterval } from "./types";
import { expectedIntervals } from "./date";

function dateRange(start:string,end:string){const result:string[]=[];for(let cursor=new Date(`${start}T12:00:00Z`);cursor<=new Date(`${end}T12:00:00Z`);cursor=new Date(cursor.getTime()+86_400_000))result.push(cursor.toISOString().slice(0,10));return result}

export function aggregateEonIntervals(rows:EonInterval[],start:string,end:string,referenceDate?:string):EonDayCoverage[]{
  return dateRange(start,end).map(localDate=>{const day=rows.filter(x=>x.localDate===localDate),expected=expectedIntervals(localDate),valid=new Set(day.map(x=>x.intervalStartUtc)).size,status:EonDayCoverage["status"]=valid===expected?"complete":localDate===referenceDate?"provisional":"incomplete",include=status!=="incomplete";return{localDate,expectedIntervalCount:expected,rawIntervalCount:day.length,validNonNullIntervalCount:valid,status,importSumKwh:include?day.reduce((s,x)=>s+x.importKwh,0):null,exportSumKwh:include?day.reduce((s,x)=>s+x.exportKwh,0):null,warnings:status==="complete"?[]:[status==="provisional"?"PROVISIONAL_DAY":"INCOMPLETE_DAY"]}})
}
