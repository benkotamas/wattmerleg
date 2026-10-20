"use client";
import {useCallback,useEffect,useState} from "react";
import {createClient} from "@/lib/supabase/client";
type Event={id:string;effective_local:string;flow_temperature_c:number|string;note:string};
export function BoilerFlowHistory(){
 const [events,setEvents]=useState<Event[]>([]);
 const [date,setDate]=useState("");
 const [temp,setTemp]=useState("43");
 const [note,setNote]=useState("");
 const [message,setMessage]=useState("");
 const [busy,setBusy]=useState(false);
 const load=useCallback(async()=>{
  const {data,error}=await createClient().from("boiler_flow_temperature_history").select("id,effective_local,flow_temperature_c,note").order("effective_local",{ascending:false}).limit(200);
  if(error)setMessage("Nem sikerült betölteni a kazánnaplót: "+error.message);
  else setEvents((data??[]) as Event[]);
 },[]);
 useEffect(()=>{void load()},[load]);
 const save=async()=>{
  const t=Number(temp);
  if(!date||!Number.isFinite(t)||t<20||t>90||t*2!==Math.round(t*2)){setMessage("Adj meg érvényes időpontot és 20–90 °C közötti félfokos hőmérsékletet.");return}
  if(events.some(e=>e.effective_local.slice(0,16)===date)){setMessage("Ehhez az időponthoz már van bejegyzés.");return}
  setBusy(true);setMessage("");
  const db=createClient();const {data:{user}}=await db.auth.getUser();
  if(!user){setMessage("A mentéshez jelentkezz be.");setBusy(false);return}
  const {error}=await db.from("boiler_flow_temperature_history").insert({user_id:user.id,effective_local:date,flow_temperature_c:t,note:note.trim().slice(0,500)});
  setBusy(false);
  if(error){setMessage("Mentési hiba: "+error.message);return}
  setMessage("Kazán előremenő beállítása naplózva.");setDate("");setNote("");await load();
 };
 const remove=async(id:string)=>{
  if(!window.confirm("Törlöd ezt a kazánbeállítási bejegyzést?"))return;
  const {error}=await createClient().from("boiler_flow_temperature_history").delete().eq("id",id);
  if(error){setMessage("Törlési hiba: "+error.message);return}
  setMessage("Bejegyzés törölve.");await load();
 };
 return <section className="card mt-5 p-5">
  <h2 className="text-xl font-black">Kazán előremenő hőmérséklet naplója</h2>
  <p className="mt-2 text-sm text-slate-600">A Bosch kazán beállított előremenő célhőmérséklete, nem a víz mért hőmérséklete. Valós módosítás esetén add meg a pontos budapesti helyi időt; régi időpontokat ne találjunk ki.</p>
  <div className="mt-4 flex flex-wrap items-end gap-3">
   <label className="text-sm">Beállítás kezdete<input type="datetime-local" className="mt-1 block rounded border p-2" value={date} onChange={e=>setDate(e.target.value)}/></label>
   <label className="text-sm">Előremenő cél (°C)<input type="number" min={20} max={90} step={0.5} className="mt-1 block w-24 rounded border p-2" value={temp} onChange={e=>setTemp(e.target.value)}/></label>
   <label className="text-sm">Megjegyzés<input type="text" maxLength={500} className="mt-1 block rounded border p-2" value={note} onChange={e=>setNote(e.target.value)} placeholder="Pl. fűtési teszt"/></label>
   <button type="button" disabled={busy} onClick={()=>void save()} className="rounded bg-slate-900 px-4 py-2 font-semibold text-white disabled:opacity-50">{busy?"Mentés…":"Kazánbeállítás mentése"}</button>
  </div>
  {message&&<p role="status" className="mt-3 text-sm">{message}</p>}
  <div className="mt-4 space-y-2">{events.length===0?<p className="text-sm text-slate-500">Még nincs naplóbejegyzés.</p>:events.map(e=><div key={e.id} className="flex flex-wrap items-center justify-between gap-2 rounded border p-3 text-sm"><span>{e.effective_local.slice(0,16).replace("T"," ")} — {Number(e.flow_temperature_c).toLocaleString("hu-HU")} °C{e.note?" · "+e.note:""}</span><button type="button" onClick={()=>void remove(e.id)} className="underline">Törlés</button></div>)}</div>
 </section>;
}
