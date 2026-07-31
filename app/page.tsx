"use client";

import { AppShell } from "@/components/app-shell";
import { formatDate, formatHuf, formatKwh } from "@/components/format";
import { PageState } from "@/components/page-state";
import { periodSummary, nextClosingDate } from "@/lib/calculations";
import { useEnergyData } from "@/lib/data";
import { ArrowDownToLine, ArrowUpFromLine, CalendarDays, CircleDollarSign, Scale } from "lucide-react";

export default function DashboardPage() {
  const { period, readings, loading, error } = useEnergyData();
  const state = <PageState loading={loading} error={error} />;
  if (loading || error) return <AppShell>{state}</AppShell>;
  if (!period) return (
    <AppShell><div className="card p-7"><h1 className="text-2xl font-black">Kezdjük el!</h1><p className="mt-2 text-slate-600">Hozd létre az első nyitott elszámolási időszakot az Excel-importtal, vagy a Supabase SQL Editorban.</p></div></AppShell>
  );
  const summary = periodSummary(period, readings);
  const cards = [
    { label: "Összes fogyasztás", value: formatKwh(summary.consumption), note: `${formatKwh(summary.dailyConsumption)} / nap`, icon: ArrowDownToLine, color: "text-orange-600 bg-orange-50" },
    { label: "Összes termelés", value: formatKwh(summary.production), note: `${formatKwh(summary.dailyProduction)} / nap`, icon: ArrowUpFromLine, color: "text-emerald-700 bg-emerald-50" },
    { label: "Energiamérleg", value: formatKwh(summary.balance), note: summary.balance >= 0 ? "Hálózatból vételezett többlet" : "Termelési többlet", icon: Scale, color: "text-blue-700 bg-blue-50" },
    { label: "Becsült összeg", value: formatHuf(summary.estimatedAmount), note: summary.estimatedAmount >= 0 ? "Várható fizetendő" : "Várható jóváírás", icon: CircleDollarSign, color: "text-violet-700 bg-violet-50" },
  ];
  return (
    <AppShell>
      <section className="mb-5">
        <p className="text-sm font-bold text-emerald-700">AKTUÁLIS IDŐSZAK</p>
        <h1 className="mt-1 text-3xl font-black tracking-tight">Energia áttekintés</h1>
        <p className="mt-1 text-sm text-slate-500">{formatDate(period.start_date)} óta · {Math.round(summary.elapsedDays)} nap</p>
      </section>
      <section className="grid gap-3 sm:grid-cols-2">
        {cards.map(({ label, value, note, icon: Icon, color }) => (
          <article key={label} className="card p-5">
            <div className="flex items-start justify-between"><p className="text-sm font-bold text-slate-500">{label}</p><span className={`rounded-xl p-2 ${color}`}><Icon size={20}/></span></div>
            <p className="mt-4 text-3xl font-black tracking-tight">{value}</p><p className="mt-1 text-xs text-slate-500">{note}</p>
          </article>
        ))}
      </section>
      <section className="mt-3 grid gap-3 sm:grid-cols-3">
        <SmallCard label="Várható éves fogyasztás" value={formatKwh(summary.projectedAnnualConsumption)}/>
        <SmallCard label="Várható éves termelés" value={formatKwh(summary.projectedAnnualProduction)}/>
        <SmallCard label="Következő éves zárás" value={formatDate(nextClosingDate())} icon={<CalendarDays size={18}/>}/>
      </section>
      <p className="mt-4 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">A pénzügyi összeg és az éves előrejelzések tájékoztató becslések, nem számlaadatok.</p>
    </AppShell>
  );
}

function SmallCard({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return <article className="card p-4"><p className="flex items-center gap-2 text-xs font-bold text-slate-500">{icon}{label}</p><p className="mt-2 text-lg font-black">{value}</p></article>;
}
