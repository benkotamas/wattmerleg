"use client";

import { AppShell } from "@/components/app-shell";
import { formatDate, formatHuf, formatKwh } from "@/components/format";
import { PageState } from "@/components/page-state";
import { annualForecast, comparePeriodsAtSameElapsedTime, periodSummary } from "@/lib/calculations";
import { useEnergyData } from "@/lib/data";
import { ArrowDownToLine, ArrowUpFromLine, CircleDollarSign, Scale } from "lucide-react";

const formatComparison = (value: number | null | undefined) => value == null
  ? "Nincs összehasonlítható előző adat"
  : `Előző időszak azonos pontjához képest: ${value > 0 ? "+" : ""}${value.toLocaleString("hu-HU", { maximumFractionDigits: 1 })}%`;

export default function DashboardPage() {
  const { period, periods, readings, readingsForPeriod, tariff, loading, error } = useEnergyData();
  if (loading || error) return <AppShell><PageState loading={loading} error={error}/></AppShell>;
  if (!period) return <AppShell><div className="card p-7"><h1 className="text-2xl font-black">Kezdjük el!</h1><p className="mt-2 text-slate-600">Hozd létre az első nyitott elszámolási időszakot az Excel-importtal, vagy a Supabase SQL Editorban.</p></div></AppShell>;
  const summary = periodSummary(period, readings, tariff);
  const forecast = annualForecast(period, readings, tariff);
  const previous = [...periods].reverse().find(item => item.status === "closed" && item.start_date < period.start_date);
  const comparison = previous ? comparePeriodsAtSameElapsedTime(period, readings, previous, readingsForPeriod(previous.id), tariff) : null;
  const cards = [
    { label: "Összes fogyasztás", value: formatKwh(summary.consumption), note: formatComparison(comparison?.consumptionPercent), icon: ArrowDownToLine, color: "text-orange-600 bg-orange-50" },
    { label: "Összes termelés", value: formatKwh(summary.production), note: formatComparison(comparison?.productionPercent), icon: ArrowUpFromLine, color: "text-emerald-700 bg-emerald-50" },
    { label: "Energiamérleg", value: formatKwh(summary.balance), note: formatComparison(comparison?.balancePercent), icon: Scale, color: "text-blue-700 bg-blue-50" },
    { label: "Becsült összeg", value: formatHuf(summary.estimatedAmount), note: summary.estimatedAmount >= 0 ? "Eddigi várható fizetendő" : "Eddigi várható jóváírás", icon: CircleDollarSign, color: "text-violet-700 bg-violet-50" },
  ];
  return (
    <AppShell>
      <section className="mb-5"><p className="text-sm font-bold text-emerald-700">AKTUÁLIS IDŐSZAK</p><h1 className="mt-1 text-3xl font-black tracking-tight">Energia áttekintés</h1><p className="mt-1 text-sm text-slate-500">{formatDate(period.start_date)} óta · a legutóbbi mérésig {Math.round(forecast.elapsedDays)} nap</p></section>
      <section className="grid gap-3 sm:grid-cols-2">{cards.map(({ label, value, note, icon: Icon, color }) => <article key={label} className="card min-w-0 p-5"><div className="flex items-start justify-between gap-3"><p className="text-sm font-bold text-slate-500">{label}</p><span className={`shrink-0 rounded-xl p-2 ${color}`}><Icon size={20}/></span></div><p className="mt-4 break-words text-3xl font-black tracking-tight tabular-nums">{value}</p><p className="mt-2 text-xs leading-relaxed text-slate-500">{note}</p></article>)}</section>
      <section className="card mt-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs font-bold text-emerald-700">BECSLÉS</p><h2 className="text-xl font-black">Éves előrejelzés</h2></div><p className="text-xs text-slate-500">Legutóbbi mérés: {formatDate(forecast.referenceDate)}</p></div>
        <div className="mt-4"><div className="mb-2 flex justify-between text-xs font-bold"><span>{forecast.progressPercent.toLocaleString("hu-HU", { maximumFractionDigits: 1 })}% eltelt</span><span>{Math.ceil(forecast.remainingDays)} nap van hátra</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-600" style={{ width: `${forecast.progressPercent}%` }}/></div></div>
        <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4"><ForecastValue label="Eltelt napok" value={`${Math.round(forecast.elapsedDays)} nap`}/><ForecastValue label="Zárásig hátra" value={`${Math.ceil(forecast.remainingDays)} nap`}/><ForecastValue label="Eddigi fogyasztás" value={formatKwh(forecast.consumption)}/><ForecastValue label="Várható fogyasztás" value={formatKwh(forecast.projectedAnnualConsumption)}/><ForecastValue label="Eddigi termelés" value={formatKwh(forecast.production)}/><ForecastValue label="Várható termelés" value={formatKwh(forecast.projectedAnnualProduction)}/><ForecastValue label="Várható energiamérleg" value={formatKwh(forecast.projectedBalance)}/><ForecastValue label="Várható becsült összeg" value={formatHuf(forecast.projectedAmount)}/></div>
        <p className="mt-5 rounded-xl bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">Az előrejelzés a legutóbbi tényleges mérésig kialakult napi átlagot vetíti ki a következő zárásig. Tájékoztató becslés, nem számlaadat.</p>
      </section>
    </AppShell>
  );
}

function ForecastValue({ label, value }: { label: string; value: string }) { return <div className="min-w-0"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 break-words font-black tabular-nums">{value}</p></div>; }
