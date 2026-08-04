import{readFileSync}from"node:fs";import{describe,expect,it}from"vitest";
const sql=readFileSync("supabase/migrations/013_eon_dst_period_overview.sql","utf8"),runner=readFileSync("scripts/test-eon-overview-db.ts","utf8");
describe("013 résznapos SQL coverage",()=>{
  it("naponként greatest(day_start, first_interval) határt használ",()=>{expect(sql).toContain("greatest(day_start,first_interval) expected_start");expect(sql).toContain("day_end-greatest(day_start,first_interval)")});
  it("a következő helyi napot date + integer művelettel, Budapest időzónában képezi",()=>{expect(sql).toContain("(d::date+1)::timestamp at time zone 'Europe/Budapest' day_end");expect(sql).not.toContain("(d+1)::date::timestamp")});
  it("az available számláló ugyanazon expected tartományra szűr",()=>{expect(sql).toContain("r.interval_start_utc>=d.expected_start");expect(sql).toContain("r.interval_start_utc<d.expected_end")});
  it("a coverage számlálója és nevezője a résznapos expected értéket használja",()=>{expect(sql).toContain("sum(least(expected,available))");expect(sql).toContain("sum(expected)")});
  it("a DB runner célzott, titokmentes szakaszkódot ad nyers stderr helyett",()=>{expect(runner).toContain('EON_OVERVIEW_DB_TEST_FAILED:${stage}');expect(runner).toContain('"RPC_OVERVIEW"');expect(runner).not.toContain("result.stderr")});
});
