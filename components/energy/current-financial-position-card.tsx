"use client";

import { useEffect, useState } from "react";
import { formatHuf, formatKwh } from "@/components/format";
import type { CurrentFinancialPosition, FinancialConfidence } from "@/lib/energy/current-financial-position";

const warningText: Record<string, string> = {
  PROVISIONAL_CURRENT_DAY: "A mai nap még nem teljes; az eddigi intervallumok már szerepelnek az összegben.",
  INCOMPLETE_CLOSED_DAYS: "Egy vagy több lezárt nap E.ON-adatsora hiányos, ezért az összeg a ténylegesnél alacsonyabb lehet.",
  STALE_DATA: "Az utolsó E.ON-adat elavult; ellenőrizd az adatok időpontját.",
  DATE_ONLY_BOUNDARY: "Az elszámolási időszak nyitóhatára csak naptári nap pontosságú.",
  FALLBACK_TARIFF: "Az adatbázis-tarifa nem volt elérhető; a számítás biztonsági alapértékekkel készült.",
  DST_FALLBACK_SOURCE_96: "Az E.ON az őszi óraátállítás napján 96 intervallumot adott a várt 100 helyett.",
};
const confidenceLabel: Record<FinancialConfidence, string> = { high: "Magas", medium: "Közepes", low: "Alacsony" };
const confidenceText: Record<FinancialConfidence, string> = {
  high: "A lezárt napok E.ON-lefedettsége teljes vagy gyakorlatilag teljes, az adat friss.",
  medium: "Az összesítés használható, de kisebb adathiány, elavultság vagy fallback tarifa csökkenti a bizonyosságot.",
  low: "Lényeges lefedettségi vagy időszakhatár-bizonytalanság miatt az eredményt fenntartással kezeld.",
};

export function formatGridEnergy(value: number) {
  return Math.abs(value) >= 1000
    ? `${new Intl.NumberFormat("hu-HU", { maximumFractionDigits: 2 }).format(value / 1000)} MWh`
    : formatKwh(value);
}

const cutoff = (value: string) => new Intl.DateTimeFormat("hu-HU", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Budapest" }).format(new Date(value));

export function CurrentFinancialPositionCard() {
  const [position, setPosition] = useState<CurrentFinancialPosition | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch("/api/energy/current-position", { credentials: "same-origin", cache: "no-store" });
        const body = await response.json();
        if (!response.ok) throw new Error("Az E.ON pénzügyi helyzet most nem tölthető be.");
        if (active) setPosition(body.position ?? null);
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : "Az E.ON pénzügyi helyzet most nem tölthető be.");
      } finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, []);

  return <section id="current-financial-position" className="card mb-4 border-2 border-emerald-200 bg-emerald-50/40 p-5 scroll-mt-20">
    <p className="text-xs font-black uppercase tracking-wider text-emerald-700">E.ON 15 perces hálózati adatok alapján</p>
    <h2 className="mt-1 text-xl font-black">Aktuális pénzügyi helyzet</h2>
    {loading ? <p className="mt-4 text-sm text-slate-500">Betöltés…</p> : error ? <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p> : !position ? <p className="mt-4 text-sm text-slate-600">Még nincs E.ON-adat az aktuális elszámolási időszakhoz.</p> : <Position position={position}/>}
  </section>;
}

function Position({ position }: { position: CurrentFinancialPosition }) {
  const amountLabel = position.financialDirection === "credit" ? "Várható jóváírás" : position.financialDirection === "balanced" ? "Becsült egyenleg" : "Becsült fizetendő";
  return <>
    <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label="Hálózatból vételezett" value={formatGridEnergy(position.gridImportKwh)}/>
      <Metric label="Hálózatba betáplált" value={formatGridEnergy(position.gridExportKwh)}/>
      <Metric label="Nettó hálózati egyenleg" value={formatGridEnergy(position.netGridKwh)}/>
      <div className="rounded-2xl bg-emerald-700 p-4 text-white"><p className="text-xs font-bold text-emerald-100">{amountLabel}</p><p className="mt-2 break-words text-2xl font-black tabular-nums">{formatHuf(position.estimatedAmountFt)}</p></div>
    </div>
    <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
      <p><b>Adatok eddig:</b> {cutoff(position.cutoffAt)}</p>
      <p><b>Lefedettség:</b> {position.closedDayCoveragePercent.toLocaleString("hu-HU", { maximumFractionDigits: 1 })}%</p>
      <p><b>Teljes / részleges / hiányos nap:</b> {position.completeDays} / {position.provisionalDays} / {position.incompleteDays}</p>
      <p><b>Tarifaforrás:</b> {position.tariffSource === "database" ? "adatbázis-beállítás" : "biztonsági alapérték"}</p>
    </div>
    <div className="mt-4 rounded-xl bg-white/80 p-3 text-sm"><p className="font-black">{confidenceLabel[position.confidence]} megbízhatóság</p><p className="mt-1 text-slate-600">{confidenceText[position.confidence]}</p></div>
    {position.warnings.map(code => warningText[code] ? <p key={code} className="mt-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{warningText[code]}</p> : null)}
    <p className="mt-4 text-xs text-slate-500">Tájékoztató becslés, nem szolgáltatói számla. A számítás kizárólag az E.ON hálózati vételezését és betáplálását használja.</p>
  </>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl border border-emerald-100 bg-white p-4"><p className="text-xs font-bold text-slate-500">{label}</p><p className="mt-2 break-words text-xl font-black tabular-nums">{value}</p></div>; }
