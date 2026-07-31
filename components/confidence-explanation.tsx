import React from "react";
import { confidencePresentation, type ConfidenceLevel } from "@/lib/confidence";

const colors = {
  high: "bg-emerald-100 text-emerald-900",
  medium: "bg-blue-100 text-blue-900",
  low: "bg-amber-100 text-amber-900",
};

export function ConfidenceExplanation({ level, reasons = [], context, explanation, compact = false }: {
  level: ConfidenceLevel;
  reasons?: string[];
  context?: "retrospective" | "actual" | "forecast" | "no_heating_demand";
  explanation?: string;
  compact?: boolean;
}) {
  const presentation = confidencePresentation(level);
  return <div className={compact ? "text-xs" : "text-sm"}>
    <span className={`inline-block rounded-full px-2 py-1 font-bold ${colors[level]}`}>{presentation.label} megbízhatóság</span>
    <p className="mt-1 text-slate-600">{explanation ?? presentation.explanation}</p>
    {compact && <details className="mt-1 inline-block">
      <summary className="cursor-pointer font-bold text-slate-700">Mit jelent? ⓘ</summary>
      <p className="mt-1 max-w-xs rounded-lg bg-white p-2 text-slate-600 shadow-sm">{explanation ?? presentation.explanation} A megbízhatóság nem százalékos pontosságot jelent.</p>
    </details>}
    {!compact && (reasons.length > 0 || context) && <details className="mt-1">
      <summary className="cursor-pointer font-bold text-slate-700">Miért ezt a szintet kapta?</summary>
      {context === "retrospective" && <p className="mt-1 text-slate-600">Retrospektív becslés: az akkori tényleges kazánbeállítás és komfort nem ismert.</p>}
      {context === "actual" && <p className="mt-1 text-slate-600">Tényleges fűtési megfigyelésekre épülő ajánlás.</p>}
      {context === "no_heating_demand" && <p className="mt-1 text-slate-600">Hőmérsékleti feltételből származó megállapítás; nem korábbi fűtési logokra épül.</p>}
      {reasons.length > 0 && <ul className="mt-1 list-disc space-y-1 pl-5 text-slate-600">{reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>}
    </details>}
    {!compact && <details className="mt-1">
      <summary className="cursor-pointer font-bold text-slate-700">Mit jelent a megbízhatóság?</summary>
      <p className="mt-1 text-slate-600">A megbízhatóság azt mutatja, hogy az adott becslést mennyire erős, hasonló és jó minőségű adatok támasztják alá. Nem százalékos pontosságot jelent.</p>
    </details>}
  </div>;
}
