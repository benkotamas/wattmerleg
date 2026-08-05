import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import{addLocalDays}from"@/lib/growatt/historical";
const state=vi.hoisted(()=>({coverage:[]as{localDate:string;qualityStatus:"complete"|"provisional"|"missing"|"invalid";plantTimezone:string|null}[],inserted:null as Record<string,unknown>|null}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/weather/date",async original=>({...await original<Record<string,unknown>>(),localIsoDate:()=>"2026-08-05"}));
vi.mock("@/lib/growatt/coverage",()=>({readGrowattCoverage:async()=>state.coverage}));
vi.mock("@/lib/growatt/history-route", () => ({ growattHistoryRouteContext: async () => ({ access: "allowed", userId: "owner", client: client() }) }));
import { PATCH, POST } from "./route";

function client(){return{from(table:string){if(!table)throw new Error("TABLE_REQUIRED");let inserted:Record<string,unknown>|null=null;const query={select(){return query},eq(){return query},in(){return query},order(){return query},limit(){return query},upsert(){return Promise.resolve({error:null})},insert(value:Record<string,unknown>){inserted=value;state.inserted=value;return query},maybeSingle(){return Promise.resolve({data:null,error:null})},single(){return Promise.resolve({data:{id:"job",...inserted},error:null})}};return query}}}

const request = (method: "POST" | "PATCH", body: unknown, raw = false) => new NextRequest("http://localhost/api/growatt/history/jobs", { method, headers: { "content-type": "application/json" }, body: raw ? String(body) : JSON.stringify(body) });
describe("Growatt history jobs body validation", () => {
  it.each([null, [], {}])("POST rejects null/array/incomplete body: %j", async body => expect((await POST(request("POST", body))).status).toBe(400));
  it("POST rejects malformed JSON", async () => expect((await POST(request("POST", "{", true))).status).toBe(400));
  it("creates a 1678-day job with all paginated satisfied coverage counted",async()=>{state.coverage=Array.from({length:1678},(_,index)=>{const localDate=addLocalDays("2022-01-01",index);return{localDate,qualityStatus:localDate>="2024-10-01"&&localDate<="2025-07-31"?"missing"as const:localDate==="2026-08-05"?"provisional"as const:"complete"as const,plantTimezone:"Europe/Budapest"}});state.inserted=null;const response=await POST(request("POST",{selection:"full_history",historyStartMonth:"2022-01"}));expect(response.status).toBe(201);expect(state.inserted).toMatchObject({total_days:1678,already_complete_days:1374,completed_days:1374})});
  it.each([null, [], {}, { id: "", action: "resume" }, { id: "job", action: "unknown" }])("PATCH rejects invalid body: %j", async body => expect((await PATCH(request("PATCH", body))).status).toBe(400));
  it("PATCH rejects malformed JSON", async () => expect((await PATCH(request("PATCH", "{", true))).status).toBe(400));
});
