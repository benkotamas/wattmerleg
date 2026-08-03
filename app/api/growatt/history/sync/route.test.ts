import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GrowattError } from "@/lib/growatt/errors";
const state = vi.hoisted(() => ({ access: "allowed" as "allowed"|"unauthenticated"|"forbidden"|"not_configured", sync: vi.fn() }));
vi.mock("server-only",()=>({}));
vi.mock("@/lib/growatt/history-route",()=>({growattHistoryRouteContext:async()=>state.access==="allowed"?{access:"allowed",userId:"owner-from-session",client:{}}:{access:state.access}}));
vi.mock("@/lib/growatt/historical-sync",()=>({syncGrowattHistory:(options:unknown)=>state.sync(options),withGrowattSyncLock:async(_user:string,operation:()=>Promise<unknown>)=>operation()}));
import { POST } from "./route";

const request=(body:unknown)=>new NextRequest("http://localhost/api/growatt/history/sync",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
const success={ok:true,partial:false,startDate:"2026-08-01",endDate:"2026-08-02",requestedDays:2,receivedValidDays:2,upsertedDays:2,missingDays:0,invalidRecords:0,duplicateRecords:0,receivedDays:2,insertedOrUpdatedDays:2,chunks:1,successfulChunks:1,failedChunks:[],retryRanges:[],completedAt:"2026-08-03T10:00:00Z"};
describe("POST Growatt history sync",()=>{
  beforeEach(()=>{state.access="allowed";state.sync.mockReset().mockResolvedValue(success)});
  it("session nélkül 401, idegen usernek 403",async()=>{state.access="unauthenticated";expect((await POST(request({startDate:"2026-08-01",endDate:"2026-08-02"}))).status).toBe(401);state.access="forbidden";expect((await POST(request({startDate:"2026-08-01",endDate:"2026-08-02"}))).status).toBe(403)});
  it("hibás body 400",async()=>expect((await POST(request({startDate:"bad",endDate:"2026-08-02"}))).status).toBe(400));
  it("a session userét használja, sikeres választ érzékeny adat nélkül ad",async()=>{const response=await POST(request({startDate:"2026-08-01",endDate:"2026-08-02",userId:"untrusted"}));expect(response.status).toBe(200);expect(state.sync).toHaveBeenCalledWith(expect.objectContaining({userId:"owner-from-session"}));const text=await response.text();expect(text).not.toMatch(/untrusted|plantId|deviceId|serial|token/i)});
  it("részleges sync 207",async()=>{state.sync.mockResolvedValue({...success,ok:false,partial:true,successfulChunks:0,failedChunks:[{startDate:"2026-08-01",endDate:"2026-08-02",code:"GROWATT_TIMEOUT"}],retryRanges:[{startDate:"2026-08-01",endDate:"2026-08-02"}]});expect((await POST(request({startDate:"2026-08-01",endDate:"2026-08-02"}))).status).toBe(207)});
  it.each([["GROWATT_RATE_LIMITED",429],["GROWATT_TIMEOUT",503]] as const)("%s normalizált hiba",async(code,status)=>{state.sync.mockRejectedValue(new GrowattError(code,status));const response=await POST(request({startDate:"2026-08-01",endDate:"2026-08-02"}));expect(response.status).toBe(status);await expect(response.json()).resolves.toMatchObject({error:{code}})});
  it("túl hosszú tartományt 400-zal ad tovább",async()=>{state.sync.mockRejectedValue(new Error("DATE_RANGE_TOO_LONG"));expect((await POST(request({startDate:"2026-01-01",endDate:"2026-08-02"}))).status).toBe(400)});
});
