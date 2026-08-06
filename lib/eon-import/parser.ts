import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { EonImportError } from "./errors";
import { readSecureWorkbook } from "./secure-workbook";
import { expectedIntervals, localKey, parseLocalCell, utcCandidates } from "./date";
import { localDayWindow } from "@/lib/weather/date";
import type { EonDayCoverage, EonInterval, EonParseResult } from "./types";

export const EON_MAX_FILE_BYTES=10*1024*1024, EON_MAX_SHEETS=12, EON_MAX_ROWS=100_000;
const normalize=(v:unknown)=>String(v??"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/\s+/g,"").toLowerCase();
const numberValue=(v:unknown):number|null|undefined=>{if(v===null||v===undefined||v==="")return null;if(typeof v==="number")return Number.isFinite(v)?v:undefined;if(typeof v==="string"){const n=Number(v.trim().replace(/\s/g,"").replace(",","."));return Number.isFinite(n)?n:undefined}return undefined};
const round6=(v:number)=>Math.round(v*1e6)/1e6;
const todayBudapest=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Budapest",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
type Header={row:number;date:number;plus:number;minus:number};
type ScheduledHeader={row:number;pod:number;date:number;variables:[number,number];values:[number,number];units:[number,number]};
const findHeader=(rows:unknown[][]):Header|null=>{for(let row=0;row<Math.min(rows.length,100);row++){const cells=rows[row].map(normalize),date=cells.findIndex(x=>x==="datum/ido"||x==="datumido"),plus=cells.indexOf("+a"),minus=cells.indexOf("-a");if(date>=0&&plus>=0&&minus>=0)return{row,date,plus,minus}}return null};
const matchingIndexes=(cells:string[],value:string)=>cells.map((cell,index)=>cell===value?index:-1).filter(index=>index>=0);
const findScheduledHeader=(rows:unknown[][]):ScheduledHeader|null=>{for(let row=0;row<Math.min(rows.length,100);row++){const cells=rows[row].map(normalize),pod=cells.indexOf("pod"),date=cells.indexOf("idobelyeg"),variables=matchingIndexes(cells,"valtozo"),values=matchingIndexes(cells,"ertek"),units=matchingIndexes(cells,"mertekegyseg");if(pod>=0&&date>=0&&variables.length===2&&values.length===2&&units.length===2)return{row,pod,date,variables:[variables[0],variables[1]],values:[values[0],values[1]],units:[units[0],units[1]]}}return null};
function scheduledRows(rows:unknown[][],header:ScheduledHeader):unknown[][]{const result:unknown[][]=[["Dátum/Idő","+A","-A"]];let pod:string|null=null;for(let index=header.row+1;index<rows.length;index++){const row=rows[index];if(!row?.some(value=>value!==null&&value!==""))continue;const rowPod=String(row[header.pod]??"").trim();if(!pod&&rowPod)pod=rowPod;let plus:unknown=Number.NaN,minus:unknown=Number.NaN,plusCount=0,minusCount=0;for(let pair=0;pair<2;pair++){const variable=normalize(row[header.variables[pair]]),unit=normalize(row[header.units[pair]]),value=unit==="kwh"?row[header.values[pair]]:Number.NaN;if(variable==="+a"){plus=value;plusCount++}else if(variable==="-a"){minus=value;minusCount++}}const podMatches=!pod||!rowPod||rowPod===pod;if(!podMatches||plusCount!==1||minusCount!==1){plus=Number.NaN;minus=Number.NaN}result.push([row[header.date],plus,minus])}return result}

type SpringTemplate={date:string;rowIndexes:Set<number>;intervals:EonInterval[];ambiguous:boolean};
function springTemplates(rows:unknown[][],header:Header):Map<string,SpringTemplate>{
  const grouped=new Map<string,{index:number;local:Extract<ReturnType<typeof parseLocalCell>,{kind:"valid"}>;imp:number|null|undefined;exp:number|null|undefined}[]>();
  for(let index=header.row+1;index<rows.length;index++){
    const row=rows[index],label=normalize(row[header.date]);if(label.includes("maximum")||label.includes("osszeg"))continue;
    const local=parseLocalCell(row[header.date]);if(local.kind!=="valid")continue;const date=localKey(local.value).slice(0,10),list=grouped.get(date)??[];
    list.push({index,local,imp:numberValue(row[header.plus]),exp:numberValue(row[header.minus])});grouped.set(date,list);
  }
  const result=new Map<string,SpringTemplate>();
  for(const[date,items]of grouped){if(expectedIntervals(date)!==92||items.length!==96)continue;
    const timestampsOk=items.every((item,i)=>item.local.value.hour===Math.floor(i/4)&&item.local.value.minute===(i%4)*15&&item.local.value.second===0);
    const full=items.filter(x=>typeof x.imp==="number"&&Number.isFinite(x.imp)&&x.imp>=0&&typeof x.exp==="number"&&Number.isFinite(x.exp)&&x.exp>=0),blank=items.filter(x=>x.imp===null&&x.exp===null);
    const valuesOk=items.every(x=>(x.imp===null&&x.exp===null)||(typeof x.imp==="number"&&Number.isFinite(x.imp)&&x.imp>=0&&typeof x.exp==="number"&&Number.isFinite(x.exp)&&x.exp>=0)),safe=timestampsOk&&full.length===92&&blank.length===4&&valuesOk,start=localDayWindow(date,"Europe/Budapest").start;
    result.set(date,{date,rowIndexes:new Set(items.map(x=>x.index)),ambiguous:!safe,intervals:safe?full.map((x,i)=>({intervalStartUtc:new Date(start+i*900000).toISOString(),localDate:date,importKwh:x.imp as number,exportKwh:x.exp as number})):[]});
  }return result;
}

export function parseEonWorkbook(input:Uint8Array|Buffer, options:{referenceDate?:string}={}):EonParseResult {
  const bytes=Buffer.from(input); if(bytes.length>EON_MAX_FILE_BYTES)throw new EonImportError("EON_FILE_TOO_LARGE",413); if(bytes.length<4||bytes[0]!==0x50||bytes[1]!==0x4b)throw new EonImportError("EON_INVALID_FILE_TYPE",415);
  const sheets=readSecureWorkbook(bytes,EON_MAX_SHEETS,EON_MAX_ROWS);
  const candidates:{rows:unknown[][];header:Header}[]=[];let anyWorkbookCell=false; for(const rows of sheets){if(rows.some(row=>row?.some(value=>value!==null&&value!=="")))anyWorkbookCell=true;const header=findHeader(rows);if(header){candidates.push({rows,header});continue}const scheduled=findScheduledHeader(rows);if(scheduled)candidates.push({rows:scheduledRows(rows,scheduled),header:{row:0,date:0,plus:1,minus:2}})}
  if(!candidates.length){if(!anyWorkbookCell)throw new EonImportError("EON_NO_INTERVAL_DATA");throw new EonImportError("EON_WORKSHEET_NOT_FOUND")} if(candidates.length>1)throw new EonImportError("EON_AMBIGUOUS_WORKSHEET");
  const {rows,header}=candidates[0], referenceDate=options.referenceDate??todayBudapest(), templates=springTemplates(rows,header),templateRows=new Map<number,SpringTemplate>();for(const template of templates.values())for(const index of template.rowIndexes)templateRows.set(index,template);
  const occurrences=new Map<string,number>(), seenUtc=new Set<string>(), intervals:EonInterval[]=[], dayRaw=new Map<string,number>(), dayInvalid=new Set<string>(), dayBlank=new Map<string,number>();
  let rawRows=0,invalidRows=0,totalExpected:[number,number]|null=null,maxExpected:[number,number]|null=null,totalRows=0,maxRows=0; const warnings=new Set<string>(),blocking=new Set<string>();
  for(let i=header.row+1;i<rows.length;i++){
    const row=rows[i],label=normalize(row[header.date]); if(!row.some(v=>v!==null&&v!==""))continue;
    if(label.includes("maximum")||label.includes("osszeg")){
      const imp=numberValue(row[header.plus]),exp=numberValue(row[header.minus]),isMax=label.includes("maximum"); if(isMax)maxRows++;else totalRows++;
      if((isMax?maxRows:totalRows)>1){blocking.add("EON_DUPLICATE_SUMMARY_ROW");continue}
      if(imp===null||exp===null||imp===undefined||exp===undefined||imp<0||exp<0){blocking.add("EON_INVALID_SUMMARY_ROW");continue}
      if(isMax)maxExpected=[imp,exp];else totalExpected=[imp,exp]; continue;
    }
    const template=templateRows.get(i);if(template){rawRows++;dayRaw.set(template.date,(dayRaw.get(template.date)??0)+1);if(template.date>referenceDate){invalidRows++;dayInvalid.add(template.date);blocking.add("EON_FUTURE_INTERVAL_DATE");continue}if(i===Math.min(...template.rowIndexes)){if(template.ambiguous){dayInvalid.add(template.date);blocking.add("EON_DST_TEMPLATE_AMBIGUOUS")}else{intervals.push(...template.intervals);warnings.add("DST_SPRING_TEMPLATE_ALIGNED")}}continue}
    const parsed=parseLocalCell(row[header.date]),imp=numberValue(row[header.plus]),exp=numberValue(row[header.minus]);
    const relevant=imp!==null||exp!==null||parsed.kind!=="empty"; if(!relevant)continue; rawRows++;
    if(parsed.kind!=="valid"){invalidRows++;blocking.add(parsed.kind==="invalid_interval"?"EON_INVALID_INTERVAL":"EON_INVALID_DATE");continue}
    const local=parsed.value,date=localKey(local).slice(0,10); dayRaw.set(date,(dayRaw.get(date)??0)+1);
    if(date>referenceDate){invalidRows++;dayInvalid.add(date);blocking.add("EON_FUTURE_INTERVAL_DATE");continue}
    const key=localKey(local),possible=utcCandidates(local),occurrence=occurrences.get(key)??0;occurrences.set(key,occurrence+1);const utc=possible[occurrence];
    if(!utc){invalidRows++;dayInvalid.add(date);blocking.add(possible.length?"EON_DUPLICATE_INTERVAL":"EON_INVALID_DATE");continue}
    if(seenUtc.has(utc)){invalidRows++;dayInvalid.add(date);blocking.add("EON_DUPLICATE_INTERVAL");continue} seenUtc.add(utc);
    if((imp===null)!==(exp===null)){invalidRows++;dayInvalid.add(date);blocking.add("EON_PARTIAL_INTERVAL_VALUE");continue}
    if(imp===null&&exp===null){dayBlank.set(date,(dayBlank.get(date)??0)+1);continue}
    if(imp===null||exp===null){invalidRows++;dayInvalid.add(date);blocking.add("EON_PARTIAL_INTERVAL_VALUE");continue}
    if(imp===undefined||exp===undefined){invalidRows++;dayInvalid.add(date);blocking.add("EON_INVALID_INTERVAL");continue}
    if(imp<0||exp<0){invalidRows++;dayInvalid.add(date);blocking.add("EON_NEGATIVE_VALUE");continue}
    intervals.push({intervalStartUtc:utc,localDate:date,importKwh:imp,exportKwh:exp});
  }
  const dates=[...new Set([...dayRaw.keys(),...intervals.map(x=>x.localDate)])].sort(),days:EonDayCoverage[]=[];
  if(rawRows===0||dates.length===0)blocking.add("EON_NO_INTERVAL_DATA");
  for(const date of dates){const records=intervals.filter(x=>x.localDate===date),expected=expectedIntervals(date),raw=dayRaw.get(date)??0,blank=dayBlank.get(date)??0,aligned=date<=referenceDate&&templates.get(date)?.ambiguous===false;let status:EonDayCoverage["status"];if(dayInvalid.has(date))status="invalid";else if(date===referenceDate&&records.length<expected)status="provisional";else if(records.length===expected&&((raw===expected&&!blank)||aligned))status="complete";else status="incomplete";const include=status==="complete"||status==="provisional",dayWarnings:string[]=[];if(aligned)dayWarnings.push("DST_SPRING_TEMPLATE_ALIGNED");if(expected===100&&raw===96&&records.length===96){dayWarnings.push("DST_FALLBACK_SOURCE_96");warnings.add("DST_FALLBACK_SOURCE_96")}if(status!=="complete")dayWarnings.push(status==="provisional"?"PROVISIONAL_DAY":status==="incomplete"?"INCOMPLETE_DAY":"INVALID_DAY");days.push({localDate:date,expectedIntervalCount:expected,rawIntervalCount:raw,validNonNullIntervalCount:records.length,status,importSumKwh:include?round6(records.reduce((s,x)=>s+x.importKwh,0)):null,exportSumKwh:include?round6(records.reduce((s,x)=>s+x.exportKwh,0)):null,warnings:dayWarnings})}
  for(const day of days)for(const warning of day.warnings)warnings.add(warning);
  const importSum=round6(intervals.reduce((s,x)=>s+x.importKwh,0)),exportSum=round6(intervals.reduce((s,x)=>s+x.exportKwh,0)),maxImport=Math.max(0,...intervals.map(x=>x.importKwh)),maxExport=Math.max(0,...intervals.map(x=>x.exportKwh)),close=(a:number,b:number)=>Math.abs(a-b)<=.001,totalMatches=!totalExpected||(close(totalExpected[0],importSum)&&close(totalExpected[1],exportSum)),maximumMatches=!maxExpected||(close(maxExpected[0],maxImport)&&close(maxExpected[1],maxExport));
  if(!totalMatches){warnings.add("SUMMARY_TOTAL_MISMATCH");blocking.add("EON_SUMMARY_TOTAL_MISMATCH")} if(!maximumMatches){warnings.add("SUMMARY_MAX_MISMATCH");blocking.add("EON_SUMMARY_MAX_MISMATCH")}
  return{sha256:createHash("sha256").update(bytes).digest("hex"),periodStart:dates[0]??null,periodEnd:dates.at(-1)??null,rawRows,validRows:intervals.length,invalidRows,completeDays:days.filter(x=>x.status==="complete").length,provisionalDays:days.filter(x=>x.status==="provisional").length,incompleteDays:days.filter(x=>x.status==="incomplete"||x.status==="invalid").length,importSumKwh:importSum,exportSumKwh:exportSum,summaryValidation:{totalMatches,maximumMatches},days,intervals,blockingErrors:[...blocking],warnings:[...warnings]};
}
