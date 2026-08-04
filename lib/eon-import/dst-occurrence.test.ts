import {describe,expect,it} from "vitest";
import * as XLSX from "xlsx";
import {parseEonWorkbook} from "./parser";
function book(rows:unknown[][],total:[number,number]){const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([["Dátum/Idő","+A","-A"],["MAXIMUM ÉRTÉK",...total],["ÖSSZEG",...total],...rows]),"Adatok");return XLSX.write(wb,{type:"buffer",bookType:"xlsx"}) as Buffer}
const parse=(rows:unknown[][],total:[number,number]=[1,1])=>parseEonWorkbook(book(rows,total),{referenceDate:"2026-10-26"});
describe("E.ON DST occurrence foglalás",()=>{
  it("az első üres őszi 02:00 lefoglalja az első UTC-helyet",()=>{const x=parse([["2026.10.25 02:00",null,null],["2026.10.25 02:00",1,1]]);expect(x.intervals).toHaveLength(1);expect(x.intervals[0].intervalStartUtc).toBe("2026-10-25T01:00:00.000Z")});
  it("az első kitöltött és második üres sor is külön helyet foglal",()=>{const x=parse([["2026.10.25 02:00",1,1],["2026.10.25 02:00",null,null]]);expect(x.intervals[0].intervalStartUtc).toBe("2026-10-25T00:00:00.000Z");expect(x.blockingErrors).not.toContain("EON_DUPLICATE_INTERVAL")});
  it("két üres őszi 02:00 nem duplikáció",()=>{const x=parse([["2026.10.25 02:00",null,null],["2026.10.25 02:00",null,null]],[0,0]);expect(x.blockingErrors).not.toContain("EON_DUPLICATE_INTERVAL");expect(x.days[0].rawIntervalCount).toBe(2)});
  it("a harmadik őszi occurrence duplikáció",()=>{const x=parse([["2026.10.25 02:00",null,null],["2026.10.25 02:00",null,null],["2026.10.25 02:00",1,1]]);expect(x.blockingErrors).toContain("EON_DUPLICATE_INTERVAL")});
  it("a nem létező tavaszi 02:00 üres értékekkel is hibás dátum",()=>{const x=parseEonWorkbook(book([["2026.03.29 02:00",null,null]],[0,0]),{referenceDate:"2026-03-30"});expect(x.blockingErrors).toContain("EON_INVALID_DATE")});
  it("normál napon az üres első sor is lefoglalja az egyetlen helyet",()=>{const x=parse([["2026.08.02 02:00",null,null],["2026.08.02 02:00",1,1]]);expect(x.blockingErrors).toContain("EON_DUPLICATE_INTERVAL");expect(x.intervals).toHaveLength(0)});
});
