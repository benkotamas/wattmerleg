"use client";

import React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw, Sun } from "lucide-react";
import type { GrowattUiData, GrowattUiError } from "@/lib/growatt/ui";
import { fetchGrowattUiData, formatGrowattEnergy, formatGrowattMeasuredAt, formatGrowattPower, formatGrowattRelativeTime, freshnessLabel, growattCapabilityLabels, growattDeviceStatusDisplay, growattDeviceTypeLabel, growattErrorMessage, growattFreshness, loadGrowattSessionSnapshot } from "@/lib/growatt/ui";

export function SolarProductionCard({ diagnostic = false }: { diagnostic?: boolean }) {
  const [data, setData] = useState<GrowattUiData | null>(() => loadGrowattSessionSnapshot());
  const [error, setError] = useState<GrowattUiError | null>(null);
  const [loading, setLoading] = useState(true);
  const running = useRef<Promise<void> | null>(null);
  const refresh = useCallback((force = false) => {
    if (running.current) return running.current;
    setError(null); setLoading(true);
    const request = fetchGrowattUiData(fetch, { force }).then(setData).catch(value => setError(normalizeError(value))).finally(() => { setLoading(false); running.current = null; });
    running.current = request; return request;
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  return <SolarProductionCardView diagnostic={diagnostic} data={data} error={error} loading={loading} onRefresh={() => void refresh(true)}/>;
}

function normalizeError(value: unknown): GrowattUiError { if (typeof value === "object" && value !== null && "status" in value && "code" in value) return value as GrowattUiError; return { status: 503, code: "GROWATT_UNAVAILABLE", message: "Growatt request failed" }; }

export function SolarProductionCardView({ diagnostic, data, error, loading, onRefresh }: { diagnostic: boolean; data: GrowattUiData | null; error: GrowattUiError | null; loading: boolean; onRefresh: () => void }) {
  const latest = data?.latest ?? null;
  const freshness = growattFreshness(latest?.measuredAt ?? null);
  const rateLimited = error?.code === "GROWATT_RATE_LIMITED" || error?.status === 429;
  const capabilities = latest?.rawCapabilities.filter(item => growattCapabilityLabels[item]).map(item => growattCapabilityLabels[item]) ?? [];
  return <section className="card mt-4 min-w-0 overflow-hidden p-5" aria-labelledby={diagnostic ? "growatt-settings-title" : "growatt-overview-title"}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0"><p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Élő inverteradatok</p><h2 id={diagnostic ? "growatt-settings-title" : "growatt-overview-title"} className="mt-1 text-lg font-black">{diagnostic ? "Growatt napelem-integráció" : "Napelem – inverteradatok"}</h2><p className="mt-1 text-xs text-slate-500">Az alkalmazás csak adatot olvas, az invertert nem vezérli.</p></div>
      <button type="button" className="secondary inline-flex items-center gap-2" disabled={loading} onClick={onRefresh}><RefreshCw size={16} className={loading ? "animate-spin" : ""}/>{loading && data ? "Frissítés…" : "Frissítés"}</button>
    </div>
    {loading && !data && <div role="status" className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">Growatt-adatok betöltése…</div>}
    {error && (rateLimited ? <div role="status" className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-900"><b>Átmeneti Growatt-korlátozás</b><p className="mt-1">A Growatt ideiglenesen túl sok kérést érzékelt. Próbáld újra később.</p>{data && <p className="mt-1 text-xs">A korábban betöltött inverteradat változatlanul látható.</p>}</div> : <div role="alert" className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-800"><b>Az inverteradatok nem érhetők el.</b><p className="mt-1">{growattErrorMessage(error)}</p>{data && <p className="mt-1 text-xs">A korábban betöltött adat továbbra is látható.</p>}</div>)}
    {data && !data.status.configured && <div className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-900"><b>Nincs konfigurálva</b><p className="mt-1">A Growatt-integráció nincs teljesen beállítva.</p></div>}
    {data?.status.configured && latest && (diagnostic ? <Diagnostic latest={latest} connected={data.status.connected} capabilities={capabilities}/> : <Production latest={latest} freshness={freshness}/>)}
  </section>;
}

function Production({ latest, freshness }: { latest: NonNullable<GrowattUiData["latest"]>; freshness: ReturnType<typeof growattFreshness> }) {
  const energy = [["Ma termelt", latest.todayEnergyKwh], ["Ebben a hónapban", latest.monthEnergyKwh], ["Ebben az évben", latest.yearEnergyKwh], ["Összes inverteres termelés", latest.lifetimeEnergyKwh]] as const;
  const relativeTime = formatGrowattRelativeTime(latest.measuredAt);
  return <div className="mt-5">
    <div className="rounded-2xl bg-emerald-50 p-5"><div className="flex items-center gap-2 text-emerald-800"><Sun size={20}/><p className="text-sm font-bold">Aktuális termelés</p></div><p className="mt-2 break-words text-4xl font-black tabular-nums text-emerald-950">{formatGrowattPower(latest.currentPowerW)}</p><div className="mt-3 flex flex-wrap gap-2 text-xs"><span className="rounded-full bg-white px-2 py-1 font-bold">{freshnessLabel[freshness]}</span><span className="px-2 py-1 text-slate-600">Utolsó inverteradat: {formatGrowattMeasuredAt(latest.measuredAt)}{relativeTime ? ` · ${relativeTime}` : ""}</span></div></div>
    <dl className="mt-4 grid gap-2 sm:grid-cols-2">{energy.map(([label, value]) => value === null ? null : <div key={label} className="flex min-w-0 items-center justify-between gap-3 rounded-xl bg-slate-50 p-3"><dt className="text-sm text-slate-600">{label}</dt><dd className="break-words text-right font-black tabular-nums">{formatGrowattEnergy(value)}</dd></div>)}</dl>
    <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-blue-950"><b>Mit jelent ez?</b><p className="mt-1">Az inverter a teljes napelemes termelést méri, a villanyóra pedig a hálózati vételezést és visszatáplálást. Az inverteres termelés ezért nem azonos a hálózatba visszatáplált energiával.</p><p className="mt-1">Azonos, teljes időszakok különbsége becsült helyben felhasznált napenergia lehet, de ezt az alkalmazás jelenleg még nem számítja ki automatikusan.</p></div>
  </div>;
}

function Diagnostic({ latest, connected, capabilities }: { latest: NonNullable<GrowattUiData["latest"]>; connected: boolean; capabilities: string[] }) {
  const deviceStatus = growattDeviceStatusDisplay(latest.deviceStatus);
  return <div className="mt-4 space-y-3 text-sm"><dl className="grid gap-2 sm:grid-cols-2"><Row label="Konfiguráció" value="Konfigurálva"/><Row label="Kapcsolat" value={connected ? "Kapcsolódva" : "Hiba"}/><Row label="Gyártó" value="Growatt"/><Row label="Eszköz" value={growattDeviceTypeLabel(latest.deviceType)}/>{latest.deviceModel && <Row label="Modellazonosító" value={latest.deviceModel} breakAll/>}<Row label="Eszköz állapota" value={deviceStatus.label}/>{deviceStatus.technicalCode && <Row label="Technikai státuszkód" value={deviceStatus.technicalCode}/>}<Row label="Utolsó sikeres mérési idő" value={formatGrowattMeasuredAt(latest.measuredAt)}/></dl><div className="rounded-xl bg-slate-50 p-3"><p className="font-bold">Elérhető adatok</p>{capabilities.length ? <ul className="mt-2 flex flex-wrap gap-2">{capabilities.map(item => <li key={item} className="rounded-full bg-white px-2 py-1 text-xs">{item}</li>)}</ul> : <p className="mt-1 text-slate-600">Nincs megjeleníthető capability.</p>}</div><p className="text-xs text-slate-500">Az API-hozzáférés szerveroldali beállítás. Titkos vagy egyedi azonosító ezen a felületen nem jelenik meg.</p></div>;
}
function Row({ label, value, breakAll = false }: { label: string; value: string; breakAll?: boolean }) { return <div className="flex min-w-0 justify-between gap-3 rounded-xl bg-slate-50 p-3"><dt className="shrink-0 text-slate-600">{label}</dt><dd className={`${breakAll ? "break-all" : "break-words"} min-w-0 text-right font-bold`}>{value}</dd></div>; }
