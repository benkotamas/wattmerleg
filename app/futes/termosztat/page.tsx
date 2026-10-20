"use client";
import {useCallback,useEffect,useState} from "react";
import {AppShell} from "@/components/app-shell";
import {HeatingNav} from "@/components/heating-nav";
import {createClient} from "@/lib/supabase/client";
import {DAYS,defaultWeekly,validateWeekly,setpointAt,type WeeklyProgram} from "@/lib/heating/thermostat-program";

type Revision={id:string;effective_from:string;weekly_program:WeeklyProgram;created_at:string};
type Reading={interval_start_utc:string;import_kwh:number|string;export_kwh:number|string};
const today=()=>new Intl.DateTimeFormat("sv-SE",{timeZone:"Europe/Budapest",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const hhmm=(stamp:string)=>new Intl.DateTimeFormat("en-GB",{timeZone:"Europe/Budapest",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(new Date(stamp));
const dayOfWeek=(date:string)=>(new Date(date+"T12:00:00Z").getUTCDay()+6)%7;
export default function ThermostatTimelinePage(){
 const [program,setProgram]=useState<WeeklyProgram>(defaultWeekly);
 const [revisions,setRevisions]=useState<Revision[]>([]);
 const [effective,setEffective]=useState(today);
 const [date,setDate]=useState(today);
 const [weekday,setWeekday]=useState(0);
 const [rows,setRows]=useState<Reading[]>([]);
 const [loading,setLoading]=useState(true);
 const [saving,setSaving]=useState(false);
 const [message,setMessage]=useState("");
 const [forward,setForward]=useState<string>("");
 const [target,setTarget]=useState<string>("");
 const load=useCallback(async()=>{
  setLoading(true);
  const db=createClient();
  const [history,measure]=await Promise.all([
   db.from("thermostat_program_versions").select("id,effective_from,weekly_program,created_at").order("effective_from",{ascending:false}).limit(100),
   db.from("eon_interval_readings").select("interval_start_utc,import_kwh,export_kwh").eq("local_date",date).order("interval_start_utc").limit(110)
  ]);
  if(history.error){setMessage("A programok nem tölthetők be: "+history.error.message)}
  else {
   const valid=(history.data??[]).filter(item=>validateWeekly(item.weekly_program)) as Revision[];
   setRevisions(valid);
  }
  if(measure.error)setMessage("Az E.ON adatok nem tölthetők be: "+measure.error.message);
  else setRows((measure.data??[]) as Reading[]);
  setLoading(false);
 },[date]);
 useEffect(()=>{void load()},[load]);
 const current=revisions.find(item=>item.effective_from<=date);
 const day=current?.weekly_program[dayOfWeek(date)];
 const update=(index:number,key:"time"|"temperature",value:string)=>{
  setProgram(prev=>prev.map((items,d)=>d!==weekday?items:items.map((p,i)=>i!==index?p:{...p,[key]:key==="temperature"?Number(value):value})));
 };
 const save=async()=>{
  setMessage("");
  if(!/^\\d{4}-\\d{2}-\\d{2}$/.test(effective)||!validateWeekly(program)){setMessage("Hibás program: naponta 1–7 növekvő, 10 perces kapcsolási pont, 00:00 kezdéssel és félfokos hőmérséklettel adható meg.");return}
  if(revisions.some(v=>v.effective_from===effective)&&!window.confirm("Ezen a napon már van mentett program. Felülírod?"))return;
  setSaving(true);
  const db=createClient();const {data:{user}}=await db.auth.getUser();
  if(!user){setMessage("A mentéshez be kell jelentkezned.");setSaving(false);return}
  const result=await db.from("thermostat_program_versions").upsert({user_id:user.id,effective_from:effective,thermostat_model:"COMPUTHERM Q7RF",weekly_program:program},{onConflict:"user_id,effective_from"});
  setSaving(false);
  if(result.error){setMessage("Nem sikerült menteni: "+result.error.message);return}
  setMessage("A termosztátprogram mentve. A készülék beállításait ez nem módosítja.");await load();
 };
 const ordered=[...rows].sort((a,b)=>a.interval_start_utc.localeCompare(b.interval_start_utc));
 const max=Math.max(0.25,...ordered.map(r=>Number(r.import_kwh)));
 return <AppShell><HeatingNav/>
  <h1 className="mt-4 text-3xl font-black">Termosztátprogram és 15 perces fogyasztás</h1>
  <p className="mt-2 text-sm text-slate-600">A COMPUTHERM Q7RF programját manuálisan rögzítjük. A Wattmérleg nem vezérli a termosztátot. A beállítások dátumozva megmaradnak.</p>
  <section className="card mt-5 p-5">
   <h2 className="text-xl font-black">Heti program szerkesztése</h2>
   <div className="mt-4 flex flex-wrap gap-2">{DAYS.map((d,i)=><button type="button" key={d} onClick={()=>setWeekday(i)} className={"rounded px-3 py-2 text-sm "+(weekday===i?"bg-slate-900 text-white":"border")}>{d}</button>)}</div>
   <div className="mt-4 space-y-2">{program[weekday].map((point,i)=><div key={i} className="flex flex-wrap items-center gap-3"><span className="w-20 text-sm font-semibold">PROG {i}</span><input aria-label={"Időpont "+i} className="rounded border p-2" type="time" step={600} disabled={i===0} value={point.time} onChange={e=>update(i,"time",e.target.value)}/><input aria-label={"Célhőmérséklet "+i} className="w-24 rounded border p-2" type="number" min={5} max={35} step={0.5} value={point.temperature} onChange={e=>update(i,"temperature",e.target.value)}/><span>°C</span>{i>0&&<button type="button" className="text-sm underline" onClick={()=>setProgram(p=>p.map((day,d)=>d===weekday?day.filter((_,j)=>j!==i):day))}>Törlés</button>}</div>)}</div>
   <div className="mt-3 flex flex-wrap gap-3"><button type="button" disabled={program[weekday].length>=7} className="rounded border px-3 py-2 disabled:opacity-40" onClick={()=>setProgram(p=>p.map((day,d)=>d===weekday?[...day,{time:"23:00",temperature:21}]:day))}>+ Kapcsolási pont</button><button type="button" className="rounded border px-3 py-2" onClick={()=>setProgram(p=>p.map((day,d)=>d===weekday?program[weekday].map(x=>({...x})):day))}>Másolás minden napra</button></div>
   <div className="mt-4 flex flex-wrap items-end gap-3"><label className="text-sm">Érvényes ettől a naptól<input className="mt-1 block rounded border p-2" type="date" value={effective} onChange={e=>setEffective(e.target.value)}/></label><button type="button" disabled={saving} className="rounded bg-slate-900 px-4 py-2 font-semibold text-white disabled:opacity-50" onClick={save}>{saving?"Mentés…":"Program mentése"}</button></div>
   <p className="mt-2 text-xs text-slate-500">A korábban megbeszélt programmal van előtöltve, de csak a mentés után tekintjük rögzítettnek. A programváltozások kezdőnapját a valós módosítás alapján add meg.</p>
   {message&&<p className="mt-2 text-sm" role="status">{message}</p>}
   <p className="mt-3 text-xs text-slate-500">Mentett programok: {revisions.map(r=>r.effective_from).join(", ")||"még nincs"}</p>
  </section>
  <section className="card mt-5 p-5">
   <h2 className="text-xl font-black">E.ON 15 perces idővonal</h2>
   <label className="mt-3 block text-sm">Nap<input className="ml-3 rounded border p-2" type="date" value={date} onChange={e=>setDate(e.target.value)}/></label>
   <p className="mt-2 text-sm text-slate-600">{current?"Alkalmazott program kezdete: "+current.effective_from:"Ehhez a naphoz még nincs rögzített termosztátprogram."} A kWh a teljes ház hálózati vételezése, nem kazánmérés.</p>
   {loading?<p className="mt-4">Mérések betöltése…</p>:<div className="mt-4 max-h-[560px] overflow-y-auto"><div className="grid grid-cols-[65px_1fr_75px_70px] gap-2 border-b pb-2 text-xs font-bold"><span>Idő</span><span>Hálózati vételezés (kWh / 15 perc)</span><span>kWh</span><span>Cél °C</span></div>
    {ordered.map(r=>{const t=hhmm(r.interval_start_utc);const setpoint=current?setpointAt(current.weekly_program,dayOfWeek(date),t):null;return <div className="grid grid-cols-[65px_1fr_75px_70px] items-center gap-2 border-b border-slate-100 py-1 text-sm" key={r.interval_start_utc}><span>{t}</span><div className="h-3 rounded bg-slate-100"><div className="h-3 rounded bg-slate-600" style={{width:(Math.max(0,Number(r.import_kwh))/max*100)+"%"}}/></div><span>{Number(r.import_kwh).toFixed(2)}</span><span>{setpoint===null?"–":setpoint.toFixed(1)}</span></div>})}
    {ordered.length===0&&<p className="py-4">Erre a napra még nem érkezett E.ON-mérés.</p>}</div>}
   <p className="mt-3 text-xs text-slate-500">Az E.ON jellemzően késéssel szolgáltat adatot. A csúcsok nem feltétlenül a kazántól származnak; a napelemes önfogyasztás ebben a hálózati idősorban nem látható.</p>
  </section>
 </AppShell>;
}
