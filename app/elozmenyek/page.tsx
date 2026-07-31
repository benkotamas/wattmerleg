"use client";

import { useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { formatDate, formatKwh } from "@/components/format";
import { PageState } from "@/components/page-state";
import { EmptyState, PageHeader } from "@/components/ui";
import { readingDelta } from "@/lib/calculations";
import { useEnergyData } from "@/lib/data";
import { monthlyStatistics } from "@/lib/statistics";
import { createClient } from "@/lib/supabase/client";
import type { MeterReading } from "@/lib/types";
import { Pencil, Trash2, X } from "lucide-react";

const monthKey = (value: string) => { const date = new Date(value); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`; };
const monthLabel = (key: string) => new Intl.DateTimeFormat("hu-HU", { year: "numeric", month: "long" }).format(new Date(`${key}-15T12:00:00`));

export default function HistoryPage() {
  const { period, readings, loading, error, refresh } = useEnergyData();
  const months = useMemo(() => [...new Set(readings.map(reading => monthKey(reading.reading_at)))].reverse(), [readings]);
  const [selectedMonth, setSelectedMonth] = useState("all");
  const [editing, setEditing] = useState<MeterReading | null>(null);
  const [message, setMessage] = useState("");
  const filtered = selectedMonth === "all" ? readings : readings.filter(reading => monthKey(reading.reading_at) === selectedMonth);
  const selectedStat = selectedMonth === "all" ? null : monthlyStatistics(readings).find(stat => stat.month === selectedMonth);
  const last = filtered.at(-1);
  const consumption = selectedStat?.consumption ?? (last && period ? last.consumption_meter_kwh - period.opening_consumption_meter_kwh : 0);
  const production = selectedStat?.production ?? (last && period ? last.production_meter_kwh - period.opening_production_meter_kwh : 0);
  async function remove(reading: MeterReading) { if (!confirm(`Biztosan törlöd a(z) ${formatDate(reading.reading_at)} mérőállást?`)) return; const { error } = await createClient().from("meter_readings").delete().eq("id", reading.id); if (error) setMessage(error.message); else void refresh(); }
  async function save() {
    if (!editing) return; const index = readings.findIndex(reading => reading.id === editing.id); const previous = readings[index - 1], next = readings[index + 1];
    if ((previous && (editing.consumption_meter_kwh < previous.consumption_meter_kwh || editing.production_meter_kwh < previous.production_meter_kwh)) || (next && (editing.consumption_meter_kwh > next.consumption_meter_kwh || editing.production_meter_kwh > next.production_meter_kwh))) return setMessage("A módosított értéknek az előző és következő óraállás közé kell esnie.");
    const { error } = await createClient().from("meter_readings").update({ consumption_meter_kwh: editing.consumption_meter_kwh, production_meter_kwh: editing.production_meter_kwh, note: editing.note }).eq("id", editing.id);
    if (error) setMessage(error.message); else { setEditing(null); setMessage(""); void refresh(); }
  }
  if (loading || error) return <AppShell><PageState loading={loading} error={error}/></AppShell>;
  return (
    <AppShell>
      <PageHeader eyebrow="Mérési napló" title="Előzmények" description={`${readings.length} rögzített mérés az aktuális időszakban`}/>
      <section className="card mt-5 p-4"><label className="text-sm font-bold">Hónap kiválasztása<select className="field mt-2" value={selectedMonth} onChange={event => setSelectedMonth(event.target.value)}><option value="all">Összes mérés</option>{months.map(month => <option value={month} key={month}>{monthLabel(month)}</option>)}</select></label><div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4"><Summary label="Mérések" value={`${filtered.length} db`}/><Summary label="Fogyasztás" value={formatKwh(consumption)}/><Summary label="Termelés" value={formatKwh(production)}/><Summary label="Egyenleg" value={formatKwh(consumption - production)}/></div></section>
      {message && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{message}</p>}
      <div className="mt-4 grid gap-3 lg:grid-cols-2">{[...filtered].reverse().map(reading => { const originalIndex = readings.findIndex(item => item.id === reading.id); const delta = originalIndex > 0 ? readingDelta(readings[originalIndex - 1], reading) : null; return <article key={reading.id} className="card min-w-0 overflow-hidden p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-black">{formatDate(reading.reading_at)}</p><p className="text-xs text-slate-500">{new Date(reading.reading_at).toLocaleTimeString("hu-HU", { hour: "2-digit", minute: "2-digit" })}</p></div><div className="flex shrink-0 gap-1"><button aria-label="Szerkesztés" onClick={() => setEditing({...reading})} className="rounded-xl p-2 text-slate-500 hover:bg-slate-100"><Pencil size={18}/></button><button aria-label="Törlés" onClick={() => void remove(reading)} className="rounded-xl p-2 text-red-600 hover:bg-red-50"><Trash2 size={18}/></button></div></div><div className="mt-4 grid grid-cols-2 gap-3"><ReadingValue label="Fogyasztási mérő" value={reading.consumption_meter_kwh} delta={delta?.consumption} color="text-orange-700"/><ReadingValue label="Termelési mérő" value={reading.production_meter_kwh} delta={delta?.production} color="text-emerald-700"/></div>{reading.note && <p className="mt-3 break-words border-t border-slate-100 pt-3 text-sm text-slate-600">{reading.note}</p>}</article>; })}{!filtered.length && <div className="lg:col-span-2"><EmptyState title="Nincs mérés ebben a hónapban.">Válassz másik hónapot vagy rögzíts új mérőállást.</EmptyState></div>}</div>
      {editing && <div className="fixed inset-0 z-40 grid place-items-end bg-black/40 sm:place-items-center sm:p-4"><div className="w-full max-w-lg rounded-t-3xl bg-white p-5 sm:rounded-3xl"><div className="mb-5 flex justify-between"><h2 className="text-xl font-black">Mérés szerkesztése</h2><button onClick={() => setEditing(null)}><X/></button></div><div className="space-y-4"><EditNumber label="Fogyasztási óraállás" value={editing.consumption_meter_kwh} onChange={value => setEditing({...editing, consumption_meter_kwh: value})}/><EditNumber label="Termelési óraállás" value={editing.production_meter_kwh} onChange={value => setEditing({...editing, production_meter_kwh: value})}/><label className="block text-sm font-bold">Megjegyzés<textarea className="field mt-2" value={editing.note ?? ""} onChange={event => setEditing({...editing, note: event.target.value || null})}/></label><button onClick={() => void save()} className="primary w-full">Módosítás mentése</button></div></div></div>}
    </AppShell>
  );
}

function Summary({ label, value }: { label: string; value: string }) { return <div className="min-w-0"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 break-words font-black tabular-nums">{value}</p></div>; }
function ReadingValue({ label, value, delta, color }: { label: string; value: number; delta?: number; color: string }) { return <div className="min-w-0"><p className="text-xs text-slate-500">{label}</p><p className="break-words font-bold tabular-nums">{formatKwh(value)}</p>{delta != null && <p className={`text-xs ${color}`}>{delta >= 0 ? "+" : ""}{formatKwh(delta)}</p>}</div>; }
function EditNumber({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) { return <label className="block text-sm font-bold">{label}<input type="number" inputMode="decimal" step="0.001" className="field mt-2" value={value} onChange={event => onChange(Number(event.target.value))}/></label>; }
