"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { interpretHeatingRebuildResponse } from "@/lib/heating/rebuild-response";
import { createClient } from "@/lib/supabase/client";

type Model = { baseline_training_days:number; analyzed_days:number; excluded_days:number; learned_night_baseline_kwh:number|null; learned_daily_baseline_kwh:number|null; estimated_heating_kwh:number; confidence:string; detected_season_start:string|null; detected_season_end:string|null; manual_season_start:string|null; manual_season_end:string|null; season_start_difference_days:number|null; season_end_difference_days:number|null; updated_at:string };
type Day = { local_date:string; estimated_heating_kwh:number|null; average_temperature_c:number|null; available_intervals:number; expected_intervals:number; confidence:string; data_quality_warnings:string[] };
type Data = { model:Model|null; days:Day[]; validations:{local_date:string;label:string}[] };

const num = (x:number|null) => x == null ? "nincs adat" : `${x.toLocaleString("hu-HU",{maximumFractionDigits:1})} kWh`;
const level = (x:string) => x === "high" ? "Magas" : x === "medium" ? "Közepes" : "Alacsony";

export function HeatingHistoricalAnalysis() {
  const [data,setData]=useState<Data|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
  const rebuildInFlight=useRef(false);
  const load=useCallback(async()=>{const response=await fetch("/api/heating/analysis",{cache:"no-store",credentials:"same-origin"});if(response.ok)setData(await response.json())},[]);
  useEffect(()=>{void load()},[load]);

  async function rebuild(){
    if(rebuildInFlight.current)return;
    rebuildInFlight.current=true;setBusy(true);setMessage("Historikus időjárás és mérési adatok feldolgozása…");
    try{
      const response=await fetch("/api/heating/analysis/rebuild",{method:"POST",cache:"no-store",credentials:"same-origin"});
      const result=await interpretHeatingRebuildResponse(response);
      setMessage(result.message);
      if(result.success)await load();
    }catch{
      setMessage("Az újraszámítás hálózati hiba miatt nem fejeződött be. Próbáld meg később újra.");
    }finally{
      rebuildInFlight.current=false;setBusy(false);
    }
  }

  async function validate(date:string,label:string){const client=createClient(),{data:{user}}=await client.auth.getUser();if(!user)return;const result=label?await client.from("heating_day_validations").upsert({user_id:user.id,local_date:date,label,note:""},{onConflict:"user_id,local_date"}):await client.from("heating_day_validations").delete().eq("user_id",user.id).eq("local_date",date);setMessage(result.error?result.error.message:label?"A címke mentve; az újraszámításkor lép életbe.":"A kézi címke törölve.");if(!result.error)await load()}

  const model=data?.model,points=(data?.days??[]).filter(x=>x.average_temperature_c!=null&&x.estimated_heating_kwh!=null).slice(0,120),min=Math.min(-15,...points.map(x=>x.average_temperature_c!)),max=Math.max(20,...points.map(x=>x.average_temperature_c!)),maxK=Math.max(1,...points.map(x=>x.estimated_heating_kwh!));
  return <section className="card mt-3 p-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold text-blue-700">E.ON 15 PERCES ADATOK</p><h2 className="text-xl font-black">Historikus fűtéselemzés</h2></div><button className="primary" disabled={busy} onClick={()=>void rebuild()}>{busy?"Újraszámítás…":"Újraszámítás"}</button></div>
    <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm">A fűtési energia becslés, mert az E.ON a teljes ház hálózati forgalmát méri, nem közvetlenül a kazánt. Az első időjárási backfill hosszabb lehet; a későbbi futások újrahasználják a már mentett időjárási adatokat.</p>
    {message&&<p className="mt-3 text-sm">{message}</p>}
    {model?<><div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4"><Metric label="Éjszakai alap" value={num(model.learned_night_baseline_kwh)}/><Metric label="Napi teljes ház alap" value={num(model.learned_daily_baseline_kwh)}/><Metric label="Becsült fűtés" value={num(model.estimated_heating_kwh)}/><Metric label="Megbízhatóság" value={level(model.confidence)}/><Metric label="Felismert szezon" value={`${model.detected_season_start??"nincs"} – ${model.detected_season_end??"nincs"}`}/><Metric label="Kézi szezon" value={`${model.manual_season_start??"nincs"} – ${model.manual_season_end??"nincs"}`}/><Metric label="Baseline-napok" value={String(model.baseline_training_days)}/><Metric label="Elemzett napok" value={String(model.analyzed_days)}/><Metric label="Adatminőség miatt kizárt napok" value={String(model.excluded_days)}/></div><p className="mt-3 text-xs text-slate-500">Utolsó újraszámítás: {new Intl.DateTimeFormat("hu-HU",{dateStyle:"long",timeStyle:"short",timeZone:"Europe/Budapest"}).format(new Date(model.updated_at))} · szezoneltérés: {model.season_start_difference_days??"–"} / {model.season_end_difference_days??"–"} nap</p>{points.length>0&&<><h3 className="mt-4 font-black">Hőmérséklet → becsült fűtési kWh/nap</h3><svg viewBox="0 0 600 220" className="mt-2 w-full rounded-xl bg-slate-50" role="img" aria-label="Hőmérséklet és becsült fűtési energia pontdiagram">{points.map((point,index)=><circle key={`${point.local_date}-${index}`} cx={20+(point.average_temperature_c!-min)/(max-min)*560} cy={200-point.estimated_heating_kwh!/maxK*180} r="4" fill="#047857"><title>{point.local_date}: {point.average_temperature_c} °C, {point.estimated_heating_kwh} kWh</title></circle>)}</svg></>}</>:<p className="mt-4 text-sm text-slate-500">Még nincs újraszámított modell.</p>}
    <h3 className="mt-5 font-black">Napi ellenőrző lista</h3><div className="mt-2 max-h-96 space-y-2 overflow-y-auto">{(data?.days??[]).slice(0,60).map(day=><div key={day.local_date} className="grid gap-2 rounded-xl bg-slate-50 p-3 text-sm sm:grid-cols-[8rem_1fr_auto]"><b>{day.local_date}</b><span>{num(day.estimated_heating_kwh)} · {day.available_intervals}/{day.expected_intervals} · {level(day.confidence)}{day.data_quality_warnings.length?` · ${day.data_quality_warnings.join(", ")}`:""}</span><select aria-label={`${day.local_date} validáció`} className="field py-1" value={data?.validations.find(x=>x.local_date===day.local_date)?.label??""} onChange={event=>void validate(day.local_date,event.target.value)}><option value="">Nincs kézi címke</option><option value="definitely_on">Biztosan ment</option><option value="definitely_off">Biztosan nem ment</option><option value="uncertain">Bizonytalan</option></select></div>)}</div>
  </section>;
}

function Metric({label,value}:{label:string;value:string}){return <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 font-black">{value}</p></div>}
