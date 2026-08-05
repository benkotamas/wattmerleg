import type {SupabaseClient} from"@supabase/supabase-js";
import type{JobCoverage}from"./history-jobs";

export const GROWATT_COVERAGE_PAGE_SIZE=1000;
export type GrowattCoverage=JobCoverage&{plantTimezone:string|null};

export async function readGrowattCoverage(
  client:Pick<SupabaseClient,"from">,
  userId:string,
  startDate:string,
  endDate:string,
):Promise<GrowattCoverage[]> {
  const byDate=new Map<string,GrowattCoverage>();
  for(let from=0;;from+=GROWATT_COVERAGE_PAGE_SIZE){
    const result=await client.from("growatt_daily_energy")
      .select("local_date,quality_status,plant_timezone")
      .eq("user_id",userId)
      .gte("local_date",startDate)
      .lte("local_date",endDate)
      .order("local_date",{ascending:true})
      .range(from,from+GROWATT_COVERAGE_PAGE_SIZE-1);
    if(result.error)throw new Error("HISTORY_DATABASE_READ_FAILED");
    const rows=result.data??[];
    for(const row of rows)byDate.set(String(row.local_date),{
      localDate:String(row.local_date),
      qualityStatus:row.quality_status as GrowattCoverage["qualityStatus"],
      plantTimezone:row.plant_timezone==null?null:String(row.plant_timezone),
    });
    if(rows.length<GROWATT_COVERAGE_PAGE_SIZE)break;
  }
  return[...byDate.values()].sort((a,b)=>a.localDate.localeCompare(b.localDate));
}
