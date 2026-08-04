import{timingSafeEqual}from"node:crypto";import{NextResponse}from"next/server";import{asGmailError,EonGmailError}from"./errors";
export const gmailNoStore={"Cache-Control":"private, no-store, max-age=0, must-revalidate"};
export const gmailFail=(raw:unknown)=>{const e=asGmailError(raw);return NextResponse.json({error:{code:e.code}},{status:e.status,headers:gmailNoStore})};
export function cronAuthorized(request:Request,secret=process.env.CRON_SECRET){const value=secret?.trim()??"";if(value.length<32||value==="[SENSITIVE]"||value.startsWith("YOUR_")||/[\r\n]/.test(secret??""))return false;const supplied=request.headers.get("authorization")??"",expected=`Bearer ${value}`,a=Buffer.from(supplied),b=Buffer.from(expected);return a.length===b.length&&timingSafeEqual(a,b)}
export const unauthorized=()=>gmailFail(new EonGmailError("EON_GMAIL_UNAUTHORIZED",401));
