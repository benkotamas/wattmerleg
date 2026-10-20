import {redirect} from "next/navigation";
import {AppShell} from "@/components/app-shell";
import {HeatingNav} from "@/components/heating-nav";
import {createClient} from "@/lib/supabase/server";

export const dynamic="force-dynamic";
type Day={local_date:string;total_home_consumption_kwh:number|string|null;estimated_heating_kwh:number|string|null;average_temperature_c:number|string|null;confidence:string;operation_state:string;coverage_percent:number|string|null;provisional:boolean;data_quality_warnings:string[]|null};
type Flow={effective_local:string;flow_temperature_c:number|string;note:string};
const fmt=(n:number|null,digits=1)=>n===null?"–":n.toLocaleString("hu-HU",{minimumFractionDigits:digits,maximumFractionDigits:digits});
function dailyFlow(date:string,flows:Flow[]):string {
 const start=date+"T00:00";
 const end=date+"T23:59";
 const prior=flows.filter(f=>f.effective_local.slice(0,16)<=start).at(-1);
 const during=flows.filter(f=>f.effective_local.slice(0,16)>start&&f.effective_local.slice(0,16)<=end);
 if(!prior || during.length || flows.some(f=>f.effective_local.slice(0,10)===date))return "Nem teljes napra igazolt";
 return fmt(Number(prior.flow_temperature_c))+" °C (napló alapján)";
}
export default async function HeatingDayComparisonPage(){
 const db=await createClient();
 if(!db)return <AppShell><HeatingNav/><p className="card p-5">Az adatkapcsolat nem érhető el.</p></AppShell>;
 const {data:{user}}=await db.auth.getUser();
 if(!user)redirect("/belepes");
 const model=await db.from("heating_analysis_models").select("model_version,period_end").eq("user_id",user.id).order("updated_at",{ascending:false}).limit(1).maybeSingle();
 const [measure,flow]=await Promise.all([
  model.data?.model_version?db.from("heating_energy_daily_features").select("local_date,total_home_consumption_kwh,estimated_heating_kwh,average_temperature_c,confidence,operation_state,coverage_percent,provisional,data_quality_warnings").eq("user_id",user.id).eq("model_version",model.data.model_version).gte("local_date","2026-10-16").order("local_date",{ascending:false}).limit(180):Promise.resolve({data:[] as Day[],error:null}),
  db.from("boiler_flow_temperature_history").select("effective_local,flow_temperature_c,note").eq("user_id",user.id).order("effective_local",{ascending:true}).limit(500)
 ]);
 const days=(measure.data??[]) as Day[];
 const flows=(flow.data??[]) as Flow[];
 const complete=days.filter(d=>d.operation_state==="available"&&!d.provisional&&d.estimated_heating_kwh!==null&&d.total_home_consumption_kwh!==null&&d.average_temperature_c!==null&&d.confidence!=="low"&&!((d.data_quality_warnings??[]).length));
 const matchedPairs=complete.flatMap((a,i)=>complete.slice(i+1).filter(b=>Math.abs(Number(a.average_temperature_c)-Number(b.average_temperature_c))<=1.5).map(b=>({a,b,temperatureDifference:Math.abs(Number(a.average_temperature_c)-Number(b.average_temperature_c)),energyDifference:Number(a.estimated_heating_kwh)-Number(b.estimated_heating_kwh)}))).sort((x,y)=>x.temperatureDifference-y.temperatureDifference).slice(0,20);
 const avg=complete.length?complete.reduce((s,d)=>s+Number(d.estimated_heating_kwh),0)/complete.length:null;
 return <AppShell><HeatingNav/>
  <h1 className="mt-4 text-3xl font-black">Fűtési napok összehasonlítása</h1>
  <p className="mt-2 text-sm text-slate-600">A teljes ház fogyasztása mért E.ON- és Growatt-adatokból számított energiamérleg. A fűtés részesedése modellbecslés, nem külön kazánmérés. A kazán előremenő értéke felhasználói napló, nem szenzoradat.</p>
  <div className="mt-5 grid gap-3 sm:grid-cols-3">
   <div className="card p-4"><div className="text-xs text-slate-500">Összehasonlítható fűtési nap</div><div className="mt-2 text-2xl font-black">{complete.length}</div></div>
   <div className="card p-4"><div className="text-xs text-slate-500">Átlagos becsült fűtési energia</div><div className="mt-2 text-2xl font-black">{fmt(avg,2)} kWh/nap</div></div>
   <div className="card p-4"><div className="text-xs text-slate-500">Legutóbbi elemzett nap</div><div className="mt-2 text-2xl font-black">{days[0]?.local_date??"–"}</div></div>
  </div>
  {(measure.error||model.error||flow.error)&&<p className="mt-4 text-sm text-red-700">Egyes adatok nem tölthetők be. Az eredmények hiányosak lehetnek.</p>}
  <section className="card mt-5 p-5">
   <h2 className="text-xl font-black">Napi összehasonlító tábla</h2>
   <p className="mt-2 text-sm text-slate-600">A teljes napra nem igazolt előremenő beállításokat nem rendeljük automatikusan korábbi napokhoz. A kezdőnap és a hiányos napok nem kerülnek az átlagba.</p>
   <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[850px] text-sm text-left"><thead><tr className="border-b"><th className="p-2">Nap</th><th className="p-2">Külső átlag</th><th className="p-2">Ház (kWh)</th><th className="p-2">Becsült fűtés (kWh)</th><th className="p-2">Előremenő</th><th className="p-2">Megbízhatóság</th><th className="p-2">Értékelés</th></tr></thead><tbody>
    {days.map(d=>{const accepted=complete.includes(d);return <tr key={d.local_date} className="border-b border-slate-100"><td className="p-2 font-semibold">{d.local_date}</td><td className="p-2">{fmt(d.average_temperature_c===null?null:Number(d.average_temperature_c))} °C</td><td className="p-2">{fmt(d.total_home_consumption_kwh===null?null:Number(d.total_home_consumption_kwh),2)}</td><td className="p-2">{fmt(d.estimated_heating_kwh===null?null:Number(d.estimated_heating_kwh),2)}</td><td className="p-2">{dailyFlow(d.local_date,flows)}</td><td className="p-2">{d.confidence==="high"?"Magas":d.confidence==="medium"?"Közepes":"Alacsony"}</td><td className="p-2">{accepted?"Összehasonlítható":"Kizárt / részleges"}</td></tr>})}
    {days.length===0&&<tr><td colSpan={7} className="p-4">Még nincs feldolgozott fűtési nap.</td></tr>}
   </tbody></table></div>
  </section>
  <section className="card mt-4 p-5"><h2 className="text-xl font-black">Hasonló külső hőmérsékletű napok</h2>
   <p className="mt-2 text-sm text-slate-600">Legfeljebb 1,5 °C eltérésű napi kültéri átlagok párosítása. A becsült fűtési energiák eltérése tájékoztató adat; nem igazolt kazánhatásfok vagy megtakarítás. A termosztátprogram, szél, napsütés és egyéb használat különbözhet.</p>
   {matchedPairs.length===0?<p className="mt-3 text-sm text-slate-600">Még nincs két olyan megfelelő minőségű nap, amelyek külső átlaghőmérséklete legfeljebb 1,5 °C-kal tér el.</p>:<div className="mt-4 overflow-x-auto"><table className="w-full min-w-[640px] text-left text-sm"><thead><tr className="border-b"><th className="p-2">Első nap</th><th className="p-2">Második nap</th><th className="p-2">Külső különbség</th><th className="p-2">Becsült fűtéseltérés</th><th className="p-2">Kazánbeállítás</th></tr></thead><tbody>{matchedPairs.map(({a,b,temperatureDifference,energyDifference})=><tr key={a.local_date+"-"+b.local_date} className="border-b border-slate-100"><td className="p-2">{a.local_date}</td><td className="p-2">{b.local_date}</td><td className="p-2">{fmt(temperatureDifference,2)} °C</td><td className="p-2">{fmt(energyDifference,2)} kWh (első − második)</td><td className="p-2">{dailyFlow(a.local_date,flows)} / {dailyFlow(b.local_date,flows)}</td></tr>)}</tbody></table></div>}
  </section>
  <section className="card mt-4 p-5"><h2 className="text-xl font-black">Hogyan értelmezzük az eredményeket?</h2>
   <p className="mt-2 text-sm text-slate-600">A külső napi átlaghőmérséklet önmagában nem tesz két napot teljesen összehasonlíthatóvá. A napsütés, szél, lakáshasználat, a termosztátprogram és a napelemes önfogyasztás is számít. Különböző előremenő hőmérsékletek hatékonyságáról csak több, hasonló körülmények között mért nap alapján vonunk le következtetést.</p>
   <p className="mt-2 text-sm text-slate-600">Az új mérési napok az aktuális fűtési modell frissítése után jelennek meg. A pontos beállításváltásokat a <a href="/futes/termosztat" className="underline">termosztát és kazán naplójában</a> rögzítheted.</p>
  </section>
 </AppShell>;
}
