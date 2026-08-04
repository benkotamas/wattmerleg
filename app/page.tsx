"use client";

import { AppShell } from "@/components/app-shell";
import { ConfidenceExplanation } from "@/components/confidence-explanation";
import { formatDate, formatHuf, formatKwh } from "@/components/format";
import { PageState } from "@/components/page-state";
import { KpiCard, PageHeader, StatusPanel } from "@/components/ui";
import Link from "next/link";
import { annualForecast, comparePeriodsAtSameElapsedTime, periodSummary } from "@/lib/calculations";
import { useEnergyData } from "@/lib/data";
import { seasonalAnnualForecast, type ForecastConfidence } from "@/lib/seasonal-forecast";
import { ArrowDownToLine, ArrowUpFromLine, CircleDollarSign, Scale } from "lucide-react";
import { SolarProductionCard } from "@/components/growatt/solar-production-card";
import { EonPeriodOverviewCard } from "@/components/eon/period-overview-card";

const formatComparison = (value: number | null | undefined) => value == null
  ? "Nincs összehasonlítható előző adat"
  : `Előző időszak azonos pontjához képest: ${value > 0 ? "+" : ""}${value.toLocaleString("hu-HU", { maximumFractionDigits: 1 })}%`;

export default function DashboardPage() {
  const { period, periods, readings, allReadings, readingsForPeriod, tariff, loading, error } = useEnergyData();
  if (loading || error) return <AppShell><PageState loading={loading} error={error}/></AppShell>;
  if (!period) return <AppShell><div className="card p-7"><h1 className="text-2xl font-black">Kezdjük el!</h1><p className="mt-2 text-slate-600">Hozd létre az első nyitott elszámolási időszakot az Excel-importtal, vagy a Supabase SQL Editorban.</p></div></AppShell>;
  const summary = periodSummary(period, readings, tariff);
  const forecast = annualForecast(period, readings, tariff);
  const seasonal = seasonalAnnualForecast(period, readings, allReadings, tariff);
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
      <PageHeader eyebrow="Aktuális időszak" title="Energia áttekintés" description={`${formatDate(period.start_date)} óta · a legutóbbi mérésig ${Math.round(forecast.elapsedDays)} nap`} actions={<><Link href="/uj-meres" className="primary">Új mérés</Link><Link href="/statisztika" className="secondary">Statisztika</Link></>}/>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{cards.map(({ label, value, note, icon: Icon },index) => <KpiCard key={label} label={label} value={value} note={note} accent={(["orange","green","blue","neutral"] as const)[index]} icon={<Icon size={20}/>}/>)}</section>
      <EonPeriodOverviewCard/>
      <SolarProductionCard/>
      <div className="mt-2 text-right"><Link href="/statisztika?view=solar" className="text-sm font-bold text-emerald-700 hover:underline">Részletes napelemes statisztika</Link></div>
      <section className="card mt-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs font-bold text-emerald-700">BECSLÉS</p><h2 className="text-xl font-black">Éves előrejelzés</h2></div><p className="text-xs text-slate-500">Legutóbbi mérés: {formatDate(forecast.referenceDate)}</p></div>
        <div className="mt-4"><div className="mb-2 flex justify-between text-xs font-bold"><span>{forecast.progressPercent.toLocaleString("hu-HU", { maximumFractionDigits: 1 })}% eltelt</span><span>{Math.ceil(forecast.remainingDays)} nap van hátra</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-600" style={{ width: `${forecast.progressPercent}%` }}/></div></div>
        <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4"><ForecastValue label="Eltelt napok" value={`${Math.round(forecast.elapsedDays)} nap`}/><ForecastValue label="Zárásig hátra" value={`${Math.ceil(forecast.remainingDays)} nap`}/><ForecastValue label="Eddigi fogyasztás" value={formatKwh(forecast.consumption)}/><ForecastValue label="Eddigi termelés" value={formatKwh(forecast.production)}/></div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <article className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><p className="text-xs font-bold text-slate-500">LINEÁRIS BECSLÉS</p><p className="mt-2 break-words text-2xl font-black tabular-nums">{formatKwh(forecast.projectedAnnualConsumption)}</p><p className="mt-1 text-xs text-slate-500">A jelenlegi időszak napi átlagából számolva.</p></article>
          <article className={`rounded-2xl border p-4 ${seasonal.confidence === "low" ? "border-amber-200 bg-amber-50" : "border-emerald-300 bg-emerald-50"}`}><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-bold text-emerald-800">SZEZONÁLIS BECSLÉS</p><Confidence value={seasonal.confidence}/></div><p className="mt-2 break-words text-2xl font-black tabular-nums">{formatKwh(seasonal.consumption)}</p><p className="mt-1 text-xs text-slate-600">Korábbi évek fogyasztási mintája alapján.</p></article>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4"><ForecastValue label="Szezonális termelés" value={seasonal.productionReliable ? formatKwh(seasonal.production) : `${formatKwh(seasonal.production)}*`}/><ForecastValue label="Szezonális energiamérleg" value={formatKwh(seasonal.balance)}/><ForecastValue label="Becsült összeg" value={formatHuf(seasonal.estimatedAmount)}/><ForecastValue label="Historikus évek" value={`${seasonal.historicalYears} év`}/></div>
        {!seasonal.productionReliable && <p className="mt-3 text-xs text-amber-800">* A termelési becslés egyes hónapokban kevés historikus adat miatt bizonytalan.</p>}
        <details className="mt-5 rounded-2xl border border-slate-200 bg-white p-4"><summary className="cursor-pointer font-black">Havi szezonális előrejelzés</summary><div className="mt-3 space-y-2">{seasonal.months.map(month => <div key={month.month} className="rounded-xl bg-slate-50 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-bold capitalize">{month.label}</p><Confidence value={month.confidence}/></div><div className="mt-2 grid grid-cols-2 gap-2 text-xs"><span>Fogyasztás</span><b className="text-right">{formatKwh((month.actualConsumption ?? 0) + (month.expectedConsumption ?? 0))} · {month.expectedConsumption === null ? "tényleges" : month.actualConsumption ? "tényleges + becsült" : "becsült"}</b><span>Termelés</span><b className="text-right">{formatKwh((month.actualProduction ?? 0) + (month.expectedProduction ?? 0))}{!month.productionReliable ? " · bizonytalan" : ""}</b><span>Energiamérleg</span><b className="text-right">{formatKwh(month.expectedBalance)}</b></div></div>)}</div></details>
        <StatusPanel tone="warning" className="mt-5">Az előrejelzés a legutóbbi tényleges mérésig kialakult napi átlagot vetíti ki a következő zárásig. Tájékoztató becslés, nem számlaadat.</StatusPanel>
      </section>
    </AppShell>
  );
}

function ForecastValue({ label, value }: { label: string; value: string }) { return <div className="min-w-0"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 break-words font-black tabular-nums">{value}</p></div>; }
function Confidence({ value }: { value: ForecastConfidence }) { return <ConfidenceExplanation level={value} context="forecast" compact/>; }
