import {redirect} from "next/navigation";
import {AppShell} from "@/components/app-shell";
import {HeatingNav} from "@/components/heating-nav";
import {createClient} from "@/lib/supabase/server";

export const dynamic="force-dynamic";
type Reading={local_date:string;interval_start_utc:string;import_kwh:number|string;export_kwh:number|string};
type Weather={local_date:string;average_temperature_c:number|string|null};
const fmt=(value:number,places=2)=>value.toLocaleString("hu-HU",{minimumFractionDigits:places,maximumFractionDigits:places});
const hh=new Intl.DateTimeFormat("en-GB",{timeZone:"Europe/Budapest",hour:"2-digit",minute:"2-digit",hourCycle:"h23"});
const today=()=>new Intl.DateTimeFormat("sv-SE",{timeZone:"Europe/Budapest",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
function previousDay(date:string){const d=new Date(date+"T12:00:00Z");d.setUTCDate(d.getUTCDate()-1);return d.toISOString().slice(0,10)}
export default async function MorningHeatingPage(){
 const db=await createClient();
 if(!db)return <AppShell><HeatingNav/><p className="card p-5">Az adatkapcsolat nem érhető el.</p></AppShell>;
 const {data:{user}}=await db.auth.getUser();if(!user)redirect("/belepes");
 const start="2026-10-17",last=previousDay(today());
 const meterRows:Reading[]=[];let meterError=false;
 for(let offset=0;offset<20000;offset+=1000){
  const {data,error}=await db.from("eon_interval_readings").select("local_date,interval_start_utc,import_kwh,export_kwh").eq("user_id",user.id).gte("local_date",start).lte("local_date",last).order("interval_start_utc").range(offset,offset+999);
  if(error){meterError=true;break}meterRows.push(...((data??[]) as Reading[]));if(!data||data.length<1000)break;
 }
 const model=await db.from("heating_analysis_models").select("model_version").eq("user_id",user.id).order("updated_at",{ascending:false}).limit(1).maybeSingle();
 const weather=model.data?.model_version?await db.from("heating_energy_daily_features").select("local_date,average_temperature_c").eq("user_id",user.id).eq("model_version",model.data.model_version).gte("local_date",start).lte("local_date",last):{data:[] as Weather[],error:null};
 const weatherMap=new Map<string,number>((weather.data??[]).filter(w=>w.average_temperature_c!==null).map(w=>[w.local_date,Number(w.average_temperature_c)]));
 const days=new Map<string,{date:string;all:Set<string>;morning:Set<string>;grid:number;before:number;after:number;exported:number}>();
 for(const r of meterRows){
  const item=days.get(r.local_date)??{date:r.local_date,all:new Set<string>(),morning:new Set<string>(),grid:0,before:0,after:0,exported:0};
  if(item.all.has(r.interval_start_utc))continue;
  item.all.add(r.interval_start_utc);
  const time=hh.format(new Date(r.interval_start_utc));
  if(time>="06:00"&&time<"09:00"){
   item.morning.add(time);
   item.grid+=Number(r.import_kwh);item.exported+=Number(r.export_kwh);
   if(time<"07:30")item.before+=Number(r.import_kwh);else item.after+=Number(r.import_kwh);
  }
  days.set(r.local_date,item);
 }
 const all=[...days.values()].sort((a,b)=>b.date.localeCompare(a.date));
 const complete=all.filter(d=>d.morning.size===12);
 const avg=complete.length?complete.reduce((s,d)=>s+d.grid,0)/complete.length:null;
 const max=Math.max(0.01,...complete.map(d=>d.grid));
 return <AppShell><HeatingNav/>
  <h1 className="mt-4 text-3xl font-black">Reggeli felfűtés elemzése</h1>
  <p className="mt-2 text-sm text-slate-600">06:00–09:00 közötti valós E.ON hálózati vételezés, naponta összehasonlítva. A mérés a teljes házat mutatja, a napelemes önfogyasztást és a külön kazánfogyasztást nem. Az eredmények nem igazolják önmagukban a kazán működését.</p>
  <div className="mt-5 grid gap-3 sm:grid-cols-3">
   <div className="card p-4"><div className="text-xs text-slate-500">Teljes reggeli mérésű napok</div><div className="mt-2 text-2xl font-black">{complete.length}</div></div>
   <div className="card p-4"><div className="text-xs text-slate-500">Átlagos reggeli vételezés</div><div className="mt-2 text-2xl font-black">{avg===null?"–":fmt(avg)+" kWh"}</div></div>
   <div className="card p-4"><div className="text-xs text-slate-500">Mért időablak</div><div className="mt-2 text-2xl font-black">06:00–09:00</div></div>
  </div>
  {(meterError||weather.error)&&<p role="alert" className="mt-4 text-sm text-red-700">Egyes adatok nem tölthetők be, az összehasonlítás hiányos lehet.</p>}
  <section className="card mt-5 p-5">
   <h2 className="text-xl font-black">Reggeli hálózati fogyasztás naponta</h2>
   <p className="mt-2 text-sm text-slate-600">Csak a teljes, 12 darab negyedórás mérési ponttal rendelkező reggeleket hasonlítjuk össze. A mai nap és a hiányos reggelek kimaradnak az átlagból.</p>
   <div className="mt-4 space-y-3">{complete.slice(0,30).map(d=><div key={d.date} className="grid grid-cols-[95px_1fr_90px] items-center gap-3 text-sm"><span className="font-semibold">{d.date}</span><div className="h-5 rounded bg-slate-100"><div className="h-5 rounded bg-slate-600" style={{width:(d.grid/max*100)+"%"}}/></div><span className="text-right">{fmt(d.grid)} kWh</span></div>)}
    {complete.length===0&&<p className="text-sm text-slate-600">Még nincs teljes reggeli mérés.</p>}
   </div>
   <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[630px] text-left text-sm"><thead><tr className="border-b"><th className="p-2">Dátum</th><th className="p-2">06:00–07:30</th><th className="p-2">07:30–09:00</th><th className="p-2">Összesen</th><th className="p-2">Külső napi átlag</th><th className="p-2">Adatminőség</th></tr></thead><tbody>{all.map(d=><tr className="border-b border-slate-100" key={d.date}><td className="p-2">{d.date}</td><td className="p-2">{fmt(d.before)} kWh</td><td className="p-2">{fmt(d.after)} kWh</td><td className="p-2 font-semibold">{fmt(d.grid)} kWh</td><td className="p-2">{weatherMap.has(d.date)?fmt(weatherMap.get(d.date)!,1)+" °C":"–"}</td><td className="p-2">{d.morning.size===12?"Teljes reggel":d.morning.size+"/12 mérés (részleges)"}</td></tr>)}</tbody></table></div>
  </section>
  <section className="card mt-4 p-5"><h2 className="text-xl font-black">Hogyan használjuk az eredményeket?</h2><p className="mt-2 text-sm text-slate-600">A reggeli fogyasztási csúcsok időben összevethetők a 06:00-s termosztátcél-emeléssel, de a teljes E.ON-vételezésből nem választható le biztosan a kazán. A Growatt-termelésből rendelkezésre álló napi összesítés nem elegendő a reggeli, negyedórás önfogyasztás felosztásához. A különböző programú reggelek, valamint az eltérő kinti időjárás csak fenntartásokkal hasonlíthatók össze.</p></section>
 </AppShell>;
}
