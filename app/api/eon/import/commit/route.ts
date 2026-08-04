import { NextRequest,NextResponse } from "next/server";
import { eonImportContext } from "@/lib/eon-import/route-auth";
import { accessFail,fail,fileFrom,noStore } from "@/lib/eon-import/http";
import { EonImportError } from "@/lib/eon-import/errors";
import { importEonWorkbook } from "@/lib/eon-import/import-service";
import { createAdminClient } from "@/lib/supabase/admin";
export const runtime="nodejs";
export async function POST(request:NextRequest){
  const auth=await eonImportContext(); if(auth.access!=="allowed")return accessFail(auth.access);
  try{
    const {bytes,form}=await fileFrom(request),expected=form.get("expectedSha256"); if(typeof expected!=="string"||!/^[0-9a-f]{64}$/.test(expected))throw new EonImportError("EON_PREVIEW_HASH_MISMATCH");
    const admin=createAdminClient(); if(!admin)throw new EonImportError("EON_DATABASE_ERROR",503);
    const result=await importEonWorkbook({userId:auth.userId,bytes,source:"eon_portal_export",expectedSha256:expected,client:{rpc:(name,args)=>admin.rpc(name,args),findExistingHash:async(userId,hash)=>{const{data,error}=await admin.from("eon_import_batches").select("id").eq("user_id",userId).eq("attachment_sha256",hash).limit(1);return{exists:Boolean(data?.length),failed:Boolean(error)}}}});
    return NextResponse.json(result,{headers:noStore});
  }catch(error){return fail(error)}
}
