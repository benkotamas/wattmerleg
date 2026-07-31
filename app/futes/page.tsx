"use client";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { RadiatorEditor } from "@/components/radiator-editor";
import { WeatherLocationSearch } from "@/components/weather-location-search";
import { useHeatingData } from "@/lib/heating/data";
import { buildHeatingLog } from "@/lib/heating/log";
import { heatingRecommendation, validateHeatingLog } from "@/lib/heating/recommendation";
import type { ComfortResult } from "@/lib/heating/types";
import { createClient } from "@/lib/supabase/client";
import { localIsoDate } from "@/lib/weather/date";

export default function HeatingPage() {
  const { profile, source, thermostat, logs, loading, error, refresh } = useHeatingData();
  const [logDate, setLogDate] = useState(localIsoDate(new Date()));
  const [outdoor, setOutdoor] = useState<number | null>(null);
  const [outdoorRange, setOutdoorRange] = useState<{minC:number;maxC:number}|null>(null);
  const [temperatureSource, setTemperatureSource] = useState<"weather_api" | "manual">("manual");
  const [weatherNote, setWeatherNote] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (profile?.weather_latitude == null || profile.weather_longitude == null) return;
    const controller = new AbortController(); setOutdoor(null); setOutdoorRange(null); setTemperatureSource("manual"); setWeatherNote("Időjárás betöltése…");
    const url = `/api/weather?lat=${profile.weather_latitude}&lon=${profile.weather_longitude}&timezone=${encodeURIComponent(profile.weather_timezone)}&date=${logDate}`;
    fetch(url,{signal:controller.signal}).then(async response => { const body = await response.json(); if (!response.ok) throw new Error(body.error); const daily = body.daily?.[0]; if (!daily) throw new Error("Nincs adat a kiválasztott naphoz."); setOutdoor(daily.meanC); setOutdoorRange({minC:daily.minC,maxC:daily.maxC}); setTemperatureSource("weather_api"); setWeatherNote(body.kind === "historical" ? "Historikus Open-Meteo adat" : "Open-Meteo előrejelzés"); }).catch(caught => { if(caught instanceof DOMException&&caught.name==="AbortError")return;setOutdoor(null);setOutdoorRange(null);setTemperatureSource("manual");setWeatherNote(caught instanceof Error ? caught.message : "Az időjárás nem érhető el."); });return()=>controller.abort();
  }, [profile, logDate]);
  const recommendation = useMemo(() => profile && source && outdoor != null ? heatingRecommendation(profile, source, logs, outdoor) : null, [profile, source, logs, outdoor]);

  async function addLog(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!profile || !source || !thermostat || outdoor == null) return;
    const client = createClient(); const { data: { user } } = await client.auth.getUser(); if (!user) return setMessage("A mentéshez bejelentkezés szükséges.");
    const data = new FormData(event.currentTarget); const optional = (name: string) => data.get(name) === "" ? null : Number(data.get(name));
    const row = buildHeatingLog({ userId: user.id, date: logDate, outdoorC: outdoor, outdoorMinC:temperatureSource==="weather_api"?outdoorRange?.minC:null, outdoorMaxC:temperatureSource==="weather_api"?outdoorRange?.maxC:null, source: temperatureSource, targetC: profile.target_indoor_temperature_c, indoorMinC: optional("indoorMin"), indoorAvgC: optional("indoorAvg"), flowC: Number(data.get("flow")), powerKw: Number(data.get("power")), pa02:optional("pa02"), sensitivity: thermostat.switching_sensitivity_c, comfort: String(data.get("comfort")) as ComfortResult, notes: String(data.get("notes") ?? "") });
    const errors = validateHeatingLog(row, source.nominal_power_kw,source.maximum_configurable_power_kw); if (errors.length) return setMessage(errors.join(" "));
    const result = await client.from("heating_logs").insert(row); setMessage(result.error ? result.error.message : "A megfigyelés mentve."); if (!result.error) void refresh();
  }
  return <AppShell><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-sm font-bold text-emerald-700">DÖNTÉSTÁMOGATÁS</p><h1 className="text-3xl font-black">Fűtésoptimalizálás</h1><p className="mt-1 text-sm text-slate-500">Az alkalmazás csak ajánl; nem vezérli a kazánt vagy a termosztátot.</p></div><Link className="secondary" href="/beallitasok/futes">Rendszerbeállítások</Link></div>
  {loading ? <p className="card mt-5 p-5">Betöltés…</p> : error ? <p className="card mt-5 p-5">A 006 migráció még nem érhető el: {error}</p> : !profile || !source || !thermostat ? <div className="card mt-5 p-5"><p className="font-black">Először hozd létre a fűtési profilt.</p><Link href="/beallitasok/futes" className="primary mt-4 inline-block">Profil létrehozása</Link></div> : <>
    <section className="mt-5 grid gap-3 lg:grid-cols-2"><article className="card p-5"><p className="text-xs font-bold text-emerald-700">MIT ÁLLÍTSAK MA?</p><h2 className="text-xl font-black">Aktuális ajánlás</h2><label className="mt-4 block text-sm font-bold">Külső napi átlag (°C)<input className="field mt-2" type="number" step="0.1" inputMode="decimal" value={outdoor ?? ""} onChange={event => { setOutdoor(Number(event.target.value)); setTemperatureSource("manual"); setWeatherNote("Kézzel megadott érték"); }}/></label><p className="mt-2 text-xs text-slate-500">Forrás: {temperatureSource === "manual" ? "kézi" : "időjárási API"} · {weatherNote}</p><div className="mt-4 grid grid-cols-2 gap-3"><Value label="Becsült hőigény" value={recommendation?.estimatedHeatDemandKw == null ? "Nincs igazolt méretezési adat" : `${recommendation.estimatedHeatDemandKw.toFixed(1)} kW`}/><Value label="Ajánlott előremenő" value={recommendation?.recommendedFlowTemperatureC == null ? "Még tanulom" : `${recommendation.recommendedFlowTemperatureC} °C`}/><Value label="Javasolt maximum" value={recommendation?.recommendedBoilerPowerKw == null ? "Nincs adat" : `${recommendation.recommendedBoilerPowerKw} kW`}/><Value label="Megbízhatóság" value={recommendation?.confidence ?? "low"}/></div><p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm">{recommendation?.reason ?? "Adj meg külső hőmérsékletet."}</p></article><article className="card p-5"><h2 className="text-xl font-black">Konfiguráció</h2><p className="mt-3"><b>{source.manufacturer} {source.model}</b> · {source.nominal_power_kw} kW</p><p>Felhasználói teljesítménykorlát: {source.maximum_configurable_power_kw} kW</p><p>PA02: {source.boiler_pa02_max_rods ?? "nincs megadva"} · PA03: {source.boiler_pa03_regulation_mode ?? "nincs megadva"}</p><p>{thermostat.manufacturer} {thermostat.model} · ±{thermostat.switching_sensitivity_c} °C</p></article></section>
    <section className="card mt-3 p-5"><h2 className="text-xl font-black">Fűtési megfigyelés</h2><form onSubmit={addLog} className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-sm font-bold">Dátum<input className="field mt-2" type="date" value={logDate} onChange={event => setLogDate(event.target.value)}/></label><label className="text-sm font-bold">Külső napi átlag<input className="field mt-2" value={outdoor ?? ""} readOnly/></label><input name="indoorMin" type="number" step="0.1" className="field" placeholder="Nappali minimum °C (opcionális)"/><input name="indoorAvg" type="number" step="0.1" className="field" placeholder="Nappali átlag °C (opcionális)"/><input name="flow" type="number" required className="field" placeholder="Előremenő °C" defaultValue={source.current_flow_temperature_c ?? undefined}/><input name="power" type="number" step="0.5" required className="field" placeholder="Max. teljesítmény kW" defaultValue={source.maximum_configurable_power_kw}/><label className="text-sm font-bold">PA02 — fűtőrudak maximuma<select name="pa02" className="field mt-2" defaultValue={source.boiler_pa02_max_rods ?? ""}><option value="">Nincs megadva</option>{[1,2,3,4,5,6].map(value=><option key={value}>{value}</option>)}</select></label><select name="comfort" className="field"><option value="too_cold">Túl hideg</option><option value="comfortable">Kényelmes</option><option value="too_warm">Túl meleg</option></select><input name="notes" className="field" placeholder="Megjegyzés"/><button className="primary sm:col-span-2">Megfigyelés mentése</button></form>{message && <p className="mt-3 text-sm">{message}</p>}</section>
    <WeatherLocationSearch onSaved={refresh} />
    <RadiatorEditor />
    <section className="card mt-3 p-5"><h2 className="text-xl font-black">Korábbi megfigyelések</h2>{logs.length === 0 ? <p className="mt-2 text-sm text-slate-500">Még nincs tanulási adat.</p> : logs.slice(0,10).map((log,index) => <div key={log.id ?? index} className="mt-2 grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3 text-sm sm:grid-cols-5"><b>{log.log_date}</b><span>{log.outdoor_temperature_mean_c} °C</span><span>{log.flow_temperature_c} °C</span><span>{log.boiler_max_power_kw} kW</span><span>{log.comfort_result}</span></div>)}</section>
  </>}</AppShell>;
}
function Value({label,value}:{label:string;value:string}) { return <div className="min-w-0 rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 break-words font-black">{value}</p></div>; }
