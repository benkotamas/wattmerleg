"use client";

import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { formatDate, formatKwh } from "@/components/format";
import { PageState } from "@/components/page-state";
import { readingDelta } from "@/lib/calculations";
import { useEnergyData } from "@/lib/data";
import { createClient } from "@/lib/supabase/client";
import type { MeterReading } from "@/lib/types";
import { Pencil, Trash2, X } from "lucide-react";

export default function HistoryPage() {
  const { readings, loading, error, refresh } = useEnergyData();
  const [editing, setEditing] = useState<MeterReading | null>(null);
  const [message, setMessage] = useState("");
  async function remove(reading: MeterReading) {
    if (!confirm(`Biztosan törlöd a(z) ${formatDate(reading.reading_at)} mérőállást?`)) return;
    const { error } = await createClient().from("meter_readings").delete().eq("id", reading.id);
    if (error) setMessage(error.message); else void refresh();
  }
  async function save() {
    if (!editing) return;
    const index = readings.findIndex(r => r.id === editing.id);
    const previous = readings[index - 1], next = readings[index + 1];
    if ((previous && (editing.consumption_meter_kwh < previous.consumption_meter_kwh || editing.production_meter_kwh < previous.production_meter_kwh)) ||
        (next && (editing.consumption_meter_kwh > next.consumption_meter_kwh || editing.production_meter_kwh > next.production_meter_kwh)))
      return setMessage("A módosított értéknek az előző és következő óraállás közé kell esnie.");
    const { error } = await createClient().from("meter_readings").update({
      consumption_meter_kwh: editing.consumption_meter_kwh,
      production_meter_kwh: editing.production_meter_kwh, note: editing.note,
    }).eq("id", editing.id);
    if (error) setMessage(error.message); else { setEditing(null); setMessage(""); void refresh(); }
  }
  if (loading || error) return <AppShell><PageState loading={loading} error={error}/></AppShell>;
  return (
    <AppShell>
      <h1 className="text-3xl font-black">Előzmények</h1><p className="mt-1 text-sm text-slate-500">{readings.length} rögzített mérés az aktuális időszakban</p>
      {message && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{message}</p>}
      <div className="mt-5 space-y-3">
        {[...readings].reverse().map((reading, reverseIndex) => {
          const originalIndex = readings.length - 1 - reverseIndex;
          const delta = originalIndex > 0 ? readingDelta(readings[originalIndex - 1], reading) : null;
          return <article key={reading.id} className="card p-4">
            <div className="flex items-start justify-between gap-3"><div><p className="font-black">{formatDate(reading.reading_at)}</p><p className="text-xs text-slate-500">{new Date(reading.reading_at).toLocaleTimeString("hu-HU", { hour: "2-digit", minute: "2-digit" })}</p></div><div className="flex gap-1"><button aria-label="Szerkesztés" onClick={() => setEditing({...reading})} className="rounded-xl p-2 text-slate-500 hover:bg-slate-100"><Pencil size={18}/></button><button aria-label="Törlés" onClick={() => void remove(reading)} className="rounded-xl p-2 text-red-600 hover:bg-red-50"><Trash2 size={18}/></button></div></div>
            <div className="mt-4 grid grid-cols-2 gap-3"><div><p className="text-xs text-slate-500">Fogyasztási mérő</p><p className="font-bold">{formatKwh(reading.consumption_meter_kwh)}</p>{delta && <p className="text-xs text-orange-700">+{formatKwh(delta.consumption)}</p>}</div><div><p className="text-xs text-slate-500">Termelési mérő</p><p className="font-bold">{formatKwh(reading.production_meter_kwh)}</p>{delta && <p className="text-xs text-emerald-700">+{formatKwh(delta.production)}</p>}</div></div>
            {reading.note && <p className="mt-3 border-t border-slate-100 pt-3 text-sm text-slate-600">{reading.note}</p>}
          </article>;
        })}
        {!readings.length && <div className="card p-7 text-center text-slate-500">Még nincs rögzített mérés.</div>}
      </div>
      {editing && <div className="fixed inset-0 z-40 grid place-items-end bg-black/40 p-0 sm:place-items-center sm:p-4"><div className="w-full max-w-lg rounded-t-3xl bg-white p-5 sm:rounded-3xl"><div className="mb-5 flex justify-between"><h2 className="text-xl font-black">Mérés szerkesztése</h2><button onClick={() => setEditing(null)}><X/></button></div><div className="space-y-4"><label className="block text-sm font-bold">Fogyasztási óraállás<input type="number" step="0.001" className="field mt-2" value={editing.consumption_meter_kwh} onChange={e => setEditing({...editing, consumption_meter_kwh: Number(e.target.value)})}/></label><label className="block text-sm font-bold">Termelési óraállás<input type="number" step="0.001" className="field mt-2" value={editing.production_meter_kwh} onChange={e => setEditing({...editing, production_meter_kwh: Number(e.target.value)})}/></label><label className="block text-sm font-bold">Megjegyzés<textarea className="field mt-2" value={editing.note ?? ""} onChange={e => setEditing({...editing, note: e.target.value || null})}/></label><button onClick={() => void save()} className="primary w-full">Módosítás mentése</button></div></div></div>}
    </AppShell>
  );
}
