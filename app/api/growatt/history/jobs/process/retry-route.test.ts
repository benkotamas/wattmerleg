import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const state=vi.hoisted(()=>({sync:vi.fn(),rpc:vi.fn(),retryAfter:""}));
vi.mock("server-only",()=>({}));
vi.mock("@/lib/growatt/history-route",()=>({growattHistoryRouteContext:async()=>({access:"allowed",userId:"owner",client:{from:()=>query(),rpc:state.rpc}})}));
vi.mock("@/lib/growatt/historical-sync",()=>({syncGrowattHistory:(options:unknown)=>state.sync(options)}));
vi.mock("@/app/api/solar/monthly-snapshots/backfill/route",()=>({POST:vi.fn()}));
vi.mock("@/lib/weather/date",async original=>({...await original<Record<string,unknown>>(),localIsoDate:()=>"2026-02-01"}));

function query(){const value={data:{id:"11111111-1111-4111-8111-111111111111",selection_type:"full_history",start_date:"2022-01-01",end_date:"2026-01-31",cursor_date:"2023-01-01",status:"rate_limited",claim_token:null,lease_expires_at:null,retry_after:state.retryAfter},error:null},chain:Record<string,unknown>={then:(resolve:(input:typeof value)=>unknown)=>Promise.resolve(resolve(value))};for(const name of["select","eq","single"])chain[name]=()=>chain;return chain}
import { POST } from "./route";

describe("Growatt history retry gate",()=>{
  beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));state.retryAfter="2026-01-01T00:05:00Z";state.sync.mockReset();state.rpc.mockReset()});
  it("retry_after előtt nem kér új Growatt blokkot",async()=>{const response=await POST(new NextRequest("http://localhost/api/growatt/history/jobs/process",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({id:"11111111-1111-4111-8111-111111111111"})}));expect(response.status).toBe(429);expect(response.headers.get("Retry-After")).toBe("300");expect(state.sync).not.toHaveBeenCalled();expect(state.rpc).not.toHaveBeenCalled();vi.useRealTimers()});
});
