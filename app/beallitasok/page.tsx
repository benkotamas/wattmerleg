"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { formatDate, formatHuf, formatKwh } from "@/components/format";
import { PageState } from "@/components/page-state";
import { PageHeader, StatusPanel } from "@/components/ui";
import { PeriodList } from "@/components/period-list";
import { closingDateForPeriod, periodSummary } from "@/lib/calculations";
import { useEnergyData } from "@/lib/data";
import { isValidMonthDay } from "@/lib/seasonal-forecast";
import { createClient } from "@/lib/supabase/client";
import type { TariffSettings } from "@/lib/types";
import { SolarProductionCard } from "@/components/growatt/solar-production-card";
import { GrowattHistoricalSyncCard } from "@/components/growatt/historical-sync-card";
import { clearGrowattBrowserCache } from "@/lib/growatt/ui";
import { EonIntervalImportCard } from "@/components/eon/interval-import-card";
import { EonGmailSyncCard } from "@/components/eon/gmail-sync-card";

export default function SettingsPage() {
  const router = useRouter();
  const { period, periods, readings, allReadings, tariff, tariffFromDatabase, loading, error, refresh } = useEnergyData();
  const [form, setForm] = useState<TariffSettings>(tariff);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [closing, setClosing] = useState(false);
  useEffect(() => setForm(tariff), [tariff]);
  const summary = period ? periodSummary(period, readings, tariff) : null;

  async function saveTariff() {
    setMessage("");
    const values = Object.values(form);
    if (values.some(value => !Number.isFinite(value) || value < 0) || !isValidMonthDay(form.annual_closing_month, form.annual_closing_day) || !isValidMonthDay(form.heating_season_start_month, form.heating_season_start_day) || !isValidMonthDay(form.heating_season_end_month, form.heating_season_end_day)) return setMessage("Érvénytelen dátum. Február legfeljebb 29, április, június, szeptember és november legfeljebb 30 napos lehet.");
    setSaving(true);
    const { error } = await createClient().from("tariff_settings").upsert(form, { onConflict: "user_id" });
    setSaving(false);
    if (error) setMessage(`Mentési hiba: ${error.message}`); else { setMessage("A tarifabeállítások mentése sikerült."); void refresh(); }
  }
  async function closePeriod() {
    if (!period || !summary || !readings.length) return setMessage("A lezáráshoz legalább egy mérés szükséges.");
    const latest = readings.at(-1)!;
    if (!confirm(`Éves időszak lezárása\n\n${formatDate(period.start_date)} – ${formatDate(latest.reading_at)}\nFogyasztás: ${formatKwh(summary.consumption)}\nTermelés: ${formatKwh(summary.production)}\nEgyenleg: ${formatKwh(summary.balance)}\nBecsült összeg: ${formatHuf(summary.estimatedAmount)}\n\nBiztosan folytatod?`)) return;
    setClosing(true); const { error } = await createClient().rpc("close_settlement_period", { period_id: period.id }); setClosing(false);
    if (error) setMessage(error.message); else { setMessage("Az időszak lezárult, az új időszak elindult."); void refresh(); }
  }
  async function logout() { try { await createClient().auth.signOut(); } finally { clearGrowattBrowserCache(); router.replace("/belepes"); router.refresh(); } }
  if (loading || error) return <AppShell><PageState loading={loading} error={error}/></AppShell>;
  return (
    <AppShell>
      <PageHeader eyebrow="Alkalmazás" title="Beállítások" description="Tarifák, éves zárás, fűtési szezon és korábbi elszámolási időszakok."/>
      <SolarProductionCard diagnostic/>
      <div id="growatt-history"><GrowattHistoricalSyncCard/><div className="mt-2 text-right"><Link href="/statisztika?view=solar" className="text-sm font-bold text-emerald-700 hover:underline">Napelemes statisztika megnyitása</Link></div></div>
      <EonIntervalImportCard/>
      <EonGmailSyncCard/>
      <section className="card mt-5 p-5"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-black">Árkalkuláció és éves zárás</h2><span className={`rounded-full px-2 py-1 text-xs font-bold ${tariffFromDatabase ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{tariffFromDatabase ? "Adatbázisból" : "Biztonsági alapérték"}</span></div><div className="mt-5 grid gap-4 sm:grid-cols-2"><NumberField label="Éves kedvezményes limit (kWh)" value={form.discounted_limit_kwh} step="1" onChange={value => setForm({...form, discounted_limit_kwh: value})}/><NumberField label="Kedvezményes ár (Ft/kWh)" value={form.discounted_price_ft} onChange={value => setForm({...form, discounted_price_ft: value})}/><NumberField label="Limit feletti ár (Ft/kWh)" value={form.market_price_ft} onChange={value => setForm({...form, market_price_ft: value})}/><NumberField label="Termelési többlet ára (Ft/kWh)" value={form.feed_in_price_ft} onChange={value => setForm({...form, feed_in_price_ft: value})}/><NumberField label="Éves zárás hónapja" value={form.annual_closing_month} step="1" onChange={value => setForm({...form, annual_closing_month: value})}/><NumberField label="Éves zárás napja" value={form.annual_closing_day} step="1" onChange={value => setForm({...form, annual_closing_day: value})}/></div><button disabled={saving} onClick={() => void saveTariff()} className="primary mt-5 w-full sm:w-auto">{saving ? "Mentés…" : "Beállítások mentése"}</button>{!tariffFromDatabase && <p className="mt-3 text-xs text-amber-800">A tarifa tábla nem érhető el; az alkalmazás addig a korábbi biztonsági alapértékekkel számol.</p>}</section>
      <section className="card mt-3 p-5"><h2 className="text-lg font-black">Fűtési szezon</h2><p className="mt-1 text-sm text-slate-500">A szezonális elemzés időhatárai. Az alapértelmezés október 1. – április 30.</p><div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4"><NumberField label="Kezdő hónap" value={form.heating_season_start_month} step="1" onChange={value => setForm({...form, heating_season_start_month: value})}/><NumberField label="Kezdő nap" value={form.heating_season_start_day} step="1" onChange={value => setForm({...form, heating_season_start_day: value})}/><NumberField label="Záró hónap" value={form.heating_season_end_month} step="1" onChange={value => setForm({...form, heating_season_end_month: value})}/><NumberField label="Záró nap" value={form.heating_season_end_day} step="1" onChange={value => setForm({...form, heating_season_end_day: value})}/></div><button disabled={saving} onClick={() => void saveTariff()} className="primary mt-5 w-full sm:w-auto">{saving ? "Mentés…" : "Beállítások mentése"}</button></section>
      <section className="card mt-3 border-red-200 p-5"><p className="text-xs font-black uppercase tracking-wider text-red-700">Visszafordíthatatlan művelet</p><h2 className="mt-1 text-lg font-black">Éves elszámolás lezárása</h2><p className="mt-2 text-sm text-slate-600">Következő tervezett zárás: <b>{period ? formatDate(closingDateForPeriod(period.start_date, tariff)) : "–"}</b>. A zárás nem történik meg automatikusan.</p><StatusPanel tone="warning" className="mt-3">A lezárás új elszámolási időszakot indít. A gomb megnyomása után részletes megerősítést kérünk.</StatusPanel>{summary && <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3 text-sm"><span>Fogyasztás</span><b className="text-right">{formatKwh(summary.consumption)}</b><span>Termelés</span><b className="text-right">{formatKwh(summary.production)}</b><span>Becsült összeg</span><b className="text-right">{formatHuf(summary.estimatedAmount)}</b></div>}<button disabled={closing || !period} onClick={() => void closePeriod()} className="mt-4 w-full rounded-xl bg-red-700 p-3 font-bold text-white hover:bg-red-800">{closing ? "Lezárás…" : "Éves időszak lezárása"}</button></section>
      {message && <p className={`mt-3 rounded-xl p-3 text-sm ${message.includes("hiba") || message.includes("Ellenőrizd") ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-900"}`}>{message}</p>}
      <PeriodList periods={periods} readings={allReadings} tariff={tariff}/>
      <button onClick={() => void logout()} className="secondary mt-5 w-full text-red-700">Kijelentkezés</button>
    </AppShell>
  );
}

function NumberField({ label, value, onChange, step = "0.1" }: { label: string; value: number; onChange: (value: number) => void; step?: string }) { return <label className="block text-sm font-bold">{label}<input type="number" inputMode="decimal" min="0" step={step} className="field mt-2" value={value} onChange={event => onChange(Number(event.target.value))}/></label>; }
