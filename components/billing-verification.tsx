"use client";

import React, { useEffect, useState } from "react";
import { formatDate, formatHuf } from "@/components/format";
import { officialDifference } from "@/lib/billing/snapshots";
import type { SettlementBillSnapshot } from "@/lib/types";

interface Props { periodId: string; snapshot: SettlementBillSnapshot | null; currentCalculatedAmount: number; available: boolean; onChanged?: () => void | Promise<void> }

export function BillingVerification({ periodId, snapshot, currentCalculatedAmount, available, onChanged }: Props) {
  const [officialTotal, setOfficialTotal] = useState(snapshot?.official_total_ft?.toString() ?? "");
  const [invoiceReference, setInvoiceReference] = useState(snapshot?.invoice_reference ?? "");
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  useEffect(() => { setOfficialTotal(snapshot?.official_total_ft?.toString() ?? ""); setInvoiceReference(snapshot?.invoice_reference ?? ""); }, [snapshot]);

  async function createSnapshot() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/billing/snapshots/${periodId}`, { method: "POST", credentials: "same-origin", cache: "no-store" });
      const body = await response.json().catch(() => ({})) as { error?: { code?: string } };
      if (!response.ok) throw new Error(body.error?.code ?? "BILLING_SNAPSHOT_WRITE_FAILED");
      setMessage("A díjszámítási pillanatkép elkészült."); await onChanged?.();
    } catch { setMessage("A pillanatkép most nem menthető. Ellenőrizd, hogy a 016-os migráció lefutott-e."); }
    finally { setBusy(false); }
  }

  async function saveOfficialInvoice() {
    const parsed = officialTotal.trim() === "" ? null : Number(officialTotal);
    if (parsed !== null && !Number.isFinite(parsed)) return setMessage("Adj meg érvényes MVM végösszeget.");
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/billing/snapshots/${periodId}`, { method: "PATCH", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ officialTotalFt: parsed, invoiceReference }) });
      const body = await response.json().catch(() => ({})) as { error?: { code?: string } };
      if (!response.ok) throw new Error(body.error?.code ?? "BILLING_SNAPSHOT_WRITE_FAILED");
      setMessage(parsed === null ? "A hivatalos számlaadat törölve." : "Az MVM számlaadat mentése sikerült."); await onChanged?.();
    } catch { setMessage("Az MVM számlaadat mentése most nem sikerült."); }
    finally { setBusy(false); }
  }

  if (!available) return <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">A számla-hitelesítő a <b>016_settlement_bill_snapshots.sql</b> migráció futtatása után használható.</p>;
  if (!snapshot) return <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"><p className="font-bold">Még nincs lezárt díjszámítási pillanatkép</p><p className="mt-1">Rögzítés után a régi időszak összege későbbi tarifamódosításkor sem változik meg.</p><button type="button" disabled={busy} onClick={() => void createSnapshot()} className="secondary mt-3 w-full sm:w-auto">{busy ? "Rögzítés…" : "Díjszámítás rögzítése"}</button>{message && <p role="status" className="mt-2">{message}</p>}</div>;

  const difference = officialDifference(snapshot), exact = difference !== null && Math.abs(difference) < 0.5;
  const recalculationChanged = Math.abs(currentCalculatedAmount - snapshot.calculated_total_ft) >= 0.5;
  return <details className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 text-sm"><summary className="cursor-pointer font-bold text-emerald-950">Számla-hitelesítés {exact ? "· pontos egyezés" : difference === null ? "· MVM összegre vár" : `· eltérés: ${formatHuf(difference)}`}</summary><div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4"><Value label="Rögzített számítás" value={formatHuf(snapshot.calculated_total_ft)}/><Value label="MVM végösszeg" value={snapshot.official_total_ft === null ? "Nincs megadva" : formatHuf(snapshot.official_total_ft)}/><Value label="Eltérés (MVM − számítás)" value={difference === null ? "–" : formatHuf(difference)}/><Value label="Pillanatkép" value={formatDate(snapshot.snapshotted_at)}/></div>{recalculationChanged && <p className="mt-3 rounded-lg bg-amber-50 p-2 text-amber-900">Az aktuális tarifával újraszámolt érték {formatHuf(currentCalculatedAmount)}, de a lezárt pillanatkép változatlanul {formatHuf(snapshot.calculated_total_ft)}.</p>}<div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="font-bold">MVM számla végösszege (Ft)<input className="field mt-1" type="number" inputMode="decimal" step="1" value={officialTotal} onChange={event => setOfficialTotal(event.target.value)} placeholder="Például 485480"/></label><label className="font-bold">Számlaszám vagy hivatkozás – opcionális<input className="field mt-1" maxLength={100} value={invoiceReference} onChange={event => setInvoiceReference(event.target.value)} placeholder="Például 845803512147"/></label></div><button type="button" disabled={busy} onClick={() => void saveOfficialInvoice()} className="primary mt-3 w-full sm:w-auto">{busy ? "Mentés…" : "MVM számlaadat mentése"}</button><p className="mt-2 text-xs text-slate-600">Számítási verzió: {snapshot.calculation_version}. A rögzített mérő-, tarifa- és díjadatok nem írhatók át.</p>{message && <p role="status" className="mt-2 rounded-lg bg-white p-2">{message}</p>}</details>;
}

function Value({ label, value }: { label: string; value: string }) { return <div><p className="text-xs text-slate-500">{label}</p><p className="mt-1 break-words font-bold tabular-nums">{value}</p></div>; }
