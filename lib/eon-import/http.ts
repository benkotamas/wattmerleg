import{NextResponse}from"next/server";import{EonImportError,type EonImportErrorCode}from"./errors";import{EON_MAX_FILE_BYTES}from"./parser";
export const noStore={"Cache-Control":"private, no-store, max-age=0"};
export const fail=(error:unknown)=>{const safe=error instanceof EonImportError?error:new EonImportError("EON_IMPORT_FAILED",500);return NextResponse.json({error:{code:safe.code,message:safe.publicMessage()}},{status:safe.status,headers:noStore})};
export const accessFail=(access:string)=>fail(new EonImportError(access==="unauthorized"?"EON_UNAUTHORIZED":"EON_FORBIDDEN",access==="unauthorized"?401:403));
export const fileFrom=async(request:Request)=>{let form:FormData;try{form=await request.formData()}catch{throw new EonImportError("EON_INVALID_FILE_TYPE")}const file=form.get("file");if(!(file instanceof File)||!file.name.toLowerCase().endsWith(".xlsx"))throw new EonImportError("EON_INVALID_FILE_TYPE",415);if(file.size>EON_MAX_FILE_BYTES)throw new EonImportError("EON_FILE_TOO_LARGE",413);return{file,form,bytes:new Uint8Array(await file.arrayBuffer())}};
export type{EonImportErrorCode};
