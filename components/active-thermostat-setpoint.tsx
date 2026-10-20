"use client";
import Link from "next/link";
import {useEffect,useState} from "react";
import {createClient} from "@/lib/supabase/client";
import {setpointAt,validateWeekly,type WeeklyProgram} from "@/lib/heating/thermostat-program";
type Version={effective_from:string;weekly_program:WeeklyProgram};
export function ActiveThermostatSetpoint(){
 const [value,setValue]=useState<{temperature:number;date:string}|null>(null);
 const [error,setError]=useState(false);
 useEffect(()=>{let live=true;const run=async()=>{
  const now=new Date();const date=new Intl.DateTimeFormat("sv-SE",{timeZone:"Europe/Budapest",year:"numeric",month:"2-digit",day:"2-digit"}).format(now);
  const time=new Intl.DateTimeFormat("en-GB",{timeZone:"Europe/Budapest",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(now);
  const weekday=(new Date(date+"T12:00:00Z").getUTCDay()+6)%7;
  const {data,error}=await createClient().from("thermostat_program_versions").select("effective_from,weekly_program").lte("effective_from",date).order("effective_from",{ascending:false}).limit(1).maybeSingle();
  if(!live)return;if(error){setError(true);return}
  if(data&&validateWeekly(data.weekly_program)){const current=data as Version;const temperature=setpointAt(current.weekly_program,weekday,time);if(temperature!==null)setValue({temperature,date:current.effective_from})}
 };void run();return()=>{live=false}},[]);
 return <div className="rounded-lg border p-3 text-sm">
  <p className="font-semibold">Heti termosztátprogram</p>
  {value?<p className="mt-1">A mentett program alapján a jelenlegi cél: <strong>{value.temperature.toLocaleString("hu-HU")} °C</strong> (program kezdete: {value.date}).</p>:<p className="mt-1">{error?"A heti program átmenetileg nem érhető el.":"Nincs jelenleg érvényes, mentett heti program."}</p>}
  <p className="mt-1 text-xs text-slate-600">Ez a beállított célhőmérséklet, nem mért beltéri hőmérséklet és nem bizonyítja, hogy a termosztát éppen bekapcsolta a kazánt.</p>
  <Link className="mt-2 inline-block underline" href="/futes/termosztat">Heti termosztátprogram megnyitása</Link>
 </div>
}
