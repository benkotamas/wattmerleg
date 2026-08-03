import { describe, expect, it } from "vitest";
import { classifySnapshotBackfill, retryDecision, validYearMonth } from "./history-jobs";
describe("Growatt job snapshot finalization",()=>{
  it("a skipped hónap nem sikeres és megőrzi az okát",()=>expect(classifySnapshotBackfill("2026-01",true,{createdOrUpdatedMonths:0,unchangedMonths:0,skippedMonths:1,failedMonths:0,details:[{yearMonth:"2026-01",status:"skipped",reason:"insufficient_pv_coverage"}]})).toEqual({status:"skipped",reason:"insufficient_pv_coverage"}));
  it("az unchanged pontosan egyező hónap siker",()=>expect(classifySnapshotBackfill("2026-01",true,{createdOrUpdatedMonths:0,unchangedMonths:1,skippedMonths:0,failedMonths:0,details:[{yearMonth:"2026-01",status:"unchanged"}]})).toEqual({status:"refreshed"}));
  it("technikai vagy inkonzisztens válasz retryable hiba",()=>expect(classifySnapshotBackfill("2026-01",false,{failedMonths:1})).toEqual({status:"failed",reason:"SNAPSHOT_REFRESH_FAILED"}));
  it("a hónapvalidáció 1900-tól enged",()=>{expect(validYearMonth("1900-01")).toBe(true);expect(validYearMonth("1899-12")).toBe(false);expect(validYearMonth("2026-13")).toBe(false)});
  it("30 mp, 2 perc, 5 perc, 15 perc és 1 óra backoffot ad, majd failed",()=>{expect([0,1,2,3,4].map(count=>retryDecision(count,0).delaySeconds)).toEqual([30,120,300,900,3600]);expect(retryDecision(3,0).failed).toBe(false);expect(retryDecision(4,0).failed).toBe(true)});
});
