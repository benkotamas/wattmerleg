"use client";

import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { formatKwh } from "@/components/format";
import { PageState } from "@/components/page-state";
import { PeriodList } from "@/components/period-list";
import { useEnergyData } from "@/lib/data";
import { monthlyStatistics } from "@/lib/statistics";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type ChartView = "combined" | "consumption" | "production" | "balance";
const views: { id: ChartView; label: string }[] = [
  { id: "combined", label: "Fogyasztás + termelés" }, { id: "consumption", label: "Fogyasztás" },
  { id: "production", label: "Termelés" }, { id: "balance", label: "Egyenleg" },
];

export default function StatisticsPage() {
  const { readings, allReadings, periods, tariff, loading, error } = useEnergyData();
  const [view, setView] = useState<ChartView>("combined");
  if (loading || error) return <AppShell><PageState loading={loading} error={error}/></AppShell>;
  const stats = monthlyStatistics(readings);
  const yearly = stats.reduce((sum, row) => ({ consumption: sum.consumption + row.consumption, production: sum.production + row.production }), { consumption: 0, production: 0 });
  return (
    <AppShell>
      <h1 className="text-3xl font-black">Statisztika</h1><p className="mt-1 text-sm text-slate-500">A mérési időközök havi, időarányos felosztása</p>
      <div className="mt-5 grid grid-cols-2 gap-3"><StatCard label="Időszaki fogyasztás" value={formatKwh(yearly.consumption)}/><StatCard label="Időszaki termelés" value={formatKwh(yearly.production)}/></div>
      <section className="card mt-3 overflow-hidden p-3 sm:p-5">
        <h2 className="font-black">Havi energia (kWh)</h2>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-2">
          {views.map(item => <button key={item.id} onClick={() => setView(item.id)} className={`shrink-0 rounded-full px-3 py-2 text-xs font-bold ${view === item.id ? "bg-emerald-700 text-white" : "bg-slate-100 text-slate-600"}`}>{item.label}</button>)}
        </div>
        <div className="mt-2 h-72 min-w-0 w-full">{stats.length ? <ResponsiveContainer width="100%" height="100%"><BarChart data={stats} margin={{ left: -24, right: 0, bottom: 4 }}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="shortLabel" fontSize={10} interval="preserveStartEnd" minTickGap={22}/><YAxis fontSize={10} width={48}/><Tooltip formatter={(value) => `${Number(value).toFixed(1)} kWh`} labelFormatter={(_, payload) => payload[0]?.payload.label ?? ""}/>{view === "combined" && <Legend/>}{(view === "combined" || view === "consumption") && <Bar dataKey="consumption" name="Fogyasztás" fill="#f97316" radius={[5,5,0,0]}/>} {(view === "combined" || view === "production") && <Bar dataKey="production" name="Termelés" fill="#168447" radius={[5,5,0,0]}/>} {view === "balance" && <Bar dataKey="balance" name="Egyenleg" fill="#2563eb" radius={[5,5,0,0]}/>}</BarChart></ResponsiveContainer> : <div className="grid h-full place-items-center text-sm text-slate-500">A grafikonhoz legalább két mérés szükséges.</div>}</div>
      </section>
      <div className="mt-3 space-y-2">{[...stats].reverse().map(row => <article key={row.month} className="card p-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-black capitalize">{row.label}</p>{row.estimated && <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-bold text-amber-800">Becsült, időarányos</span>}</div><div className="mt-3 grid grid-cols-3 gap-2 text-sm"><Value label="Fogyasztás" value={formatKwh(row.consumption)} color="text-orange-700"/><Value label="Termelés" value={formatKwh(row.production)} color="text-emerald-700"/><Value label="Egyenleg" value={formatKwh(row.balance)} color="text-blue-700"/></div></article>)}</div>
      <PeriodList periods={periods} readings={allReadings} tariff={tariff}/>
    </AppShell>
  );
}

function StatCard({ label, value }: { label: string; value: string }) { return <div className="card min-w-0 p-4"><p className="text-xs font-bold text-slate-500">{label}</p><p className="mt-2 break-words text-xl font-black tabular-nums">{value}</p></div>; }
function Value({ label, value, color }: { label: string; value: string; color: string }) { return <div className="min-w-0"><p className="text-[11px] text-slate-500">{label}</p><p className={`mt-1 break-words font-bold tabular-nums ${color}`}>{value}</p></div>; }
