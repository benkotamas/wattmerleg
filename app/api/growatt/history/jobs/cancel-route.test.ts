import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const state=vi.hoisted(()=>({status:"running",claim:null as string|null,lease:null as string|null,rpc:vi.fn()}));
vi.mock("server-only",()=>({}));
vi.mock("@/lib/growatt/history-route",()=>({growattHistoryRouteContext:async()=>({access:"allowed",userId:"owner",client:client()})}));
function query(){const value={data:{id:"job",status:state.status,claim_token:state.claim,lease_expires_at:state.lease,retry_after:null},error:null};const chain:Record<string,unknown>={then:(resolve:(input:typeof value)=>unknown)=>Promise.resolve(resolve(value))};for(const name of["select","eq","single"])chain[name]=()=>chain;return chain}
function client(){return{from:()=>query(),rpc:state.rpc}}
import{PATCH}from"./route";
const request=()=>new NextRequest("http://localhost/api/growatt/history/jobs",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({id:"job",action:"cancel"})});
describe("atomic Growatt job cancel route",()=>{beforeEach(()=>{state.status="running";state.claim=null;state.lease=null;state.rpc.mockReset().mockImplementation(async(_name:string,args:Record<string,unknown>)=>{if(args.expected_status!==state.status)return{data:[],error:null};const live=Boolean(state.claim&&state.lease&&Date.parse(state.lease)>Date.now());return{data:[{id:"job",status:live?"cancelling":"cancelled",claim_token:live?state.claim:null,lease_expires_at:live?state.lease:null,current_chunk_start:live?"2026-01-01":null,current_chunk_end:live?"2026-01-07":null}],error:null}})});
it.each(["running","finalizing_snapshots"])("%s claim nélkül azonnal cancelled",async status=>{state.status=status;const response=await PATCH(request());expect(response.status).toBe(200);await expect(response.json()).resolves.toMatchObject({job:{status:"cancelled"}})});
it("élő claim mellett cancelling",async()=>{state.claim="claim";state.lease=new Date(Date.now()+60_000).toISOString();await expect((await PATCH(request())).json()).resolves.toMatchObject({job:{status:"cancelling"}})});
it("lejárt claim mellett cancelled és a koordinációs mezők törlődnek",async()=>{state.claim="old";state.lease=new Date(Date.now()-1000).toISOString();const body=await(await PATCH(request())).json();expect(body).toMatchObject({job:{status:"cancelled",current_chunk_start:null,current_chunk_end:null}});expect(body.job).not.toHaveProperty("claim_token");expect(body.job).not.toHaveProperty("lease_expires_at")});
it("stale státusz 409",async()=>{state.rpc.mockResolvedValue({data:[],error:null});expect((await PATCH(request())).status).toBe(409)});
});
