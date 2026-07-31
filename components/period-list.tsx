import { estimateAmount, periodSummary } from "@/lib/calculations";
import { formatDate, formatHuf, formatKwh } from "@/components/format";
import type { MeterReading, SettlementPeriod, TariffSettings } from "@/lib/types";

export function PeriodList({ periods, readings, tariff }: { periods: SettlementPeriod[]; readings: MeterReading[]; tariff: TariffSettings }) {
  return (
    <section className="mt-6">
      <h2 className="text-xl font-black">Korábbi elszámolási időszakok</h2>
      <div className="mt-3 space-y-3">
        {[...periods].reverse().map(period => {
          const summary = periodSummary(period, readings.filter(reading => reading.settlement_period_id === period.id), tariff);
          return <article key={period.id} className="card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-black">{formatDate(period.start_date)} – {period.end_date ? formatDate(period.end_date) : "jelenleg"}</p>
              <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${period.status === "open" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>{period.status === "open" ? "Aktuális, nyitott" : "Lezárt"}</span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <Value label="Fogyasztás" value={formatKwh(summary.consumption)}/>
              <Value label="Termelés" value={formatKwh(summary.production)}/>
              <Value label="Energiamérleg" value={formatKwh(summary.balance)}/>
              <Value label="Becsült összeg" value={formatHuf(estimateAmount(summary.balance, tariff))}/>
            </div>
          </article>;
        })}
      </div>
    </section>
  );
}

function Value({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 break-words font-bold tabular-nums">{value}</p></div>;
}
