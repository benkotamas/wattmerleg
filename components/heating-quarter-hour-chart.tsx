"use client";
import {useMemo,useState} from "react";
import {ResponsiveContainer,ComposedChart,CartesianGrid,XAxis,YAxis,Tooltip,Legend,Bar,Line} from "recharts";
type Point={at:string;gridKwh:number;targetC:number|null;outsideC:number|null;flowC:number|null};
type Props={points:Point[];date:string};
export function HeatingQuarterHourChart({points,date}:Props){
 const [showGrid,setShowGrid]=useState(true);
 const [showTarget,setShowTarget]=useState(true);
 const [showOutside,setShowOutside]=useState(true);
 const [showFlow,setShowFlow]=useState(true);
 const [markPeaks,setMarkPeaks]=useState(true);
 const enriched=useMemo(()=>{
   // This is a visual anomaly marker for GRID import, not measured boiler operation.
   const night=points.filter(p=>{const h=Number(new Intl.DateTimeFormat("en-GB",{timeZone:"Europe/Budapest",hour:"2-digit",hourCycle:"h23"}).format(new Date(p.at)));return h>=0&&h<5}).map(p=>p.gridKwh).sort((a,b)=>a-b);
   const median=night.length?night[Math.floor(night.length/2)]:0.15;
   const threshold=Math.max(0.75,median+0.65);
   const formatter=new Intl.DateTimeFormat("hu-HU",{timeZone:"Europe/Budapest",hour:"2-digit",minute:"2-digit",hourCycle:"h23"});
   return points.map((p,i)=>({...p,slot:i,time:formatter.format(new Date(p.at)),spike:markPeaks&&p.gridKwh>=threshold?p.gridKwh:null}));
 },[points,markPeaks]);
 if(!points.length)return <p className="mt-3 text-sm text-slate-600">Ehhez a naphoz még nincs E.ON negyedórás mérés.</p>;
 return <section className="mt-5 rounded-xl border p-4">
   <h3 className="text-lg font-bold">Fűtési idővonal – {date}</h3>
   <p className="mt-1 text-sm text-slate-600">Valós E.ON hálózati vételezés, mentett termosztátcél és órás kültéri hőmérséklet. A kazán előremenő célértéke csak a kézzel naplózott időszakokban jelenik meg. A fogyasztási csúcsok nem bizonyítják a kazán bekapcsolását.</p>
   <div className="mt-3 flex flex-wrap gap-4 text-sm">
    {([{label:"Hálózati vételezés",value:showGrid,set:setShowGrid},{label:"Termosztát célérték",value:showTarget,set:setShowTarget},{label:"Kültéri hőmérséklet",value:showOutside,set:setShowOutside},{label:"Kazán előremenő célérték",value:showFlow,set:setShowFlow},{label:"Kiemelt fogyasztási csúcsok",value:markPeaks,set:setMarkPeaks}]).map(v=><label key={v.label} className="flex items-center gap-2"><input type="checkbox" checked={v.value} onChange={e=>v.set(e.target.checked)}/>{v.label}</label>)}
   </div>
   <div className="mt-4 h-[360px] w-full" role="img" aria-label="Negyedórás fogyasztás és hőmérsékletek interaktív grafikonja">
    <ResponsiveContainer width="100%" height="100%">
     <ComposedChart data={enriched} margin={{top:10,right:8,left:0,bottom:10}}>
      <CartesianGrid strokeDasharray="3 3" opacity={0.25}/>
      <XAxis dataKey="time" interval={7} tick={{fontSize:11}}/>
      <YAxis yAxisId="kwh" orientation="left" width={42} tick={{fontSize:11}} label={{value:"kWh / 15 perc",angle:-90,position:"insideLeft",fontSize:11}}/>
      <YAxis yAxisId="temp" orientation="right" width={42} tick={{fontSize:11}} domain={["dataMin - 2","dataMax + 2"]} label={{value:"°C",angle:90,position:"insideRight",fontSize:11}}/>
      <Tooltip labelFormatter={(_,payload)=>payload?.[0]?.payload?.time??""} formatter={(value,name)=>[typeof value==="number"?value.toLocaleString("hu-HU",{maximumFractionDigits:2}):"–",name]}/>
      <Legend/>
      {showGrid&&<Bar name="Hálózati vételezés (kWh)" dataKey="gridKwh" fill="#64748b" yAxisId="kwh" maxBarSize={9}/>}
      {markPeaks&&<Line name="Magas hálózati vételezés" dataKey="spike" yAxisId="kwh" stroke="#ef4444" strokeWidth={0} dot={{r:3,fill:"#ef4444"}} connectNulls={false} legendType="circle"/>}
      {showTarget&&<Line name="Célhőmérséklet (°C)" type="stepAfter" dataKey="targetC" stroke="#2563eb" strokeWidth={2} dot={false} connectNulls={false} yAxisId="temp"/>}
      {showFlow&&<Line name="Előremenő cél (°C)" type="stepAfter" dataKey="flowC" stroke="#a855f7" strokeWidth={2} dot={false} connectNulls={false} yAxisId="temp"/>}
      {showOutside&&<Line name="Kültéri hőmérséklet (°C)" dataKey="outsideC" stroke="#16a34a" strokeWidth={2} dot={false} connectNulls={false} yAxisId="temp"/>}
     </ComposedChart>
    </ResponsiveContainer>
   </div>
   <p className="mt-2 text-xs text-slate-500">A piros jelölés csak szokatlanul nagy hálózati fogyasztást jelez (az éjszakai alaphoz viszonyítva). A napközbeni napelemes önfogyasztás és az egyéb háztartási gépek miatt pontos kazánüzemidő ebből nem számítható. Az időjárási adat órás, a termosztátprogram dátumhoz kötött; a rögzített kézi termosztát-felülírások elsőbbséget kapnak. Az előremenő vonal beállított célértéket, nem mért vízhőmérsékletet mutat.</p>
 </section>;
}
