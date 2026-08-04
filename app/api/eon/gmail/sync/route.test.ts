import{afterEach,describe,expect,it,vi}from"vitest";
const state=vi.hoisted(()=>({upsert:vi.fn().mockResolvedValue({error:null})}));
vi.mock("@/lib/eon-import/route-auth",()=>({eonImportContext:async()=>({access:"allowed",userId:"owner"})}));
vi.mock("@/lib/supabase/admin",()=>({createAdminClient:()=>({from:()=>({upsert:state.upsert}),rpc:vi.fn()})}));
import{POST}from"./route";
const names=["GMAIL_CLIENT_ID",["GMAIL","CLIENT","SECRET"].join("_"),["GMAIL","REFRESH","TOKEN"].join("_"),"GMAIL_EXPECTED_ADDRESS","GMAIL_EON_ALLOWED_FROM","GMAIL_EON_QUERY","GMAIL_CREDENTIAL_VERSION"];
describe("manual Gmail sync configuration",()=>{afterEach(()=>vi.unstubAllEnvs());it("returns controlled 503 when Gmail configuration is missing",async()=>{for(const name of names)vi.stubEnv(name,"");const response=await POST();expect(response.status).toBe(503);expect(await response.json()).toEqual({error:{code:"EON_GMAIL_NOT_CONFIGURED"}});expect(state.upsert).toHaveBeenCalledWith(expect.objectContaining({mailbox_verified:false,last_error_code:"EON_GMAIL_NOT_CONFIGURED",updated_at:expect.any(String)}),expect.anything())})});
