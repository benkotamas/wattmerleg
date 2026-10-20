import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { HeatingNav } from "@/components/heating-nav";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type MeterRow = { local_date: string; import_kwh: number | string; export_kwh: number | string };
type PvRow = { local_date: string; energy_kwh: number | string; quality_status: string };
type Day = { date: string; imported: number; exported: number; solar: number | null; consumption: number | null; count: number; quality: string };
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
    const { data, error } = await db.from("eon_interval_readings").select("local_date,import_kwh,export_kwh").eq("user_id",user.id).gte("local_date",fromDate).lte("local_date",yesterday).order("local_date").order("interval_start_utc").range(offset,offset+999);
    if (error) { failed = true; break; }
    meters.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  const pv = await db.from("growatt_daily_energy").select("local_date,energy_kwh,quality_status").eq("user_id",user.id).gte("local_date",fromDate).lte("local_date",yesterday).order("local_date");
  if (failed || pv.error) return <AppShell><HeatingNav/><p className="card p-5">Nem sikerült lekérni a mérési adatokat.</p></AppShell>;

  const pvByDay = new Map<string,PvRow>((pv.data ?? []).map(row => [row.local_date,row]));
  const byDay = new Map<string,Day>();
  for (const row of meters) {
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
    if (day.count === 96 && day.solar !== null) {
      day.consumption = Math.max(0, day.imported + day.solar - day.exported);
      day.quality = day.date === startDate ? "Indulási nap (részben fűtés nélkül)" : "Teljes napi adat";
    } else day.quality = day.count !== 96 ? "Hiányos E.ON-adat" : "Hiányzó / ideiglenes Growatt-adat";
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
      <h2 className="text-xl font-black">Napi villamosenergia-mérleg</h2>
      <p className="mt-2 text-sm text-slate-600">Teljes házfogyasztás = hálózati vételezés + napelemes termelés − visszatáplálás. Akkumulátor nélküli rendszerre és azonos elszámolási napra érvényes. A kazán fogyasztása ebből külön mérés nélkül nem állapítható meg pontosan.</p>
      <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[780px] text-left text-sm"><thead><tr className="border-b"><th className="p-2">Dátum</th><th className="p-2">Vételezés (kWh)</th><th className="p-2">Termelés (kWh)</th><th className="p-2">Visszatáplálás (kWh)</th><th className="p-2">Házfogyasztás (kWh)</th><th className="p-2">Adatminőség</th></tr></thead><tbody>{days.map(day=><tr key={day.date} className="border-b border-slate-100"><td className="p-2">{day.date}</td><td className="p-2">{fmt(day.imported)}</td><td className="p-2">{fmt(day.solar)}</td><td className="p-2">{fmt(day.exported)}</td><td className="p-2 font-bold">{fmt(day.consumption)}</td><td className="p-2">{day.quality}</td></tr>)}</tbody></table></div>
      {!days.length && <p className="mt-4">Még nincs mérés ebben az időszakban.</p>}
      <p className="mt-3 text-xs text-slate-500">A kezdő nap teljes napi villamosenergia-mérlege nem azonos a 16:00 utáni fűtési időszak fogyasztásával. A fűtési energia becslését később, időjárás és alapfogyasztás alapján, külön megbízhatósági jelzéssel vezetjük be. Az oldal legfeljebb az utóbbi 180 napot jeleníti meg.</p>
    </section>
  </AppShell>;
}
