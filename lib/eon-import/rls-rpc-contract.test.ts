import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
const sql=readFileSync("supabase/migrations/011_eon_interval_import.sql","utf8");
describe("E.ON 011 végső RLS/RPC szerződés",()=>{
  it("authenticated számára csak saját SELECT policy marad",()=>{expect(sql.match(/create policy eon_[^;]+/g)).toEqual([expect.stringContaining("eon_batches_select_own"),expect.stringContaining("eon_intervals_select_own")]);expect(sql).toContain("revoke all on public.eon_import_batches,public.eon_interval_readings from anon,authenticated");expect(sql).toContain("grant select on public.eon_import_batches,public.eon_interval_readings to authenticated")});
  it("az RPC továbbra is csak service_role számára futtatható",()=>{expect(sql).toContain("from public,anon,authenticated");expect(sql).toContain("to service_role")});
  it("a batch feldolgozási számlálói kiadják a valid sorokat",()=>expect(sql).toContain("inserted_rows+updated_rows+unchanged_rows=valid_rows"));
  it("a warningokat mentés előtt egyedivé teszi",()=>expect(sql).toContain("array(select distinct jsonb_array_elements_text"));
  it("csak hash vagy external message egyezés emel ALREADY_IMPORTED hibát",()=>{expect(sql.match(/raise exception 'EON_ALREADY_IMPORTED'/g)).toHaveLength(2);expect(sql).not.toContain("exception when unique_violation")});
  it("a felhasználói lock megelőzi a duplikációvizsgálatot és minden hash-t sorosít",()=>{const lock=sql.indexOf("eon-import-user:"),hashCheck=sql.indexOf("attachment_sha256=batch->>'attachment_sha256'");expect(lock).toBeGreaterThan(0);expect(lock).toBeLessThan(hashCheck);expect(sql).not.toContain("target_user_id::text||':'||(batch->>'attachment_sha256')")});
  it("a mentett batchnek valódi időszaka, sora és napja van",()=>{expect(sql).toMatch(/period_start date not null/);expect(sql).toMatch(/period_end date not null/);expect(sql).toContain("raw_rows>0");expect(sql).toContain("complete_days+provisional_days+incomplete_days>0")});
});
