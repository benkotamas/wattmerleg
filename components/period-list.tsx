import { periodSummary } from "@/lib/calculations";
import { formatDate, formatHuf, formatKwh } from "@/components/format";
import type { MeterReading, SettlementPeriod, TariffSettings } from "@/lib/types";

export function PeriodList({ periods, readings, tariff, collapsible = false }: { periods: SettlementPeriod[]; readings: MeterReading[]; tariff: TariffSettings; collapsible?: boolean }) {
  const content = <div className="mt-3 space-y-3">
    {[...periods].reverse().map(period => {
      const summary = periodSummary(period, readings.filter(reading => reading.settlement_period_id === period.id), tariff);
      return <article key={period.id} className="rounded-xl border border-slate-200 p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="break-words font-black">{formatDate(period.start_date)} – {period.end_date ? formatDate(period.end_date) : "jelenleg"}</p>
          <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${period.status === "open" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>{period.status === "open" ? "Aktuális, nyitott" : "Lezárt"}</span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4"><Value label="Fogyasztás" value={formatKwh(summary.consumption)}/><Value label="Termelés" value={formatKwh(summary.production)}/><Value label="Energiamérleg" value={formatKwh(summary.balance)}/><Value label="Becsült összeg" value={formatHuf(summary.estimatedAmount)}/></div>
        <details className="mt-3 rounded-xl bg-slate-50 p-3 text-sm"><summary className="cursor-pointer font-bold">Díjszámítás részletei</summary><div className="mt-2 grid grid-cols-2 gap-2"><span>Kedvezményes mennyiség és díj</span><b className="text-right">{formatKwh(summary.amountBreakdown.discountedQuantityKwh)} · {formatHuf(summary.amountBreakdown.discountedFeeFt)}</b><span>Piaci mennyiség és díj</span><b className="text-right">{formatKwh(summary.amountBreakdown.marketQuantityKwh)} · {formatHuf(summary.amountBreakdown.marketFeeFt)}</b><span>Alapdíj</span><b className="text-right">{formatHuf(summary.amountBreakdown.baseFeeFt)}</b><span>Teljes becsült összeg</span><b className="text-right">{formatHuf(summary.amountBreakdown.totalFt)}</b></div></details>
      </article>;
    })}
  </div>;
  if (collapsible) return <section className="card mt-5 p-4 sm:p-5"><h2 className="text-xl font-black">Elszámolási időszakok</h2><p className="mt-1 text-sm text-slate-500">{periods.length} időszak, ebből {periods.filter(period => period.status === "closed").length} lezárt.</p><details className="mt-3"><summary className="w-full cursor-pointer rounded-xl bg-slate-50 p-3 font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600">Korábbi időszakok megjelenítése</summary>{content}</details></section>;
  return (
    <section className="mt-6">
      <h2 className="text-xl font-black">Korábbi elszámolási időszakok</h2>
      {content}
    </section>
  );
}

function Value({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 break-words font-bold tabular-nums">{value}</p></div>;
}
