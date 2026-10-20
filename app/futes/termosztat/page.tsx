"use client";
import {useCallback,useEffect,useState} from "react";
import {AppShell} from "@/components/app-shell";
import {HeatingNav} from "@/components/heating-nav";
import {HeatingQuarterHourChart} from "@/components/heating-quarter-hour-chart";
import {createClient} from "@/lib/supabase/client";
import {DAYS,defaultWeekly,validateWeekly,setpointAt,type WeeklyProgram} from "@/lib/heating/thermostat-program";

type Revision={id:string;effective_from:string;weekly_program:WeeklyProgram;created_at:string;effective_time:string|null};
type Reading={interval_start_utc:string;import_kwh:number|string;export_kwh:number|string};
type WeatherReading={observed_at:string;temperature_c:number|string};
const today=()=>new Intl.DateTimeFormat("sv-SE",{timeZone:"Europe/Budapest",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const hhmm=(stamp:string)=>new Intl.DateTimeFormat("en-GB",{timeZone:"Europe/Budapest",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(new Date(stamp));
const dayOfWeek=(date:string)=>(new Date(date+"T12:00:00Z").getUTCDay()+6)%7;
export default function ThermostatTimelinePage(){
 const [program,setProgram]=useState<WeeklyProgram>(defaultWeekly);
 const [revisions,setRevisions]=useState<Revision[]>([]);
 const [effective,setEffective]=useState(today);
 const [effectiveTime,setEffectiveTime]=useState("");
 const [date,setDate]=useState(today);
 const [weekday,setWeekday]=useState(0);
 const [rows,setRows]=useState<Reading[]>([]);
 const [weather,setWeather]=useState<WeatherReading[]>([]);
 const [loading,setLoading]=useState(true);
 const [saving,setSaving]=useState(false);
 const [message,setMessage]=useState("");
 const load=useCallback(async()=>{
  setLoading(true);
  const db=createClient();
  const start=new Date(date+"T00:00:00Z");start.setUTCDate(start.getUTCDate()-1);
  const end=new Date(date+"T00:00:00Z");end.setUTCDate(end.getUTCDate()+2);
  const [history,measure,weatherResponse]=await Promise.all([
   db.from("thermostat_program_versions").select("id,effective_from,effective_time,weekly_program,created_at").order("effective_from",{ascending:false}).limit(100),
   db.from("eon_interval_readings").select("interval_start_utc,import_kwh,export_kwh").eq("local_date",date).order("interval_start_utc").limit(110),
   db.from("heating_weather_hourly").select("observed_at,temperature_c").gte("observed_at",start.toISOString()).lt("observed_at",end.toISOString()).order("observed_at").limit(100)
  ]);
  if(history.error){setMessage("A programok nem tölthetők be: "+history.error.message)}
  else {
   const valid=(history.data??[]).filter(item=>validateWeekly(item.weekly_program)) as Revision[];
   setRevisions(valid);
  }
  if(measure.error)setMessage("Az E.ON adatok nem tölthetők be: "+measure.error.message);
  else setRows((measure.data??[]) as Reading[]);
  if(weatherResponse.error)setWeather([]);
  else setWeather((weatherResponse.data??[]) as WeatherReading[]);
  setLoading(false);
 },[date]);
 useEffect(()=>{void load()},[load]);
 const current=revisions.find(item=>item.effective_from<=date);
 const update=(index:number,key:"time"|"temperature",value:string)=>{
  setProgram(prev=>prev.map((items,d)=>d!==weekday?items:items.map((p,i)=>i!==index?p:{...p,[key]:key==="temperature"?Number(value):value})));
 };
 const save=async()=>{
  setMessage("");
  if(!/^\d{4}-\d{2}-\d{2}$/.test(effective)||!validateWeekly(program)){setMessage("Hibás program: naponta 1–7 növekvő, 10 perces kapcsolási pont, 00:00 kezdéssel és félfokos hőmérséklettel adható meg.");return}
  if(revisions.some(v=>v.effective_from===effective)&&!window.confirm("Ezen a napon már van mentett program. Felülírod?"))return;
  setSaving(true);
  const db=createClient();const {data:{user}}=await db.auth.getUser();
  if(!user){setMessage("A mentéshez be kell jelentkezned.");setSaving(false);return}
  if(effectiveTime && !/^([01]\\d|2[0-3]):[0-5]\\d$/.test(effectiveTime)){setSaving(false);setMessage("Az időpont formátuma hibás.");return}
  const result=await db.from("thermostat_program_versions").upsert({user_id:user.id,effective_from:effective,effective_time:effectiveTime||null,thermostat_model:"COMPUTHERM Q7RF",weekly_program:program},{onConflict:"user_id,effective_from"});
  setSaving(false);
  if(result.error){setMessage("Nem sikerült menteni: "+result.error.message);return}
  setMessage("A termosztátprogram mentve. A készülék beállításait ez nem módosítja.");await load();
 };
 const revisionAt=(stamp:string)=>{
  const localDay=new Intl.DateTimeFormat("sv-SE",{timeZone:"Europe/Budapest",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(stamp));
  const localTime=hhmm(stamp);
  return revisions.find(r=>r.effective_from<localDay || (r.effective_from===localDay&&(!r.effective_time||r.effective_time.slice(0,5)<=localTime)));
 };
 const plotted=rows.map(row=>{
  const t=new Date(row.interval_start_utc).getTime();
  const weatherPoint=weather.filter(w=>new Date(w.observed_at).getTime()<=t).at(-1);
  const time=hhmm(row.interval_start_utc);
  return {at:row.interval_start_utc,gridKwh:Number(row.import_kwh),targetC:revisionAt(row.interval_start_utc)?setpointAt(revisionAt(row.interval_start_utc)!.weekly_program,dayOfWeek(date),time):null,outsideC:weatherPoint && t-new Date(weatherPoint.observed_at).getTime()<3600000 ? Number(weatherPoint.temperature_c):null};
 });
 const ordered=[...rows].sort((a,b)=>a.interval_start_utc.localeCompare(b.interval_start_utc));
 const max=Math.max(0.25,...ordered.map(r=>Number(r.import_kwh)));
 return <AppShell><HeatingNav/>
  <h1 className="mt-4 text-3xl font-black">Termosztátprogram és 15 perces fogyasztás</h1>
  <p className="mt-2 text-sm text-slate-600">A COMPUTHERM Q7RF programját manuálisan rögzítjük. A Wattmérleg nem vezérli a termosztátot. A beállítások dátumozva megmaradnak.</p>
  <section className="card mt-5 p-5">
   <h2 className="text-xl font-black">Heti program szerkesztése</h2>
   <div className="mt-4 flex flex-wrap gap-2">{DAYS.map((d,i)=><button type="button" key={d} onClick={()=>setWeekday(i)} className={"rounded px-3 py-2 text-sm "+(weekday===i?"bg-slate-900 text-white":"border")}>{d}</button>)}</div>
   <div className="mt-4 space-y-2">{program[weekday].map((point,i)=><div key={i} className="flex flex-wrap items-center gap-3"><span className="w-20 text-sm font-semibold">PROG {i}</span><input aria-label={"Időpont "+i} className="rounded border p-2" type="time" step={600} disabled={i===0} value={point.time} onChange={e=>update(i,"time",e.target.value)}/><input aria-label={"Célhőmérséklet "+i} className="w-24 rounded border p-2" type="number" min={5} max={35} step={0.5} value={point.temperature} onChange={e=>update(i,"temperature",e.target.value)}/><span>°C</span>{i>0&&<button type="button" className="text-sm underline" onClick={()=>setProgram(p=>p.map((day,d)=>d===weekday?day.filter((_,j)=>j!==i):day))}>Törlés</button>}</div>)}</div>
   <div className="mt-3 flex flex-wrap gap-3"><button type="button" disabled={program[weekday].length>=7} className="rounded border px-3 py-2 disabled:opacity-40" onClick={()=>setProgram(p=>p.map((day,d)=>d===weekday?[...day,{time:"23:00",temperature:21}]:day))}>+ Kapcsolási pont</button><button type="button" className="rounded border px-3 py-2" onClick={()=>{setProgram(p=>p.map(()=>p[weekday].map(x=>({...x}))));setMessage("A kiválasztott nap programját átmásoltam mind a hét napra. A módosítás csak a Program mentése gombbal kerül az adatbázisba.");}}>Másolás minden napra</button></div>
   <div className="mt-4 flex flex-wrap items-end gap-3"><label className="text-sm">Érvényes ettől a naptól<input className="mt-1 block rounded border p-2" type="date" value={effective} onChange={e=>setEffective(e.target.value)}/></label><label className="text-sm">Pontos kezdőidő (ha ismert)<input className="mt-1 block rounded border p-2" type="time" step={60} value={effectiveTime} onChange={e=>setEffectiveTime(e.target.value)}/></label><button type="button" disabled={saving} className="rounded bg-slate-900 px-4 py-2 font-semibold text-white disabled:opacity-50" onClick={save}>{saving?"Mentés…":"Program mentése"}</button></div>
   <p className="mt-2 text-xs text-slate-500">A korábban megbeszélt programmal van előtöltve, de csak a mentés után tekintjük rögzítettnek. A pontos kezdőidő megadható, ha biztosan ismert. Üresen hagyva az időpont ismeretlen; a régi programok időpontját ne becsüljük meg.</p>
   {message&&<p className="mt-2 text-sm" role="status">{message}</p>}
   <p className="mt-3 text-xs text-slate-500">Mentett programok: {revisions.map(r=>r.effective_from+(r.effective_time?" "+r.effective_time.slice(0,5):" (időpont ismeretlen)")).join(", ")||"még nincs"}</p>
  </section>
  <section className="card mt-5 p-5">
   <h2 className="text-xl font-black">E.ON 15 perces idővonal</h2>
   <label className="mt-3 block text-sm">Nap<input className="ml-3 rounded border p-2" type="date" value={date} onChange={e=>setDate(e.target.value)}/></label>
   <p className="mt-2 text-sm text-slate-600">{current?"Legutóbbi programverzió kezdőnapja: "+current.effective_from+(current.effective_time?" "+current.effective_time.slice(0,5):" (pontos időpont ismeretlen)"):"Ehhez a naphoz még nincs rögzített termosztátprogram."} A kWh a teljes ház hálózati vételezése, nem kazánmérés. A dátummal, de pontos idő nélkül tárolt programok a korábbi megjelenítési szabály szerint 00:00-tól jelennek meg, ami történetileg bizonytalan lehet.</p>
   {!loading&&<HeatingQuarterHourChart points={plotted} date={date}/>}
   {loading?<p className="mt-4">Mérések betöltése…</p>:<div className="mt-4 max-h-[560px] overflow-y-auto"><div className="grid grid-cols-[65px_1fr_75px_70px] gap-2 border-b pb-2 text-xs font-bold"><span>Idő</span><span>Hálózati vételezés (kWh / 15 perc)</span><span>kWh</span><span>Cél °C</span></div>
    {ordered.map(r=>{const t=hhmm(r.interval_start_utc);const active=revisionAt(r.interval_start_utc);const setpoint=active?setpointAt(active.weekly_program,dayOfWeek(date),t):null;return <div className="grid grid-cols-[65px_1fr_75px_70px] items-center gap-2 border-b border-slate-100 py-1 text-sm" key={r.interval_start_utc}><span>{t}</span><div className="h-3 rounded bg-slate-100"><div className="h-3 rounded bg-slate-600" style={{width:(Math.max(0,Number(r.import_kwh))/max*100)+"%"}}/></div><span>{Number(r.import_kwh).toFixed(2)}</span><span>{setpoint===null?"–":setpoint.toFixed(1)}</span></div>})}
    {ordered.length===0&&<p className="py-4">Erre a napra még nem érkezett E.ON-mérés.</p>}</div>}
   <p className="mt-3 text-xs text-slate-500">Az E.ON jellemzően késéssel szolgáltat adatot. A csúcsok nem feltétlenül a kazántól származnak; a napelemes önfogyasztás ebben a hálózati idősorban nem látható.</p>
  </section>
 </AppShell>;
}
