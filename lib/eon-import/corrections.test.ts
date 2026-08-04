import {describe,expect,it,vi} from "vitest";
import * as XLSX from "xlsx";
import {parseEonWorkbook} from "./parser";
import {aggregateEonIntervals} from "./aggregation";
import {importEonWorkbook} from "./import-service";

function book(data:unknown[][]){const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([["Dátum/Idő","+A","-A"],...data]),"Adatok");return XLSX.write(wb,{type:"buffer",bookType:"xlsx"}) as Buffer}
const summaries:unknown[][]=[["MAXIMUM ÉRTÉK",1,1],["ÖSSZEG",1,1]];

describe("E.ON parser adatminőség",()=>{
  it.each([["hibás", "EON_INVALID_DATE"],["2026.08.02 00:07","EON_INVALID_INTERVAL"]])("blokkolja a hibás időcellát: %s",(cell,code)=>{const x=parseEonWorkbook(book([...summaries,[cell,1,1]]),{referenceDate:"2026-08-03"});expect(x.invalidRows).toBe(1);expect(x.blockingErrors).toContain(code)});
  it.each([[1,null],[null,1]])("blokkolja a félig üres energiaértéket",(plus,minus)=>{const x=parseEonWorkbook(book([...summaries,["2026.08.02 00:00",plus,minus]]),{referenceDate:"2026-08-03"});expect(x.invalidRows).toBe(1);expect(x.blockingErrors).toContain("EON_PARTIAL_INTERVAL_VALUE")});
  it("mindkét üres értéket provisional/incomplete állapotként őrzi",()=>{const current=parseEonWorkbook(book([["MAXIMUM ÉRTÉK",0,0],["ÖSSZEG",0,0],["2026.08.03 00:00",null,null]]),{referenceDate:"2026-08-03"}),past=parseEonWorkbook(book([["MAXIMUM ÉRTÉK",0,0],["ÖSSZEG",0,0],["2026.08.02 00:00",null,null]]),{referenceDate:"2026-08-03"});expect(current.days[0].status).toBe("provisional");expect(past.days[0].status).toBe("incomplete");expect(current.intervals).toHaveLength(0)});
  it("blokkolja a jövőbeli napot",()=>{const x=parseEonWorkbook(book([...summaries,["2026.08.04 00:00",1,1]]),{referenceDate:"2026-08-03"});expect(x.blockingErrors).toContain("EON_FUTURE_INTERVAL_DATE")});
  it("blokkolja a hibás és duplikált summary sort",()=>{const invalid=parseEonWorkbook(book([["MAXIMUM ÉRTÉK",1,null],["ÖSSZEG",1,1],["2026.08.02 00:00",1,1]]),{referenceDate:"2026-08-03"}),duplicate=parseEonWorkbook(book([["MAXIMUM ÉRTÉK",1,1],["MAXIMUM ÉRTÉK",1,1],["ÖSSZEG",1,1],["2026.08.02 00:00",1,1]]),{referenceDate:"2026-08-03"});expect(invalid.blockingErrors).toContain("EON_INVALID_SUMMARY_ROW");expect(duplicate.blockingErrors).toContain("EON_DUPLICATE_SUMMARY_ROW")});
});

describe("E.ON coverage",()=>{
  it("a teljesen hiányzó köztes napot is előállítja",()=>{const rows=[{localDate:"2026-08-01",intervalStartUtc:"2026-07-31T22:00:00Z",importKwh:1,exportKwh:0},{localDate:"2026-08-03",intervalStartUtc:"2026-08-02T22:00:00Z",importKwh:1,exportKwh:0}],days=aggregateEonIntervals(rows,"2026-08-01","2026-08-03");expect(days).toHaveLength(3);expect(days[1]).toMatchObject({localDate:"2026-08-02",validNonNullIntervalCount:0,status:"incomplete",importSumKwh:null})});
  it("a nulla soros referencia-nap provisional",()=>expect(aggregateEonIntervals([],"2026-08-03","2026-08-03","2026-08-03")[0]).toMatchObject({status:"provisional",expectedIntervalCount:96}));
  it.each([["2026-03-29",92],["2026-08-02",96],["2026-10-25",100]])("%s naphoz %s intervallumot vár",(date,count)=>expect(aggregateEonIntervals([],date,date)[0].expectedIntervalCount).toBe(count));
});

describe("E.ON admin import szerződés",()=>{
  it("átadja a cél usert az RPC-nek",async()=>{const rpc=vi.fn().mockResolvedValue({data:{batch_id:"b",inserted_rows:1,updated_rows:0,unchanged_rows:0},error:null});await importEonWorkbook({userId:"target-user",bytes:book([...summaries,["2026.08.03 00:00",1,1]]),source:"eon_portal_export",referenceDate:"2026-08-03",client:{rpc}});expect(rpc).toHaveBeenCalledWith("import_eon_interval_batch",expect.objectContaining({target_user_id:"target-user"}))});
  it("blokkoló parserhiba esetén nem hív RPC-t",async()=>{const rpc=vi.fn();await expect(importEonWorkbook({userId:"u",bytes:book([...summaries,["hibás",1,1]]),source:"eon_portal_export",referenceDate:"2026-08-03",client:{rpc}})).rejects.toMatchObject({code:"EON_INVALID_DATE"});expect(rpc).not.toHaveBeenCalled()});
});
