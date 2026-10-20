"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function HeatingRebuildButton() {
  const router = useRouter();
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState<string | null>(null);
  async function run() {
    if (busy) return;
    setBusy(true); setMessage(null);
    try {
      const response = await fetch("/api/heating/analysis/rebuild", { method:"POST", credentials:"same-origin", cache:"no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(response.status===409 ? "Már folyamatban van egy számítás." : "Az újraszámítás nem sikerült (" + (payload.error?.code ?? response.status) + ").");
        return;
      }
      setMessage("Az elemzés elkészült. Feldolgozott napok: " + (payload.analyzedDays ?? "ismeretlen") + ".");
      router.refresh();
    } catch {
      setMessage("A kérés megszakadt vagy időtúllépés történt. Ellenőrizd később az adatok frissülését, mielőtt újraindítod.");
    } finally { setBusy(false); }
  }
  return <div className="mt-4">
    <button type="button" onClick={run} disabled={busy} className="rounded-lg bg-slate-900 px-4 py-2 font-semibold text-white disabled:opacity-50">
      {busy ? "Újraszámítás folyamatban…" : "Fűtéselemzés újraszámítása"}
    </button>
    <p className="mt-2 text-xs text-slate-500">Az újraszámítás időjárási adatokat is pótolhat, ezért akár több percig tarthat. Az eredmények mentés után frissülnek.</p>
    {message && <p role="status" aria-live="polite" className="mt-2 text-sm">{message}</p>}
  </div>;
}
