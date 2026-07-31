"use client";

import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { formatDate, formatHuf, formatKwh } from "@/components/format";
import { PageState } from "@/components/page-state";
import { nextClosingDate, periodSummary } from "@/lib/calculations";
import { ENERGY_CONFIG } from "@/lib/config";
import { useEnergyData } from "@/lib/data";
import { createClient } from "@/lib/supabase/client";
import { useState } from "react";

export default function SettingsPage() {
  const router = useRouter();
  const { period, readings, loading, error, refresh } = useEnergyData();
  const [message, setMessage] = useState("");
  const [closing, setClosing] = useState(false);
  const summary = period ? periodSummary(period, readings) : null;
  async function closePeriod() {
    if (!period || !summary || !readings.length) return setMessage("A lezáráshoz legalább egy mérés szükséges.");
    const latest = readings.at(-1)!;
    const confirmed = confirm(
      `Éves időszak lezárása\n\n${formatDate(period.start_date)} – ${formatDate(latest.reading_at)}\nFogyasztás: ${formatKwh(summary.consumption)}\nTermelés: ${formatKwh(summary.production)}\nEgyenleg: ${formatKwh(summary.balance)}\nBecsült összeg: ${formatHuf(summary.estimatedAmount)}\n\nBiztosan folytatod?`,
    );
    if (!confirmed) return;
    setClosing(true);
    const { error } = await createClient().rpc("close_settlement_period", { period_id: period.id });
    setClosing(false);
    if (error) setMessage(error.message); else { setMessage("Az időszak lezárult, az új időszak elindult."); void refresh(); }
  }
  async function logout() {
    await createClient().auth.signOut(); router.replace("/belepes"); router.refresh();
  }
  if (loading || error) return <AppShell><PageState loading={loading} error={error}/></AppShell>;
  return (
    <AppShell>
      <h1 className="text-3xl font-black">Beállítások</h1>
      <section className="card mt-5 p-5"><h2 className="text-lg font-black">Árkalkuláció</h2><dl className="mt-4 space-y-3 text-sm">{[
        ["Éves kedvezményes limit", `${ENERGY_CONFIG.annualDiscountLimitKwh} kWh`],
        ["Kedvezményes ár", `${ENERGY_CONFIG.discountedPriceHufPerKwh} Ft/kWh`],
        ["Limit feletti ár", `${ENERGY_CONFIG.marketPriceHufPerKwh} Ft/kWh`],
        ["Termelési többlet ára", `${ENERGY_CONFIG.exportPriceHufPerKwh} Ft/kWh`],
      ].map(([term, value]) => <div className="flex justify-between gap-4" key={term}><dt className="text-slate-500">{term}</dt><dd className="font-bold">{value}</dd></div>)}</dl><p className="mt-4 text-xs text-slate-500">Az értékek a <code>lib/config.ts</code> fájlban módosíthatók.</p></section>
      <section className="card mt-3 p-5"><h2 className="text-lg font-black">Éves elszámolás</h2><p className="mt-2 text-sm text-slate-600">Következő tervezett zárás: <b>{formatDate(nextClosingDate())}</b>. A zárás nem történik meg automatikusan.</p>{summary && <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3 text-sm"><span>Fogyasztás</span><b className="text-right">{formatKwh(summary.consumption)}</b><span>Termelés</span><b className="text-right">{formatKwh(summary.production)}</b><span>Becsült összeg</span><b className="text-right">{formatHuf(summary.estimatedAmount)}</b></div>}<button disabled={closing || !period} onClick={() => void closePeriod()} className="mt-4 w-full rounded-xl bg-slate-900 p-3 font-bold text-white">{closing ? "Lezárás…" : "Éves időszak lezárása"}</button></section>
      {message && <p className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">{message}</p>}
      <button onClick={() => void logout()} className="secondary mt-5 w-full text-red-700">Kijelentkezés</button>
    </AppShell>
  );
}
