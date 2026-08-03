"use client";

import React, { useEffect, useState } from "react";

export type StatisticsView = "meter" | "solar" | "heating";
export const normalizeStatisticsView = (value: string | null): StatisticsView => value === "solar" || value === "heating" ? value : "meter";
export const statisticsViewUrl = (current: string, view: StatisticsView): string => { const url = new URL(current); url.searchParams.set("view", view); return url.toString(); };
const views: { value: StatisticsView; label: string }[] = [{ value: "meter", label: "Villanyóra" }, { value: "solar", label: "Napelem" }, { value: "heating", label: "Fűtési szezon" }];

export function useStatisticsView() {
  const [view, setViewState] = useState<StatisticsView>("meter");
  useEffect(() => { const read = () => setViewState(normalizeStatisticsView(new URLSearchParams(window.location.search).get("view"))); read(); window.addEventListener("popstate", read); return () => window.removeEventListener("popstate", read); }, []);
  const setView = (next: StatisticsView) => { window.history.pushState({}, "", statisticsViewUrl(window.location.href, next)); setViewState(next); };
  return { view, setView };
}

export function StatisticsViewTabs({ value, onChange }: { value: StatisticsView; onChange: (value: StatisticsView) => void }) {
  const select = (next: StatisticsView) => { onChange(next); requestAnimationFrame(() => document.getElementById("statistics-content")?.scrollIntoView({ behavior: "smooth", block: "start" })); };
  const keyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => { if (!new Set(["ArrowLeft", "ArrowRight", "Home", "End"]).has(event.key)) return; event.preventDefault(); const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? views.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + views.length) % views.length; select(views[nextIndex].value); document.getElementById(`statistics-tab-${views[nextIndex].value}`)?.focus(); };
  return <div className="-mx-1 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Statisztikai főnézet"><div className="inline-flex min-w-full gap-2 rounded-2xl bg-white p-2 shadow-sm sm:min-w-0">{views.map((item, index) => <button id={`statistics-tab-${item.value}`} key={item.value} type="button" role="tab" aria-selected={value === item.value} aria-controls={`statistics-panel-${item.value}`} tabIndex={value === item.value ? 0 : -1} onKeyDown={event => keyDown(event, index)} onClick={() => select(item.value)} className={`min-w-max flex-1 rounded-xl px-4 py-3 text-sm font-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${value === item.value ? "bg-emerald-700 text-white" : "text-slate-600 hover:bg-slate-50"}`}>{item.label}</button>)}</div></div>;
}
