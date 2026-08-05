import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  editGrowattHistoryStartMonth,
  GROWATT_HISTORY_BLOCK_DELAY_MS,
  acquireGrowattProcessRunner,
  growattRetryDelayMs,
  growattRetryDue,
  mergeGrowattHistoryStartMonth,
  type GrowattHistoryStartMonthDraft,
} from "@/lib/growatt/history-ui";
import { GrowattHistoricalSyncCard } from "./historical-sync-card";

describe("Growatt tartós backfill UI",()=>{
  afterEach(()=>vi.useRealTimers());
  it("az öt tartományválasztást és külön kezdő hónapot mutatja",()=>{const html=renderToStaticMarkup(<GrowattHistoricalSyncCard/>);for(const text of["Aktuális hónap","Előző lezárt hónap","Egyéni hónap","Hiányos hónapok javítása","Teljes előzmény","Teljes előzmény kezdő hónapja"])expect(html).toContain(text)});
  it("nem jelenít meg 28 napos felhasználói korlátot",()=>{const html=renderToStaticMarkup(<GrowattHistoricalSyncCard/>);expect(html).not.toContain("maximum 28 nap");expect(html).toContain("legfeljebb 7 napos Growatt blokkokkal")});
  it("az első betöltés átveszi az adatbázis kezdő hónapját",()=>{const initial:GrowattHistoryStartMonthDraft={value:"2022-01",initialized:false,dirty:false};expect(mergeGrowattHistoryStartMonth(initial,"2024-03")).toEqual({value:"2024-03",initialized:true,dirty:false})});
  it("polling közben nem írja felül a szerkesztett kezdő hónapot",()=>{const initial=mergeGrowattHistoryStartMonth({value:"2022-01",initialized:false,dirty:false},"2022-01"),edited=editGrowattHistoryStartMonth(initial,"2025-06");expect(mergeGrowattHistoryStartMonth(edited,"2022-01")).toEqual(edited)});
  it("legalább tíz másodpercet vár két sikeres Growatt blokk között",()=>expect(GROWATT_HISTORY_BLOCK_DELAY_MS).toBe(10_000));
  it("a retry_after időpontig nem indít automatikus újrapróbálást",()=>{vi.useFakeTimers();vi.setSystemTime(1_000);const callback=vi.fn(),delay=growattRetryDelayMs({status:"rate_limited",retry_after:new Date(5_000).toISOString()})!;setTimeout(callback,delay);vi.advanceTimersByTime(delay-1);expect(callback).not.toHaveBeenCalled();vi.advanceTimersByTime(1);expect(callback).toHaveBeenCalledOnce()});
  it("a polling watchdog esedékes retry esetén folytatást kér",()=>{const job={status:"rate_limited" as const,retry_after:"2026-08-05T13:23:00Z"};expect(growattRetryDue(job,Date.parse("2026-08-05T13:22:59Z"))).toBe(false);expect(growattRetryDue(job,Date.parse("2026-08-05T13:23:00Z"))).toBe(true)});
  it("párhuzamos process futást a szinkron runner lock blokkol",()=>{const lock={current:false};expect(acquireGrowattProcessRunner(lock)).toBe(true);expect(acquireGrowattProcessRunner(lock)).toBe(false);lock.current=false;expect(acquireGrowattProcessRunner(lock)).toBe(true)});
  it("a polling nem a teljes job objektumra ütemezi újra a retry timert",()=>{const source=readFileSync("components/growatt/historical-sync-card.tsx","utf8");expect(source).toContain("[retryJobId,retryStatus,retryAfter,run]");expect(source).toContain("growattRetryDue(job)")});
  it("egyértelmű szinkron retry feliratot használ",()=>{const source=readFileSync("components/growatt/historical-sync-card.tsx","utf8");expect(source).toContain("Szinkron újrapróbálása");expect(source).not.toContain("Snapshot / szinkron újrapróbálása")});
});
