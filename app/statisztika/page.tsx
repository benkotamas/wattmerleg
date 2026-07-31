"use client";

import { AppShell } from "@/components/app-shell";
import { formatKwh } from "@/components/format";
import { PageState } from "@/components/page-state";
import { useEnergyData } from "@/lib/data";
import { monthlyStatistics } from "@/lib/statistics";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export default function StatisticsPage() {
  const { readings, loading, error } = useEnergyData();
  if (loading || error) return <AppShell><PageState loading={loading} error={error}/></AppShell>;
  const stats = monthlyStatistics(readings);
  const yearly = stats.reduce((sum, row) => ({ consumption: sum.consumption + row.consumption, production: sum.production + row.production }), { consumption: 0, production: 0 });
  return (
    <AppShell>
      <h1 className="text-3xl font-black">Statisztika</h1><p className="mt-1 text-sm text-slate-500">A mérési időközök havi, időarányos felosztása</p>
      <div className="mt-5 grid grid-cols-2 gap-3"><div className="card p-4"><p className="text-xs font-bold text-slate-500">Éves fogyasztás</p><p className="mt-2 text-xl font-black">{formatKwh(yearly.consumption)}</p></div><div className="card p-4"><p className="text-xs font-bold text-slate-500">Éves termelés</p><p className="mt-2 text-xl font-black">{formatKwh(yearly.production)}</p></div></div>
      <div className="card mt-3 p-3 sm:p-5"><h2 className="mb-5 font-black">Havi energia (kWh)</h2><div className="h-72 w-full">{stats.length ? <ResponsiveContainer width="100%" height="100%"><BarChart data={stats} margin={{ left: -18, right: 4 }}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="label" fontSize={11}/><YAxis fontSize={11}/><Tooltip formatter={(value) => `${Number(value).toFixed(1)} kWh`}/><Legend/><Bar dataKey="consumption" name="Fogyasztás" fill="#f97316" radius={[5,5,0,0]}/><Bar dataKey="production" name="Termelés" fill="#168447" radius={[5,5,0,0]}/></BarChart></ResponsiveContainer> : <div className="grid h-full place-items-center text-sm text-slate-500">A grafikonhoz legalább két mérés szükséges.</div>}</div></div>
      <div className="mt-3 space-y-2">{[...stats].reverse().map(row => <div key={row.month} className="card flex items-center justify-between p-4"><div><p className="font-black capitalize">{row.label}</p><p className="text-xs text-slate-500">{row.estimated ? "Becsült, időarányos adat" : "Mért adat"}</p></div><div className="text-right text-sm"><p className="text-orange-700">Fogy. {formatKwh(row.consumption)}</p><p className="text-emerald-700">Term. {formatKwh(row.production)}</p><p className="font-bold">Egyenleg {formatKwh(row.balance)}</p></div></div>)}</div>
    </AppShell>
  );
}
