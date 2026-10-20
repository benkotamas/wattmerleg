import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { HeatingNav } from "@/components/heating-nav";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type MeterRow = { interval_start_utc: string; local_date: string; import_kwh: number | string; export_kwh: number | string };
type PvRow = { local_date: string; energy_kwh: number | string; quality_status: string };
type Feature = { local_date:string; estimated_heating_kwh:number | string | null; confidence:string; data_quality_warnings:string[] | null; coverage_percent:number | string | null; provisional:boolean; average_temperature_c:number | string | null };
type Day = { date: string; imported: number; exported: number; solar: number | null; consumption: number | null; count: number; quality: string };
function expectedIntervals(date: string): number {
  const utcMidnight = (localDate: string) => {
    const target = Date.parse(localDate + "T00:00:00Z");
    const offset = new Intl.DateTimeFormat("en-US", { timeZone:"Europe/Budapest", timeZoneName:"shortOffset" })
      .formatToParts(new Date(target)).find(part => part.type === "timeZoneName")?.value ?? "GMT+1";
    const match = offset.match(/GMT([+-])(\\d{1,2})(?::(\\d{2}))?/);
    const minutes = match ? (match[1] === "+" ? 1 : -1) * (Number(match[2])*60 + Number(match[3] ?? 0)) : 60;
    return target - minutes*60000;
  };
  return Math.round((utcMidnight(addDays(date,1)) - utcMidnight(date))/900000);
}
const fmt = (n: number | null) => n === null ? "–" : n.toLocaleString("hu-HU", { maximumFractionDigits: 2 });
const localToday = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Budapest", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
function addDays(date: string, days: number) { const result = new Date(date + "T12:00:00Z"); result.setUTCDate(result.getUTCDate() + days); return result.toISOString().slice(0, 10); }

export default async function CurrentHeatingSeasonPage() {
  const db = await createClient();
  if (!db) return <AppShell><HeatingNav/><p className="card p-5">Az adatkapcsolat nem érhető el.</p></AppShell>;
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/belepes");

  const periods = await db.from("heating_operation_periods").select("enabled_at,disabled_at").eq("user_id",user.id).order("enabled_at",{ascending:false}).limit(10);
  if (periods.error) return <AppShell><HeatingNav/><p className="card p-5">A fűtési időszakok nem tölthetők be.</p></AppShell>;
  const active = (periods.data ?? []).find(period => !period.disabled_at);
  if (!active) return <AppShell><HeatingNav/><h1 className="text-3xl font-black">Aktuális fűtési szezon</h1><p className="card mt-4 p-5">Nincs nyitott fűtési időszak rögzítve.</p></AppShell>;
  const started = new Date(active.enabled_at);
  const startDate = new Intl.DateTimeFormat("sv-SE",{timeZone:"Europe/Budapest",year:"numeric",month:"2-digit",day:"2-digit"}).format(started);
  const yesterday = addDays(localToday(),-1);
  const fromDate = startDate > addDays(yesterday,-179) ? startDate : addDays(yesterday,-179);
  if (fromDate > yesterday) return <AppShell><HeatingNav/><h1 className="text-3xl font-black">Aktuális fűtési szezon</h1><p className="card mt-4 p-5">Az első teljes nap mérései még nem érkeztek meg.</p></AppShell>;

  const meters: MeterRow[] = [];
  let failed = false;
  for (let offset = 0; offset < 20000; offset += 1000) {
    const { data, error } = await db.from("eon_interval_readings").select("interval_start_utc,local_date,import_kwh,export_kwh").eq("user_id",user.id).gte("local_date",fromDate).lte("local_date",yesterday).order("local_date").order("interval_start_utc").range(offset,offset+999);
    if (error) { failed = true; break; }
    meters.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  const pv = await db.from("growatt_daily_energy").select("local_date,energy_kwh,quality_status").eq("user_id",user.id).gte("local_date",fromDate).lte("local_date",yesterday).order("local_date");
  const model = await db.from("heating_analysis_models").select("model_version,period_end,updated_at").eq("user_id",user.id).order("updated_at",{ascending:false}).limit(1).maybeSingle();
  const features = model.data?.model_version
    ? await db.from("heating_energy_daily_features").select("local_date,estimated_heating_kwh,confidence,data_quality_warnings,coverage_percent,provisional,average_temperature_c").eq("user_id",user.id).eq("model_version",model.data.model_version).gte("local_date",fromDate).lte("local_date",yesterday).order("local_date")
    : { data: [] as Feature[], error: null };
  const analysisIsCurrent = !model.error && !!model.data && model.data.period_end >= yesterday;
  const featureMap = new Map<string,Feature>((features.data ?? []).map(row => [row.local_date,row]));
  if (failed || pv.error) return <AppShell><HeatingNav/><p className="card p-5">Nem sikerült lekérni a mérési adatokat.</p></AppShell>;

  const pvByDay = new Map<string,PvRow>((pv.data ?? []).map(row => [row.local_date,row]));
  const byDay = new Map<string,Day>();
  const uniqueIntervals = new Set<string>();
  for (const row of meters) {
    if (uniqueIntervals.has(row.interval_start_utc)) continue;
    uniqueIntervals.add(row.interval_start_utc);
    const day = byDay.get(row.local_date) ?? { date:row.local_date,imported:0,exported:0,solar:null,consumption:null,count:0,quality:"" };
    day.imported += Number(row.import_kwh);
    day.exported += Number(row.export_kwh);
    day.count++;
    byDay.set(row.local_date,day);
  }
  const days = [...byDay.values()].sort((a,b)=>b.date.localeCompare(a.date));
  for (const day of days) {
    const solar = pvByDay.get(day.date);
    if (solar?.quality_status === "complete") day.solar = Number(solar.energy_kwh);
    if (day.count === expectedIntervals(day.date) && day.solar !== null && day.imported + day.solar >= day.exported - 0.00001) {
      day.consumption = Math.max(0, day.imported + day.solar - day.exported);
      day.quality = day.date === startDate ? "Indulási nap (részben fűtés nélkül)" : "Teljes napi adat";
    } else day.quality = day.count !== expectedIntervals(day.date) ? "Hiányos E.ON-adat" : day.solar === null ? "Hiányzó / ideiglenes Growatt-adat" : "Ellentmondásos energiamérleg";
  }
  const completeDays = days.filter(day => day.consumption !== null && day.date !== startDate);
  const average = completeDays.length ? completeDays.reduce((sum,day)=>sum + day.consumption!,0)/completeDays.length : null;
  const startedLocal = new Intl.DateTimeFormat("hu-HU",{dateStyle:"long",timeStyle:"short",timeZone:"Europe/Budapest"}).format(started);
  return <AppShell>
    <HeatingNav/>
    <h1 className="mt-3 text-3xl font-black">Aktuális fűtési szezon</h1>
    <p className="mt-2 text-sm text-slate-600">Kezdete: {startedLocal}. Az adatok legfeljebb az előző napig szerepelnek, mert az E.ON mérései késve érkeznek.</p>
    <section className="mt-5 grid gap-3 sm:grid-cols-3">
      <div className="card p-4"><p className="text-xs text-slate-500">Teljes, összehasonlítható napok</p><p className="mt-2 text-2xl font-black">{completeDays.length}</p></div>
      <div className="card p-4"><p className="text-xs text-slate-500">Átlagos teljes házfogyasztás</p><p className="mt-2 text-2xl font-black">{fmt(average)} kWh/nap</p></div>
      <div className="card p-4"><p className="text-xs text-slate-500">Legutolsó mért nap</p><p className="mt-2 text-2xl font-black">{days[0]?.date ?? "–"}</p></div>
    </section>
    <section className="card mt-4 p-5">
      <h2 className="text-xl font-black">Becsült napi fűtési fogyasztás</h2>
      <p className="mt-2 text-sm text-slate-600">Időjárási és alapfogyasztási adatokból számított becslés. Nem külön mérőóra által mért kazánfogyasztás; a részlegesen fedett napokat nem használjuk biztos következtetésként.</p>
      {features.error && <p className="mt-3 text-sm">A fűtési becslések átmenetileg nem tölthetők be.</p>}
      {!analysisIsCurrent && <p className="mt-3 text-sm text-amber-800">A napi fűtési modell még nem dolgozta fel a legfrissebb lezárt napot. A becslések csak sikeres újraszámítás után jelennek meg.</p>}
      <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead><tr className="border-b"><th className="p-2">Nap</th><th className="p-2">Külső átlag</th><th className="p-2">Becsült fűtés</th><th className="p-2">Megbízhatóság</th></tr></thead><tbody>{days.map(day => {
        const feature=featureMap.get(day.date);
        const usable=analysisIsCurrent && !!feature && day.date!==startDate && day.consumption!==null && !feature.provisional && Number(feature.coverage_percent)>=99 && feature.confidence!=="low" && feature.estimated_heating_kwh!==null;
        return <tr key={day.date} className="border-b border-slate-100"><td className="p-2">{day.date}</td><td className="p-2">{fmt(feature?.average_temperature_c == null ? null : Number(feature.average_temperature_c))} °C</td><td className="p-2">{usable ? fmt(Number(feature!.estimated_heating_kwh)) + " kWh" : "Nincs megbízható becslés"}</td><td className="p-2">{usable ? feature!.confidence==="high" ? "Magas" : "Közepes" : "Alacsony / nem számítható"}</td></tr>;
      })}</tbody></table></div>
      <p className="mt-2 text-xs text-slate-500">A becslések a napi háttérszámítás sikeres lefutása után jelennek meg. A kevés mintán alapuló vagy hiányos napokhoz nem jelenítünk meg félrevezető kWh-értéket.</p>
    </section>
    <section className="card mt-4 p-5">
      <h2 className="text-xl font-black">Napi villamosenergia-mérleg</h2>
      <p className="mt-2 text-sm text-slate-600">Teljes házfogyasztás = hálózati vételezés + napelemes termelés − visszatáplálás. Akkumulátor nélküli rendszerre és azonos elszámolási napra érvényes. A kazán fogyasztása ebből külön mérés nélkül nem állapítható meg pontosan.</p>
      <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[780px] text-left text-sm"><thead><tr className="border-b"><th className="p-2">Dátum</th><th className="p-2">Vételezés (kWh)</th><th className="p-2">Termelés (kWh)</th><th className="p-2">Visszatáplálás (kWh)</th><th className="p-2">Házfogyasztás (kWh)</th><th className="p-2">Adatminőség</th></tr></thead><tbody>{days.map(day=><tr key={day.date} className="border-b border-slate-100"><td className="p-2">{day.date}</td><td className="p-2">{fmt(day.imported)}</td><td className="p-2">{fmt(day.solar)}</td><td className="p-2">{fmt(day.exported)}</td><td className="p-2 font-bold">{fmt(day.consumption)}</td><td className="p-2">{day.quality}</td></tr>)}</tbody></table></div>
      {!days.length && <p className="mt-4">Még nincs mérés ebben az időszakban.</p>}
      <p className="mt-3 text-xs text-slate-500">A kezdő nap teljes napi villamosenergia-mérlege nem azonos a 16:00 utáni fűtési időszak fogyasztásával. A fűtési energia becslése külön, időjárás és alapfogyasztás alapján, megbízhatósági jelzéssel jelenik meg, amikor elérhető. Az oldal legfeljebb az utóbbi 180 napot jeleníti meg.</p>
    </section>
  </AppShell>;
}
