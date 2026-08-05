import{describe,expect,it}from"vitest";
import{addLocalDays}from"./historical";
import{readGrowattCoverage}from"./coverage";
import{firstUnsettledDate,nextGrowattJobChunk,satisfiedCoverageDates}from"./history-jobs";
import type{SupabaseClient}from"@supabase/supabase-js";

type StoredRow={local_date:string;quality_status:"complete"|"provisional"|"missing"|"invalid";plant_timezone:string};
type PageCall={table:string;userId:string;startDate:string;endDate:string;ascending:boolean;from:number;to:number};

function mockClient(rows:StoredRow[],errorPage:number|null=null){
  const calls:PageCall[]=[];
  const client={from(table:string){
    const filters={userId:"",startDate:"",endDate:"",ascending:false};
    const chain={
      select(){return chain},
      eq(column:string,value:string){if(column==="user_id")filters.userId=value;return chain},
      gte(column:string,value:string){if(column==="local_date")filters.startDate=value;return chain},
      lte(column:string,value:string){if(column==="local_date")filters.endDate=value;return chain},
      order(_column:string,options:{ascending:boolean}){filters.ascending=options.ascending;return chain},
      async range(from:number,to:number){calls.push({table,...filters,from,to});if(calls.length===errorPage)return{data:null,error:{code:"hidden"}};return{data:rows.filter(row=>row.local_date>=filters.startDate&&row.local_date<=filters.endDate).sort((a,b)=>a.local_date.localeCompare(b.local_date)).slice(from,to+1),error:null}},
    };
    return chain;
  }};
  return{calls,client:client as unknown as Pick<SupabaseClient,"from">};
}

const dates=(start:string,count:number)=>Array.from({length:count},(_,index)=>addLocalDays(start,index));

describe("paginated Growatt coverage",()=>{
  it("reads all 1678 rows over two explicit ordered range pages",async()=>{const rows=dates("2022-01-01",1678).map(local_date=>({local_date,quality_status:"complete" as const,plant_timezone:"Europe/Budapest"})),mock=mockClient(rows),result=await readGrowattCoverage(mock.client,"owner","2022-01-01","2026-08-05");expect(result).toHaveLength(1678);expect(mock.calls).toEqual([{table:"growatt_daily_energy",userId:"owner",startDate:"2022-01-01",endDate:"2026-08-05",ascending:true,from:0,to:999},{table:"growatt_daily_energy",userId:"owner",startDate:"2022-01-01",endDate:"2026-08-05",ascending:true,from:1000,to:1999}])});
  it("finds the real first gap and advances after a saved seven-day block",async()=>{const rows:StoredRow[]=dates("2022-01-01",1678).map(local_date=>({local_date,quality_status:local_date>="2024-10-01"&&local_date<="2025-07-31"?"missing":local_date==="2026-08-05"?"provisional":"complete",plant_timezone:"Europe/Budapest"})),mock=mockClient(rows),coverage=await readGrowattCoverage(mock.client,"owner","2022-01-01","2026-08-05"),satisfied=satisfiedCoverageDates(coverage,"2026-08-05");expect(coverage).toHaveLength(1678);expect(satisfied.size).toBe(1374);expect(satisfied.size).not.toBe(1000);expect(firstUnsettledDate("2022-01-01","2026-08-05",satisfied)).toBe("2024-10-01");expect(nextGrowattJobChunk("2022-01-01","2026-08-05",satisfied)).toEqual({startDate:"2024-10-01",endDate:"2024-10-07"});for(const date of dates("2024-10-01",7))satisfied.add(date);expect(firstUnsettledDate("2022-01-01","2026-08-05",satisfied)).toBe("2024-10-08");expect(nextGrowattJobChunk("2022-01-01","2026-08-05",satisfied)).toEqual({startDate:"2024-10-08",endDate:"2024-10-14"})});
  it("deduplicates dates returned by the database",async()=>{const rows:StoredRow[]=dates("2023-01-01",1000).map(local_date=>({local_date,quality_status:"complete",plant_timezone:"Europe/Budapest"}));rows.push({...rows.at(-1)!,quality_status:"provisional"});const result=await readGrowattCoverage(mockClient(rows).client,"owner","2023-01-01","2025-12-31");expect(result).toHaveLength(1000);expect(result.at(-1)?.qualityStatus).toBe("provisional")});
  it("fails closed when a later page has a database error",async()=>{const rows=dates("2022-01-01",1678).map(local_date=>({local_date,quality_status:"complete" as const,plant_timezone:"Europe/Budapest"})),mock=mockClient(rows,2);await expect(readGrowattCoverage(mock.client,"owner","2022-01-01","2026-08-05")).rejects.toThrow("HISTORY_DATABASE_READ_FAILED");expect(mock.calls).toHaveLength(2)});
});
