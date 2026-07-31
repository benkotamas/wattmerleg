"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { PageState } from "@/components/page-state";
import { PageHeader, StatusPanel } from "@/components/ui";
import { formatKwh } from "@/components/format";
import { readingDelta } from "@/lib/calculations";
import { useEnergyData } from "@/lib/data";
import { createClient } from "@/lib/supabase/client";

const localNow = () => {
  const now = new Date(); const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 16);
};

export default function NewReadingPage() {
  const router = useRouter();
  const { period, readings, loading, error } = useEnergyData();
  const latest = readings.at(-1);
  const [readingAt, setReadingAt] = useState(localNow);
  const [consumption, setConsumption] = useState("");
  const [production, setProduction] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const preview = useMemo(() => {
    if (!latest || !consumption || !production) return null;
    return readingDelta(latest, {
      ...latest, reading_at: new Date(readingAt).toISOString(),
      consumption_meter_kwh: Number(consumption), production_meter_kwh: Number(production),
    });
  }, [latest, consumption, production, readingAt]);
  async function submit(event: FormEvent) {
    event.preventDefault(); setMessage("");
    if (!period) return setMessage("Nincs nyitott elszámolási időszak.");
    const c = Number(consumption), p = Number(production);
    if (latest && (c < latest.consumption_meter_kwh || p < latest.production_meter_kwh))
      return setMessage("Az új óraállás nem lehet kisebb az előzőnél.");
    if (latest && new Date(readingAt) <= new Date(latest.reading_at))
      return setMessage("Az új mérés időpontja legyen későbbi az előző mérésnél.");
    setSaving(true);
    const { error } = await createClient().from("meter_readings").insert({
      reading_at: new Date(readingAt).toISOString(), consumption_meter_kwh: c,
      production_meter_kwh: p, note: note.trim() || null, settlement_period_id: period.id,
    });
    setSaving(false);
    if (error) return setMessage(error.message);
    router.push("/elozmenyek");
  }
  if (loading || error) return <AppShell><PageState loading={loading} error={error}/></AppShell>;
  return (
    <AppShell>
      <PageHeader eyebrow="Adatrögzítés" title="Új mérőállás" description="Add meg a két mérő aktuális értékét. Mentés előtt ellenőrizheted a változást."/>
      {latest && <StatusPanel tone="success">Előző mérés: fogyasztás <b>{formatKwh(latest.consumption_meter_kwh)}</b>, termelés <b>{formatKwh(latest.production_meter_kwh)}</b></StatusPanel>}
      <form onSubmit={submit} className="card mt-4 space-y-4 p-5">
        <label className="block text-sm font-bold">Dátum és idő<input required type="datetime-local" className="field mt-2" value={readingAt} onChange={e => setReadingAt(e.target.value)}/></label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-bold">Fogyasztási óraállás (kWh)<input required min="0" step="0.001" inputMode="decimal" className="field mt-2" value={consumption} onChange={e => setConsumption(e.target.value)}/></label>
          <label className="block text-sm font-bold">Termelési óraállás (kWh)<input required min="0" step="0.001" inputMode="decimal" className="field mt-2" value={production} onChange={e => setProduction(e.target.value)}/></label>
        </div>
        <label className="block text-sm font-bold">Megjegyzés <span className="font-normal text-slate-400">(opcionális)</span><textarea rows={3} maxLength={500} className="field mt-2 resize-none" value={note} onChange={e => setNote(e.target.value)}/></label>
        {preview && preview.consumption >= 0 && preview.production >= 0 && <div className="rounded-xl bg-slate-50 p-3 text-sm"><b>Változás:</b> fogyasztás {formatKwh(preview.consumption)}, termelés {formatKwh(preview.production)}, egyenleg {formatKwh(preview.balance)} · {preview.elapsedDays.toFixed(1)} nap</div>}
        {message && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{message}</p>}
        <button disabled={saving} className="primary w-full">{saving ? "Mentés…" : "Mérőállás mentése"}</button>
      </form>
    </AppShell>
  );
}
