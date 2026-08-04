import {describe,expect,it} from "vitest";
import * as XLSX from "xlsx";
import {parseEonWorkbook} from "./parser";
function book(rows:unknown[][]){const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([["Dátum/Idő","+A","-A"],...rows]),"Adatok");return XLSX.write(wb,{type:"buffer",bookType:"xlsx"}) as Buffer}
describe("E.ON intervallummentes workbook",()=>{
  it("csak fejléc esetén blokkol",()=>{const x=parseEonWorkbook(book([]),{referenceDate:"2026-08-04"});expect(x).toMatchObject({rawRows:0,periodStart:null,periodEnd:null});expect(x.blockingErrors).toContain("EON_NO_INTERVAL_DATA")});
  it("nullás summary intervallum nélkül is blokkol",()=>{const x=parseEonWorkbook(book([["MAXIMUM ÉRTÉK",0,0],["ÖSSZEG",0,0]]),{referenceDate:"2026-08-04"});expect(x.blockingErrors).toContain("EON_NO_INTERVAL_DATA")});
  it("teljesen üres munkalap kontrollált hibát ad",()=>{const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([]),"Adatok");expect(()=>parseEonWorkbook(XLSX.write(wb,{type:"buffer",bookType:"xlsx"}))).toThrowError(expect.objectContaining({code:"EON_NO_INTERVAL_DATA"}))});
  it("dátumozott, mindkét értékében üres aktuális sor provisional",()=>{const x=parseEonWorkbook(book([["MAXIMUM ÉRTÉK",0,0],["ÖSSZEG",0,0],["2026.08.04 00:00",null,null]]),{referenceDate:"2026-08-04"});expect(x.blockingErrors).not.toContain("EON_NO_INTERVAL_DATA");expect(x.days[0].status).toBe("provisional")});
  it("szabályos intervallum továbbra is elfogadható",()=>{const x=parseEonWorkbook(book([["MAXIMUM ÉRTÉK",1,1],["ÖSSZEG",1,1],["2026.08.03 00:00",1,1]]),{referenceDate:"2026-08-04"});expect(x.blockingErrors).toEqual([]);expect(x.validRows).toBe(1)});
});
