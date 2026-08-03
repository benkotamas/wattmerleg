import { describe, expect, it } from "vitest";
import { chunkGrowattDateRange, dailyDatabaseRow, mapGrowattDailyEnergy, missingGrowattDateRanges, summarizeGrowattMonth, validateGrowattDateRange, type GrowattDailyEnergyRow } from "./historical";

describe("Growatt napi historikus mapper", () => {
  const map = (energy: unknown, date = "2026-08-02", currentLocalDate = "2026-08-03") => mapGrowattDailyEnergy({ time_unit: "day", count: 1, energys: [{ date, energy }] }, { timezone: "Europe/Budapest", currentLocalDate, fetchedAt: "2026-08-03T10:00:00Z" });
  it("numeric stringet és numbert fogad", () => { expect(map("12.5").rows[0].energyKwh).toBe(12.5); expect(map(13).rows[0].energyKwh).toBe(13); });
  it("a valódi 0 kWh rekordot megtartja", () => expect(map(0).rows).toHaveLength(1));
  it("negatív, NaN és hibás dátum rekordot elutasít", () => { expect(map(-1).invalidRecords).toBe(1); expect(map("NaN").invalidRecords).toBe(1); expect(map(1, "2026-02-31").invalidRecords).toBe(1); });
  it("azonos dátumnál az utolsó érvényes rekord nyer és duplikációt számol", () => { const result=mapGrowattDailyEnergy({time_unit:"day",energys:[{date:"2026-08-02",energy:1},{date:"2026-08-02",energy:2}]},{timezone:"Europe/Budapest",currentLocalDate:"2026-08-03",fetchedAt:"x"});expect(result.rows).toHaveLength(1);expect(result.rows[0].energyKwh).toBe(2);expect(result.duplicateRecords).toBe(1); });
  it("aktuális helyi nap provisional, korábbi nap complete", () => { expect(map(1, "2026-08-03").rows[0].qualityStatus).toBe("provisional"); expect(map(1).rows[0].qualityStatus).toBe("complete"); });
  it("érvénytelen timezone biztonságos fallbacket kap és a mapper megőrzi", () => { const mapped=mapGrowattDailyEnergy({time_unit:"day",energys:[{date:"2026-08-02",energy:1}]},{timezone:"invalid/zone",currentLocalDate:"2026-08-03",fetchedAt:"x"});expect(mapped.rows[0].plantTimezone).toBe("Europe/Budapest");expect(dailyDatabaseRow(mapped.rows[0], "user").plant_timezone).toBe("Europe/Budapest") });
});

describe("Growatt dátumtartomány és chunking", () => {
  it.each([["2026-01-01","2026-01-01",1],["2026-01-01","2026-01-07",1],["2026-01-01","2026-01-08",2]])("%s–%s tartomány %s blokk", (start,end,count) => expect(chunkGrowattDateRange(start,end)).toHaveLength(count));
  it("28 napot elfogad és pontosan négy 7 napos blokkra bont", () => { expect(validateGrowattDateRange("2026-07-07","2026-08-03","2026-08-03")).toBe(28); expect(chunkGrowattDateRange("2026-07-07","2026-08-03")).toHaveLength(4); });
  it("29 napot és jövőbeli napot tilt", () => { expect(() => validateGrowattDateRange("2026-07-06","2026-08-03","2026-08-03")).toThrow("DATE_RANGE_TOO_LONG"); expect(() => validateGrowattDateRange("2026-08-04","2026-08-04","2026-08-03")).toThrow("FUTURE_DATE"); });
  it("DST környékén helyi naptári napokat nem órákat darabol", () => expect(chunkGrowattDateRange("2026-03-27","2026-04-03")).toEqual([{ startDate:"2026-03-27",endDate:"2026-04-02"},{startDate:"2026-04-03",endDate:"2026-04-03"}]));
  it("a hiányzó napokból csak összefüggő tartományokat képez",()=>expect(missingGrowattDateRanges("2026-08-01","2026-08-07",["2026-08-01","2026-08-04","2026-08-07"])).toEqual([{startDate:"2026-08-02",endDate:"2026-08-03"},{startDate:"2026-08-05",endDate:"2026-08-06"}]));
});

describe("Growatt havi coverage", () => {
  const row = (date:string, energy:number, qualityStatus:"complete"|"provisional"="complete"):GrowattDailyEnergyRow=>({localDate:date,energyKwh:energy,qualityStatus,plantTimezone:"Europe/Budapest",fetchedAt:"x",apiLastUpdateAt:null});
  it("0 kWh nap rekord, a hiányzó nap viszont nem nulla rekord", () => { const result=summarizeGrowattMonth([row("2026-08-01",0)],"2026-08-01","2026-08-02","2026-08-02");expect(result.recordCount).toBe(1);expect(result.totalEnergyKwh).toBe(0);expect(result.coverageRatio).toBe(.5); });
  it("provisional aktuális hónap folyamatban, hiányos hónap részleges", () => { expect(summarizeGrowattMonth([row("2026-08-03",1,"provisional")],"2026-08-03","2026-08-03","2026-08-03").status).toBe("in_progress"); expect(summarizeGrowattMonth([],"2026-08-01","2026-08-03","2026-08-03").status).toBe("partial"); });
});
