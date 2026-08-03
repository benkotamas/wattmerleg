import React from "react";
import { solarAnalysisStatusLabel, type SolarAnalysisStatus } from "@/lib/solar/consumption-analysis";

const tone: Record<SolarAnalysisStatus, string> = { complete: "bg-emerald-100 text-emerald-900", in_progress: "bg-blue-100 text-blue-900", estimated_meter_allocation: "bg-amber-100 text-amber-900", incomplete_pv_coverage: "bg-amber-100 text-amber-900", incomplete_meter_coverage: "bg-amber-100 text-amber-900", period_mismatch: "bg-amber-100 text-amber-900", inconsistent_inputs: "bg-red-100 text-red-900", missing_meter_data: "bg-slate-100 text-slate-700", missing_pv_data: "bg-slate-100 text-slate-700", timezone_mismatch: "bg-red-100 text-red-900" };
export function SolarAnalysisStatusBadge({ status }: { status: SolarAnalysisStatus }) { return <span className={`max-w-full break-words rounded-full px-2 py-1 text-xs font-bold ${tone[status]}`}>{solarAnalysisStatusLabel[status]}</span>; }
