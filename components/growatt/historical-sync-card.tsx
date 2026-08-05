"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  budapestDate,
  controlGrowattSyncJob,
  createGrowattSyncJob,
  editGrowattHistoryStartMonth,
  getGrowattSyncJob,
  GROWATT_HISTORY_BLOCK_DELAY_MS,
  growattRetryDelayMs,
  growattRetryDue,
  acquireGrowattProcessRunner,
  mergeGrowattHistoryStartMonth,
  processGrowattSyncJob,
  savedGrowattHistoryStartMonth,
  type GrowattHistoryStartMonthDraft,
  type GrowattJobState,
} from "@/lib/growatt/history-ui";
import { jobProgress, type GrowattJobSelection } from "@/lib/growatt/history-jobs";
import { suppressGrowattLatestRefresh } from "@/lib/growatt/ui";

const labels:Record<GrowattJobSelection,string>={current_month:"Aktuális hónap",previous_month:"Előző lezárt hónap",custom_month:"Egyéni hónap",repair_incomplete:"Hiányos hónapok javítása",full_history:"Teljes előzmény"};

export function GrowattHistoricalSyncCard(){
  const[state,setState]=useState<GrowattJobState>({job:null,historyStartMonth:"2022-01"}),[selection,setSelection]=useState<GrowattJobSelection>("current_month"),[customMonth,setCustomMonth]=useState(budapestDate().slice(0,7)),[historyStartMonth,setHistoryStartMonth]=useState("2022-01"),[error,setError]=useState(""),[busy,setBusy]=useState(false),[showLast,setShowLast]=useState(true);
  const runner=useRef(false),historyStartDraft=useRef<GrowattHistoryStartMonthDraft>({value:"2022-01",initialized:false,dirty:false});

  const load=useCallback(async()=>{try{const next=await getGrowattSyncJob(),merged=mergeGrowattHistoryStartMonth(historyStartDraft.current,next.historyStartMonth);historyStartDraft.current=merged;setState(next);setHistoryStartMonth(merged.value);setError("");return next}catch{setError("A szinkronfolyamat állapota nem tölthető be.");return null}},[]);
  const run=useCallback(async(jobId:string)=>{if(!acquireGrowattProcessRunner(runner))return;try{let current;do{const next=await processGrowattSyncJob(jobId);current=next.job;setState(previous=>({...previous,...next}));suppressGrowattLatestRefresh();if(["running","queued","finalizing_snapshots"].includes(current?.status??""))await wait(GROWATT_HISTORY_BLOCK_DELAY_MS)}while(["running","queued","finalizing_snapshots"].includes(current?.status??""))}catch(value){if(value instanceof Error&&["SYNC_JOB_BUSY","SYNC_BLOCK_ALREADY_RUNNING"].includes(value.message)){await wait(1000);await load()}else setError("A folyamat megállt; a mentett checkpointból folytatható.")}finally{runner.current=false;setBusy(false)}},[load]);

  useEffect(()=>{void load()},[load]);
  useEffect(()=>{const timer=window.setInterval(()=>void load().then(next=>{const job=next?.job;if(job&&growattRetryDue(job))void run(job.id)}),2000);return()=>window.clearInterval(timer)},[load,run]);
  useEffect(()=>{const job=state.job;if(job&&["queued","running","finalizing_snapshots"].includes(job.status))void run(job.id)},[state.job,run]);
  const retryJobId=state.job?.id,retryStatus=state.job?.status,retryAfter=state.job?.retry_after;
  useEffect(()=>{if(!retryJobId||!retryStatus)return;const delay=growattRetryDelayMs({status:retryStatus,retry_after:retryAfter??null});if(delay===null)return;const timer=window.setTimeout(()=>void run(retryJobId),delay);return()=>window.clearTimeout(timer)},[retryJobId,retryStatus,retryAfter,run]);

  async function start(){setBusy(true);setError("");try{const next=await createGrowattSyncJob({selection,customMonth,historyStartMonth});historyStartDraft.current=savedGrowattHistoryStartMonth(historyStartMonth);setState({...next,historyStartMonth});await run(next.job!.id)}catch(value){setError(value instanceof Error&&value.message==="SYNC_ALREADY_RUNNING"?"Már van kezelendő szinkronfolyamat.":"A szinkronfolyamat nem indítható.");setBusy(false)}}
  async function control(action:"pause"|"resume"|"cancel"){if(!state.job)return;try{const next=await controlGrowattSyncJob(state.job.id,action);setState(previous=>({...previous,...next}));if(action==="resume")void run(state.job.id)}catch(value){const code=value instanceof Error?value.message:"";setError(code==="SYNC_JOB_BUSY"?"A futó blokk befejezésére várunk.":code==="RETRY_NOT_READY"?"A következő próbálkozási idő még nem érkezett el.":"A művelet nem hajtható végre.")}}
  function editStartMonth(value:string){const edited=editGrowattHistoryStartMonth(historyStartDraft.current,value);historyStartDraft.current=edited;setHistoryStartMonth(edited.value)}

  const job=state.job,progress=job?jobProgress(job):0,retryReady=!job?.retry_after||Date.parse(job.retry_after)<=Date.now();
  return <section className="mt-4 rounded-2xl border border-slate-200 p-4"><h3 className="font-black">Historikus termelési backfill</h3><p className="mt-1 text-xs text-slate-500">Tartós, újraindítható feldolgozás, szekvenciális, legfeljebb 7 napos Growatt blokkokkal és konzervatív blokk-közi várakozással.</p>
    {!job&&<>{state.lastFinishedJob&&<div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm"><button className="font-bold" onClick={()=>setShowLast(value=>!value)}>{showLast?"Előző futás elrejtése":"Előző futás megjelenítése"}</button>{showLast&&<FinishedSummary job={state.lastFinishedJob}/>}</div>}<label className="mt-4 block text-sm font-bold">Tartomány<select className="field mt-1" value={selection} onChange={event=>setSelection(event.target.value as GrowattJobSelection)}>{Object.entries(labels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>{selection==="custom_month"&&<label className="mt-3 block text-sm font-bold">Egyéni hónap<input className="field mt-1" type="month" value={customMonth} onChange={event=>setCustomMonth(event.target.value)}/></label>}<label className="mt-3 block text-sm font-bold">Teljes előzmény kezdő hónapja<input className="field mt-1" type="month" min="1900-01" value={historyStartMonth} onChange={event=>editStartMonth(event.target.value)}/></label><button className="primary mt-3" disabled={busy} onClick={()=>void start()}>{busy?"Indítás…":"Backfill indítása"}</button></>}
    {job&&<div className="mt-4 space-y-3"><p className="font-bold">{job.status==="finalizing_snapshots"?"Havi snapshotok véglegesítése":"Growatt-adatok feldolgozása"}</p><div className="h-3 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-emerald-600" style={{width:`${progress}%`}}/></div><p className="font-bold">{progress}% · {job.completed_days}/{job.total_days} nap</p><dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4"><Metric label="Állapot" value={status(job.status)}/><Metric label="Aktuális blokk" value={job.current_chunk_start?`${job.current_chunk_start} – ${job.current_chunk_end}`:"Checkpoint mentve"}/><Metric label="Már rendezett nap" value={String(job.already_complete_days)}/><Metric label="Frissített nap" value={String(job.refreshed_days)}/><Metric label="Függő snapshot hónap" value={String(job.snapshot_pending_months?.length??0)}/><Metric label="Sikeres snapshot hónap" value={String(job.snapshot_refreshed_months?.length??0)}/><Metric label="Sikertelen/kihagyott" value={String(Object.values(job.snapshot_month_results??{}).filter(value=>value.status!=="refreshed").length)}/><Metric label="Utolsó aktivitás" value={budapestInstant(job.last_activity_at)}/></dl><SnapshotResults results={job.snapshot_month_results??{}}/>{job.retry_after&&<p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Következő próbálkozás: {budapestInstant(job.retry_after)}</p>}<div className="flex flex-wrap gap-2">{["queued","running","finalizing_snapshots"].includes(job.status)&&<button className="secondary" onClick={()=>void control("pause")}>Megszakítás</button>}{["paused","failed"].includes(job.status)&&<button className="primary" onClick={()=>void control("resume")}>Újrapróbálás / Folytatás</button>}{["rate_limited","retry_pending"].includes(job.status)&&<button className="primary" disabled={!retryReady} onClick={()=>void control("resume")}>Szinkron újrapróbálása</button>}{["paused","rate_limited","retry_pending","failed","finalizing_snapshots"].includes(job.status)&&<button className="secondary text-red-700" onClick={()=>void control("cancel")}>Leállítás</button>}</div></div>}
    {error&&<p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
  </section>;
}

const wait=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const status=(value:string)=>({queued:"Várakozik",running:"Fut",rate_limited:"Rate limit",paused:"Megszakítva",retry_pending:"Újrapróbálásra vár",finalizing_snapshots:"Havi snapshotok véglegesítése",completed:"Kész",failed:"Beavatkozást igényel",cancelling:"Leállítás folyamatban",cancelled:"Leállítva"}[value]??value);
const budapestInstant=(value:string)=>new Intl.DateTimeFormat("hu-HU",{dateStyle:"medium",timeStyle:"short",timeZone:"Europe/Budapest"}).format(new Date(value));
function SnapshotResults({results}:{results:Record<string,{status:"refreshed"|"skipped"|"failed";reason?:string}>}){const rows=Object.entries(results).filter(([,result])=>result.status!=="refreshed");return rows.length?<ul className="space-y-1 text-sm text-amber-900">{rows.map(([month,result])=><li key={month}>{month}: {result.status==="skipped"?`kihagyva – ${reason(result.reason)}`:`hiba – ${reason(result.reason)}`}</li>)}</ul>:null}
const reason=(value?:string)=>({missing_pv_data:"Nincs Growatt-termelési adat.",incomplete_pv_coverage:"A Growatt napi lefedettsége hiányos.",incomplete_meter_coverage:"A villanyórás havi lefedettség hiányos.",period_mismatch:"A Growatt- és villanyórás időszak nem egyezik.",inconsistent_inputs:"A havi bemeneti adatok nem konzisztensek.",database_write_failed:"A snapshot mentése nem sikerült.",database_delete_failed:"A korábbi elavult snapshot törlése nem sikerült.",SNAPSHOT_REFRESH_FAILED:"Átmeneti snapshot-hiba."}[value??""]??value??"Ismeretlen ok.");
function FinishedSummary({job}:{job:NonNullable<GrowattJobState["lastFinishedJob"]>}){const skipped=Object.entries(job.snapshot_month_results??{}).filter(([,value])=>value.status==="skipped");return <div className="mt-2 space-y-1"><p>{job.start_date} – {job.end_date}; {job.completed_days}/{job.total_days} nap, {job.refreshed_days} frissítve.</p><p>{job.snapshot_refreshed_months?.length??0} sikeres snapshot; {skipped.length} kihagyva; {job.snapshot_failed_months?.length??0} technikai hiba.</p>{skipped.map(([month,value])=><p key={month}>{month}: {reason(value.reason)}</p>)}{job.completed_at&&<p>Befejezés: {budapestInstant(job.completed_at)}</p>}</div>}
function Metric({label,value}:{label:string;value:string}){return <div className="rounded-xl bg-slate-50 p-3"><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 break-words font-bold">{value}</dd></div>}
