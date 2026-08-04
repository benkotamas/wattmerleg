import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
const sql=readFileSync("supabase/migrations/011_eon_interval_import.sql","utf8"),admin=readFileSync("lib/supabase/admin.ts","utf8");
describe("E.ON 011 admin és integritási szerződés",()=>{
  it("az RPC explicit target usert és set-alapú rekordfeldolgozást használ",()=>{expect(sql).toMatch(/import_eon_interval_batch\(target_user_id uuid/);expect(sql).toContain("jsonb_to_recordset");expect(sql).toContain("on conflict(user_id,interval_start_utc)")});
  it("csak service_role hívhatja az admin RPC-t",()=>{expect(sql).toContain("revoke all on function public.import_eon_interval_batch(uuid,jsonb,jsonb) from public,anon,authenticated");expect(sql).toContain("grant execute on function public.import_eon_interval_batch(uuid,jsonb,jsonb) to service_role")});
  it("tartalmazza az új batch integritási ellenőrzéseket",()=>{for(const name of["eon_batch_period_order","eon_batch_has_rows","eon_batch_has_days","eon_batch_valid_raw","eon_batch_completed_at","eon_batch_warning_format"])expect(sql).toContain(name);expect(sql).not.toMatch(/status in \([^)]*failed/)});
  it("a service-role kliens server-only modul",()=>{expect(admin).toContain('import "server-only"');expect(admin).toContain("SUPABASE_SERVICE_ROLE_KEY");expect(admin).not.toContain("NEXT_PUBLIC_SUPABASE_SERVICE")});
});
