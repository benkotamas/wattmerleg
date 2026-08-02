import "server-only";
import { NextResponse } from "next/server";
import { asGrowattError,growattHttpStatus } from "./errors";
export function growattErrorResponse(error:unknown){const safe=asGrowattError(error);return NextResponse.json({error:{code:safe.code,message:safe.message}},{status:growattHttpStatus(safe.code),headers:{"Cache-Control":"no-store"}})}
